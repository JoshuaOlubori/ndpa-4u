# NDPA-4U — AI-Assisted Documentation for the Nigeria Data Protection Act 2023

A documentation site for the Nigeria Data Protection Act (NDPA) 2023, augmented with a custom retrieval-augmented generation (RAG) chat assistant — built to make a dense piece of legislation navigable, with grounded, cited answers.

**Live:** [ndpa-4u.vercel.app](https://ndpa-4u.vercel.app)

---

## Why this exists

Legal and regulatory text is long, cross-referenced, and hard to search by keyword alone. Rather than shipping a plain documentation site, this project pairs the full text of the NDPA 2023 with an AI assistant that reads the *actual* source material before answering: every response is grounded in retrieved excerpts from the Act itself, with clickable citations back to the exact section.

## Key features

- **Grounded Q&A, not hallucination-prone chat.** Every question is answered against semantically retrieved excerpts from the Act. The model is instructed to say so honestly when the retrieved content doesn't cover a question, rather than guess.
- **Inline, in-context chat placement.** The assistant sits directly between a page's title and its body content, so users can ask questions about a specific section while reading it — not a bolted-on floating widget disconnected from context.
- **Clickable source citations.** Answers link straight back to the relevant page (e.g. *"[Objectives](/objectives-and-application/objectives)"*), turning the assistant into a navigation aid, not just a Q&A box.
- **Real-time streaming responses** over server-sent events, for a responsive, low-latency feel.
- **Incremental embedding pipeline.** Content is chunked and embedded at build time, hashed per-file, and only re-embedded when the underlying document actually changes — keeping rebuild cost and API usage minimal as the docs evolve.

## Architecture

```
Build time
──────────
content/*.md ──▶ chunk by section ──▶ Gemini embeddings ──▶ Neon (pgvector)
                                          (hash-gated: unchanged
                                           files are skipped)

Request time
─────────────
user question ──▶ embed query ──▶ cosine similarity search (top-K)
                                          │
                                          ▼
                          inject matched excerpts into system prompt
                                          │
                                          ▼
                        Gemini streaming generation ──▶ SSE ──▶ chat UI
```

**Stack**

| Layer | Choice |
|---|---|
| Framework | Nuxt 4 + Docus (content-first, Nuxt Content-based) |
| Language model & embeddings | Google Gemini API (`gemini-embedding-001` for retrieval, streaming generation for answers) |
| Vector store | Neon Postgres + `pgvector`, queried via `@neondatabase/serverless` |
| Hosting | Vercel |
| UI | Vue 3, Nuxt UI |

## Engineering notes worth mentioning

A few decisions that came out of building this deliberately, not by default:

- **Chose a standalone chat implementation over patching the framework's built-in assistant.** Docus ships its own AI Gateway–coupled assistant, but wiring it to a different model provider meant depending on undocumented internals (overriding a programmatically-registered server route). Building a dedicated component and API route instead kept the system simple, debuggable, and independent of framework internals that could shift without notice.
- **Manual query/document embedding normalization.** `gemini-embedding-001` requires L2-normalizing output vectors when using a reduced dimensionality — applied consistently on both the indexing and query side to keep cosine similarity ranking correct.
- **Content-hash-gated incremental re-embedding**, so a build only pays the embedding-API cost for documents that actually changed, rather than re-embedding the entire corpus on every deploy.
- **Root-relative citation links** rather than manually reconstructing an origin from `window.location` — a small choice, but one that keeps citation links correct across local dev, preview deployments, and production without extra logic.

## Running locally

```bash
npm install
```

Create `.env`:
```
GEMINI_API_KEY=your-gemini-api-key
DATABASE_URL=postgres://user:pass@your-neon-host/neondb?sslmode=require
```

Generate embeddings for the current content, then start the dev server:
```bash
npm run embeddings
npm run dev
```

`npm run build` regenerates embeddings (incrementally) as part of the production build, so deployments always reflect the latest content.

## Project structure

```
content/                    # NDPA 2023 text, organized by section
app/
  components/ChatAssistant.vue     # chat UI
  composables/useGeminiChat.ts     # streaming state management
  pages/[[lang]]/[...slug].vue     # docs page, with chat mounted between header and body
server/
  api/chat.post.ts           # retrieval + streaming generation endpoint
  utils/db.ts                # Neon client
  utils/embeddings.ts        # query embedding helper
scripts/
  generate-embeddings.mjs    # build-time chunking + embedding pipeline
```

---

Built by [Joshua Olubori](https://github.com/JoshuaOlubori).