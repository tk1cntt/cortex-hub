/**
 * mem9 history — SQLite audit trail for memory operations
 *
 * Tracks all ADD/UPDATE/DELETE events for debugging and usage analytics.
 * Uses the same better-sqlite3 instance as the dashboard API.
 */

import type { MemoryEventType, HistoryEntry } from './types.js'

/**
 * Minimal SQLite interface (compatible with better-sqlite3)
 * Passed in from the dashboard API to avoid duplicating the dependency.
 */
export interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): void
    all(...params: unknown[]): unknown[]
  }
}

export class HistoryStore {
  constructor(private readonly db: SqliteDb) {
    this.init()
  }

  /** Create the history table if it doesn't exist */
  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mem9_history (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        event TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        user_id TEXT NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        provider TEXT DEFAULT '',
        timestamp TEXT NOT NULL
      )
    `)
  }

  /** Record a memory operation */
  record(entry: {
    memoryId: string
    event: MemoryEventType
    oldValue?: string
    newValue?: string
    userId: string
    tokensUsed?: number
    provider?: string
  }): void {
    const id = crypto.randomUUID()
    this.db.prepare(`
      INSERT INTO mem9_history (id, memory_id, event, old_value, new_value, user_id, tokens_used, provider, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.memoryId,
      entry.event,
      entry.oldValue ?? null,
      entry.newValue ?? null,
      entry.userId,
      entry.tokensUsed ?? 0,
      entry.provider ?? '',
      new Date().toISOString(),
    )
  }

  /** Get recent history entries */
  getRecent(limit = 50): HistoryEntry[] {
    return this.db.prepare(`
      SELECT id, memory_id as memoryId, event, old_value as oldValue,
             new_value as newValue, user_id as userId, timestamp
      FROM mem9_history
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as HistoryEntry[]
  }

  /** Get usage stats for a time period */
  getUsageStats(days = 30): {
    totalEvents: number
    totalTokens: number
    byProvider: Array<{ provider: string; tokens: number; count: number }>
    byEvent: Array<{ event: string; count: number }>
  } {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const totals = this.db.prepare(`
      SELECT COUNT(*) as totalEvents, COALESCE(SUM(tokens_used), 0) as totalTokens
      FROM mem9_history WHERE timestamp > ?
    `).all(since) as Array<{ totalEvents: number; totalTokens: number }>

    const byProvider = this.db.prepare(`
      SELECT provider, COALESCE(SUM(tokens_used), 0) as tokens, COUNT(*) as count
      FROM mem9_history WHERE timestamp > ?
      GROUP BY provider
    `).all(since) as Array<{ provider: string; tokens: number; count: number }>

    const byEvent = this.db.prepare(`
      SELECT event, COUNT(*) as count
      FROM mem9_history WHERE timestamp > ?
      GROUP BY event
    `).all(since) as Array<{ event: string; count: number }>

    return {
      totalEvents: totals[0]?.totalEvents ?? 0,
      totalTokens: totals[0]?.totalTokens ?? 0,
      byProvider,
      byEvent,
    }
  }
}
