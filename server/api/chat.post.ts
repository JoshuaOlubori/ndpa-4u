import { GoogleGenAI } from '@google/genai'
import { embedQuery } from '../utils/embeddings'
import { useDb } from '../utils/db'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DocMatch {
  path: string
  title: string
  heading: string
  content: string
}

const TOP_K = 5

export default defineEventHandler(async (event) => {
  const { geminiApiKey } = useRuntimeConfig()
  const { messages } = await readBody<{ messages: ChatMessage[] }>(event)

  if (!messages?.length) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey })
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''

  // --- Retrieval step: embed the question, find nearest doc chunks ---
  let contextBlock = ''
  try {
    const sql = useDb()
    const queryVector = await embedQuery(ai, lastUserMessage)
    const vectorLiteral = `[${queryVector.join(',')}]`

    const matches = await sql`
      SELECT path, title, heading, content
      FROM doc_embeddings
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${TOP_K}
    ` as DocMatch[]

    if (matches.length) {
      contextBlock = matches
        .map((m, i) => `[Source ${i + 1}: "${m.title}" — ${m.heading} (${m.path})]\n${m.content}`)
        .join('\n\n---\n\n')
    }
  } catch (err) {
    console.error('[chat] Retrieval failed, answering without context:', err)
  }

  const systemInstruction = contextBlock
    ? `You are a helpful assistant embedded in a documentation site. Answer the user's question using the documentation excerpts below whenever they're relevant. If the excerpts don't cover the question, say so honestly instead of guessing. Reference which source(s) informed your answer by path.

DOCUMENTATION EXCERPTS:
${contextBlock}`
    : 'You are a helpful assistant embedded in a documentation site. Answer clearly and concisely.'

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const res = event.node.res

  try {
    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.1-flash-lite-preview',
      contents,
      config: { systemInstruction },
    })

    for await (const chunk of stream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`)
      }
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'Stream error' })}\n\n`)
  } finally {
    res.write('data: [DONE]\n\n')
    res.end()
  }
})