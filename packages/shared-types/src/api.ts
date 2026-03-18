// ============================================================
// API Request/Response Contracts — Cortex Hub
// ============================================================

/** Standard API response wrapper */
export type ApiResponse<T> = {
  success: boolean
  data: T
  error: string | null
  meta?: {
    page: number
    perPage: number
    total: number
  }
}

/** Health check response */
export type HealthStatus = {
  status: 'healthy' | 'degraded' | 'down'
  services: {
    name: string
    status: 'up' | 'down' | 'unknown'
    latencyMs: number | null
    lastCheckedAt: string
  }[]
  version: string
  uptime: number
}

/** Create API key request */
export type CreateApiKeyRequest = {
  name: string
  agentName?: string
  permissions?: string[]
  rateLimit?: number
}

/** Create API key response — includes the raw key (shown only once) */
export type CreateApiKeyResponse = {
  id: string
  key: string
  keyPrefix: string
  name: string
  agentName: string | null
  permissions: string[]
  rateLimit: number
  createdAt: string
}

/** Import repo request */
export type ImportRepoRequest = {
  githubUrl: string
  isPrivate?: boolean
}

/** Log query filters */
export type LogQueryFilters = {
  agentName?: string
  toolName?: string
  toolCategory?: string
  statusCode?: number
  since?: string
  until?: string
  page?: number
  perPage?: number
}

/** Quality trend data point */
export type QualityTrendPoint = {
  date: string
  scoreTotal: number
  grade: string
  agentName: string
}
