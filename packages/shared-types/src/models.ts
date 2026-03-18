// ============================================================
// Domain Models — Cortex Hub
// ============================================================

/** Knowledge item contributed by an agent and curated by admin */
export type KnowledgeItem = {
  id: string
  title: string
  content: string
  domain: string | null
  projectName: string | null
  contributedBy: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy: string | null
  qdrantPointId: string | null
  createdAt: string
  reviewedAt: string | null
}

/** Quality report submitted after an agent work session */
export type QualityReport = {
  id: string
  projectName: string
  agentName: string
  sessionId: string | null
  scoreBuild: number
  scoreRegression: number
  scoreStandards: number
  scoreTraceability: number
  scoreTotal: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  details: Record<string, unknown> | null
  createdAt: string
}

/** Session handoff between agents */
export type SessionHandoff = {
  id: string
  projectName: string
  fromAgent: string
  toAgent: string | null
  priority: 'critical' | 'high' | 'normal' | 'low'
  status: 'pending' | 'claimed' | 'completed' | 'expired'
  context: Record<string, unknown> | null
  summary: string
  claimedBy: string | null
  createdAt: string
  claimedAt: string | null
  completedAt: string | null
  expiresAt: string
}

/** Indexed Git repository */
export type IndexedRepo = {
  id: string
  adminId: string
  githubUrl: string
  repoName: string
  isPrivate: boolean
  clonePath: string | null
  status: 'pending' | 'indexing' | 'indexed' | 'error'
  lastIndexedAt: string | null
  symbolCount: number
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

/** Admin user (GitHub OAuth) */
export type AdminUser = {
  id: string
  githubId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  email: string | null
  createdAt: string
  updatedAt: string
}

/** API key for agent authentication */
export type ApiKey = {
  id: string
  adminId: string
  keyPrefix: string
  name: string
  agentName: string | null
  permissions: string[]
  rateLimit: number
  isActive: boolean
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/** Tool call log entry */
export type ToolLog = {
  id: string
  apiKeyId: string | null
  agentName: string
  toolName: string
  toolCategory: 'code' | 'memory' | 'knowledge' | 'quality' | 'session'
  latencyMs: number | null
  statusCode: number | null
  requestSize: number | null
  responseSize: number | null
  errorMessage: string | null
  createdAt: string
}
