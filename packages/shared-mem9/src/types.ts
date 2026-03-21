/**
 * mem9 — Cortex Memory Engine types
 *
 * @module @cortex/shared-mem9
 */

/* ── Configuration ───────────────────────────────────────── */

export interface LlmConfig {
  /** CLIProxy base URL (e.g. http://llm-proxy:8317/v1) */
  baseUrl: string
  /** Model for fact extraction & dedup (e.g. gpt-5.4-mini) */
  model: string
}

export interface EmbedderConfig {
  /** Embedding provider */
  provider: 'gemini' | 'openai'
  /** API key for the embedding provider */
  apiKey: string
  /** Model name (e.g. gemini-embedding-2-preview) */
  model: string
  /** Dimensions override (leave undefined for provider default) */
  dimensions?: number
}

export interface VectorStoreConfig {
  /** Qdrant base URL (e.g. http://qdrant:6333) */
  url: string
  /** Collection name */
  collection: string
}

export interface Mem9Config {
  llm: LlmConfig
  embedder: EmbedderConfig
  vectorStore: VectorStoreConfig
}

/* ── Memory Items ────────────────────────────────────────── */

export interface MemoryItem {
  id: string
  memory: string
  hash: string
  userId?: string
  agentId?: string
  metadata?: Record<string, unknown>
  score?: number
  createdAt: string
  updatedAt: string
}

/* ── Request / Response ──────────────────────────────────── */

export interface AddRequest {
  messages: Array<{ role: string; content: string }>
  userId: string
  agentId?: string
  metadata?: Record<string, unknown>
}

export type MemoryEventType = 'ADD' | 'UPDATE' | 'DELETE' | 'NONE'

export interface MemoryEvent {
  type: MemoryEventType
  memoryId: string
  oldMemory?: string
  newMemory?: string
}

export interface AddResult {
  events: MemoryEvent[]
  /** Number of LLM tokens consumed */
  tokensUsed: number
}

export interface SearchRequest {
  query: string
  userId: string
  agentId?: string
  limit?: number
}

export interface SearchResult {
  memories: MemoryItem[]
  /** Number of embedding tokens consumed */
  tokensUsed: number
}

export interface GetAllRequest {
  userId: string
  agentId?: string
  limit?: number
}

/* ── Qdrant REST types ───────────────────────────────────── */

export interface QdrantPoint {
  id: string
  vector?: number[]
  payload: Record<string, unknown>
  score?: number
}

export interface QdrantSearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

/* ── History ─────────────────────────────────────────────── */

export interface HistoryEntry {
  id: string
  memoryId: string
  event: MemoryEventType
  oldValue?: string
  newValue?: string
  userId: string
  timestamp: string
}
