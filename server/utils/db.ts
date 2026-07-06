import { neon } from '@neondatabase/serverless'

let client: ReturnType<typeof neon> | null = null

export function useDb() {
  if (!client) {
    const { databaseUrl } = useRuntimeConfig()
    client = neon(databaseUrl)
  }
  return client
}