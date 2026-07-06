import { GoogleGenAI } from '@google/genai'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default defineEventHandler(async (event) => {
  const { geminiApiKey } = useRuntimeConfig()
  const { messages } = await readBody<{ messages: ChatMessage[] }>(event)

  if (!messages?.length) {
    throw createError({ statusCode: 400, statusMessage: 'messages is required' })
  }

  const ai = new GoogleGenAI({ apiKey: geminiApiKey })

  // Gemini expects role "model" instead of "assistant"
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
      config: {
        systemInstruction:
          'You are a helpful assistant embedded in a documentation site. Answer clearly and concisely based on the docs context the user is reading.',
      },
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