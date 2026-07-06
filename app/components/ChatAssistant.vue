<script setup lang="ts">
const { t, locale } = useDocusI18n()
const { messages, input, isLoading, error, sendMessage, reset } = useGeminiChat()

const suggestedQuestionsMap: Record<string, string[]> = {
  en: [
    'What are the primary objectives of the Nigeria Data Protection Act 2023?',
    'What rights do I have as a data subject?',
    'What are the penalties for violating the Act?',
    'What is a Data Privacy Impact Assessment?',
  ],
  fr: [
    'Quels sont les objectifs principaux de la loi sur la protection des données du Nigeria 2023?',
    'Quels sont mes droits en tant que sujet de données?',
    'Quelles sont les sanctions en cas de violation de la loi?',
    'Qu\'est-ce qu\'une évaluation d\'impact sur la protection des données?',
  ],
}

const suggestedQuestions = computed(() => suggestedQuestionsMap[locale.value] || suggestedQuestionsMap.en)

function handleSubmit(event?: Event) {
  event?.preventDefault()
  sendMessage()
}

function askQuestion(question: string) {
  input.value = question
  sendMessage()
}

const formattedMessages = computed(() =>
  messages.value.map(msg => ({
    id: msg.id,
    role: msg.role,
    parts: msg.content ? [{ type: 'text', text: msg.content }] : [],
  })),
)

const status = computed(() => (isLoading.value ? 'streaming' : 'idle'))
const lastMessage = computed(() => formattedMessages.value.at(-1))
const showThinking = computed(() =>
  isLoading.value
  && lastMessage.value?.role === 'assistant'
  && (!lastMessage.value?.parts?.length || !lastMessage.value.parts[0].text),
)
</script>

<template>
  <div class="w-full flex flex-col py-8">
    <!-- Empty state -->
    <div v-if="messages.length === 0" class="flex flex-col items-center py-6">
      <div class="size-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <UIcon name="i-lucide-sparkles" class="size-6 text-primary" />
      </div>
      <p class="text-base text-muted mb-6">
        {{ t('assistant.tryAsking') }}
      </p>
      <div class="flex flex-wrap gap-3 justify-center max-w-2xl mb-8">
        <button
          v-for="question in suggestedQuestions"
          :key="question"
          class="px-4 py-2 text-sm text-toned bg-transparent border border-default hover:bg-elevated rounded-full transition-colors cursor-pointer whitespace-nowrap"
          @click="askQuestion(question)"
        >
          {{ question }}
        </button>
      </div>
    </div>

    <!-- Messages -->
    <UChatMessages
      v-else
      should-auto-scroll
      :messages="formattedMessages"
      compact
      :status="status"
      :user="{ ui: { content: 'text-sm' } }"
      :ui="{ indicator: '*:bg-accented', root: 'h-auto!' }"
      class="pb-6"
    >
      <template #content="{ message }">
        <div class="flex flex-col gap-2">
          <div
            v-if="message.role === 'assistant' && showThinking && message.id === lastMessage?.id"
            class="flex items-center gap-2 text-sm text-muted"
          >
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            <span>Thinking...</span>
          </div>
          <template v-for="(part, index) in message.parts" :key="`${message.id}-${part.type}-${index}`">
            <MDCCached
              v-if="part.type === 'text' && part.text"
              :value="part.text"
              :cache-key="`chat-${message.id}-${index}`"
              :parser-options="{ highlight: false }"
              class="*:first:mt-0 *:last:mb-0"
            />
          </template>
        </div>
      </template>
    </UChatMessages>

    <!-- Error -->
    <div
      v-if="error"
      class="px-4 py-2 mb-4 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg"
    >
      {{ error.message }}
    </div>

    <!-- Input -->
    <form class="flex items-center gap-3" @submit.prevent="handleSubmit">
      <UInput
        v-model="input"
        :placeholder="t('assistant.askAnything')"
        size="xl"
        class="flex-1"
        :ui="{ base: 'rounded-xl bg-elevated/50 px-4' }"
        @keydown.enter.exact.prevent="handleSubmit"
      />
      <div class="flex items-center gap-1 shrink-0">
        <UButton
          v-if="messages.length"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="md"
          @click="reset"
        />
        <UButton
          type="submit"
          icon="i-lucide-arrow-up"
          color="primary"
          size="md"
          class="rounded-full size-10 justify-center"
          :disabled="!input.trim() || isLoading"
          :loading="isLoading"
        />
      </div>
    </form>

    <!-- Separator before page content -->
    <div class="mt-8 border-b border-default" />
  </div>
</template>