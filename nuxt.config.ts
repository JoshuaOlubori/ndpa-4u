export default defineNuxtConfig({
  extends: ['docus'],
  runtimeConfig: {
    geminiApiKey: process.env.GEMINI_API_KEY,
  },
})