import { createHash, randomBytes, randomUUID } from 'node:crypto'

/**
 * Generate a new API key with a cortex_ prefix.
 * Returns both the raw key (show once) and its SHA-256 hash (store).
 */
export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const raw = randomBytes(32).toString('base64url')
  const key = `cortex_${raw}`
  const keyHash = createHash('sha256').update(key).digest('hex')
  const keyPrefix = key.slice(0, 15)
  return { key, keyHash, keyPrefix }
}

/** Hash an API key for comparison against stored hashes */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** Generate a UUID v4 */
export function generateId(): string {
  return randomUUID()
}
