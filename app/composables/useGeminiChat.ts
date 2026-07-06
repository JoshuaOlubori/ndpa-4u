export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function useGeminiChat() {
  const messages = ref<ChatMessage[]>([])
  const input = ref('')
  const isLoading = ref(false)
  const error = ref<Error | null>(null)

  const genId = () => Math.random().toString(36).slice(2)

  async function sendMessage() {
    const text = input.value.trim()
    if (!text || isLoading.value) return

    error.value = null
    messages.value.push({ id: genId(), role: 'user', content: text })
    input.value = ''

    const assistantId = genId()
    messages.value.push({ id: assistantId, role: 'assistant', content: '' })
    isLoading.value = true

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.value
            .filter(m => m.id !== assistantId)
            .map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!response.ok || !response.body) throw new Error(`Request failed: ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.replace(/^data:\s*/, '').trim()
          if (!line || line === '[DONE]') continue

          const parsed = JSON.parse(line)
          if (parsed.error) throw new Error(parsed.error)
          if (parsed.text) {
            const target = messages.value.find(m => m.id === assistantId)
            if (target) target.content += parsed.text
          }
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err : new Error('Something went wrong')
      messages.value = messages.value.filter(m => m.id !== assistantId || m.content)
    } finally {
      isLoading.value = false
    }
  }

  function reset() {
    messages.value = []
    error.value = null
  }

  return { messages, input, isLoading, error, sendMessage, reset }
}