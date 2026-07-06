import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { neon } from "@neondatabase/serverless";
import matter from "gray-matter";

try {
  process.loadEnvFile?.(".env");
} catch {}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

if (!GEMINI_API_KEY || !DATABASE_URL) {
  console.warn(
    "[embeddings] GEMINI_API_KEY or DATABASE_URL missing — skipping.",
  );
  process.exit(0);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "..", "content");

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const sql = neon(DATABASE_URL);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// content/1.getting-started/2.introduction.md -> /getting-started/introduction
function toRoutePath(filePath) {
  const rel = path
    .relative(CONTENT_DIR, filePath)
    .replace(/\\/g, "/")
    .replace(/\.md$/, "")
    .split("/")
    .map((segment) => segment.replace(/^\d+\./, ""))
    .join("/");
  const clean = rel.replace(/\/index$/, "").replace(/^index$/, "");
  return "/" + clean;
}

// Falls back to a Title Case version of the filename slug when a page has
// no frontmatter title — mirrors how Nuxt Content derives titles by default.
function humanizeSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function cleanMarkdown(raw) {
  return raw
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^:{2,}/.test(trimmed)) return false; // ::component / :::card markers
      if (/^#[a-zA-Z][\w-]*$/.test(trimmed)) return false; // #title, #description, #links slot names
      return true;
    })
    .join("\n");
}

function chunkMarkdown(markdown, maxChars = 1200, overlap = 150) {
  const lines = markdown.split("\n");
  const sections = [];
  let current = { heading: null, lines: [] };

  for (const line of lines) {
    if (/^#{2,3}\s+/.test(line)) {
      if (current.lines.some((l) => l.trim())) sections.push(current);
      current = {
        heading: line.replace(/^#{2,3}\s+/, "").trim(),
        lines: [line],
      };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim())) sections.push(current);

  const chunks = [];
  for (const section of sections) {
    const text = section.lines.join("\n").trim();
    if (!text) continue;
    if (text.length <= maxChars) {
      chunks.push({ heading: section.heading, text });
      continue;
    }
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      chunks.push({
        heading: section.heading,
        text: text.slice(start, end).trim(),
      });
      if (end === text.length) break;
      start = end - overlap;
    }
  }
  return chunks;
}

function normalize(vec) {
  // gemini-embedding-001 requires manual L2 normalization when using
  // output_dimensionality other than the native 3072
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return norm === 0 ? vec : vec.map((v) => v / norm);
}

async function embed(text, taskType) {
  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  return normalize(result.embeddings[0].values);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("[embeddings] Ensuring schema...");
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
  CREATE TABLE IF NOT EXISTS doc_embeddings (
    id SERIAL PRIMARY KEY,
    path TEXT NOT NULL,
    title TEXT,
    heading TEXT,
    content TEXT NOT NULL,
    embedding VECTOR(768) NOT NULL, -- keep in sync with EMBEDDING_DIMENSIONS above
    created_at TIMESTAMPTZ DEFAULT now()
  )
`;
  await sql`
    CREATE TABLE IF NOT EXISTS doc_file_hashes (
      path TEXT PRIMARY KEY,
      hash TEXT NOT NULL
    )
  `;

  const files = walk(CONTENT_DIR);
  console.log(`[embeddings] Found ${files.length} content files`);

  const currentPaths = new Set();
  let embeddedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    const routePath = toRoutePath(file);
    currentPaths.add(routePath);
    const hash = crypto.createHash("sha256").update(raw).digest("hex");

    const [existing] =
      await sql`SELECT hash FROM doc_file_hashes WHERE path = ${routePath}`;

    if (existing?.hash === hash) {
      skippedCount++;
      continue; // content unchanged since last build - skip re-embedding
    }

    const { data: frontmatter, content } = matter(raw);
    const lastSegment = routePath.split("/").filter(Boolean).pop() || "";
    const pageTitle = frontmatter.title || humanizeSlug(lastSegment);

    const cleaned = cleanMarkdown(content);
    const chunks = chunkMarkdown(cleaned).filter((c) => c.text.length >= 20);

    await sql`DELETE FROM doc_embeddings WHERE path = ${routePath}`;

    for (const chunk of chunks) {
      const textForEmbedding = `${pageTitle}\n${chunk.heading || ""}\n${chunk.text}`;
      const vector = await embed(textForEmbedding, "RETRIEVAL_DOCUMENT");
      const vectorLiteral = `[${vector.join(",")}]`;

      await sql`
        INSERT INTO doc_embeddings (path, title, heading, content, embedding)
        VALUES (${routePath}, ${pageTitle}, ${chunk.heading || pageTitle}, ${chunk.text}, ${vectorLiteral}::vector)
      `;
      await sleep(120); // stay comfortably under embedding rate limits
    }

    await sql`
      INSERT INTO doc_file_hashes (path, hash) VALUES (${routePath}, ${hash})
      ON CONFLICT (path) DO UPDATE SET hash = EXCLUDED.hash
    `;

    embeddedCount++;
    console.log(
      `[embeddings] Re-embedded ${routePath} (${chunks.length} chunks)`,
    );
  }

  // clean up embeddings for files that no longer exist
  const staleHashes = await sql`SELECT path FROM doc_file_hashes`;
  for (const { path: staleFilePath } of staleHashes) {
    if (!currentPaths.has(staleFilePath)) {
      await sql`DELETE FROM doc_embeddings WHERE path = ${staleFilePath}`;
      await sql`DELETE FROM doc_file_hashes WHERE path = ${staleFilePath}`;
      console.log(`[embeddings] Removed stale content: ${staleFilePath}`);
    }
  }

  console.log(
    `[embeddings] Done. ${embeddedCount} files re-embedded, ${skippedCount} unchanged.`,
  );
}

main().catch((err) => {
  console.error("[embeddings] Failed:", err);
  process.exit(1);
});