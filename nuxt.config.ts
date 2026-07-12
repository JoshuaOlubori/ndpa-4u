export default defineNuxtConfig({
  extends: ['docus'],
  runtimeConfig: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    databaseUrl: process.env.DATABASE_URL,
  },
   modules: ['@vercel/analytics']
})
