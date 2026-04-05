import Database, { Database as SqliteDatabase } from 'better-sqlite3'
import { join } from 'path'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'cortex.db')
const dbDir = dirname(dbPath)

if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true })
}

const db: SqliteDatabase = new Database(dbPath, { 
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined 
})

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL')

// Initialize schema — resolve relative to THIS file, not cwd()
const schemaPath = join(__dirname, 'schema.sql')
const schemaStr = readFileSync(schemaPath, 'utf-8')
db.exec(schemaStr)

// Safe migrations for early schema changes without drop
try {
  db.exec('ALTER TABLE projects ADD COLUMN git_username TEXT')
} catch (e) { /* ignore if exists */ }

try {
  db.exec('ALTER TABLE projects ADD COLUMN git_token TEXT')
} catch (e) { /* ignore if exists */ }

// Conductor Phase 1v2: session identity columns
const sessionIdentityCols = [
  'ALTER TABLE session_handoffs ADD COLUMN hostname TEXT',
  'ALTER TABLE session_handoffs ADD COLUMN os TEXT',
  'ALTER TABLE session_handoffs ADD COLUMN ide TEXT',
  'ALTER TABLE session_handoffs ADD COLUMN branch TEXT',
  'ALTER TABLE session_handoffs ADD COLUMN capabilities TEXT DEFAULT \'[]\'',
  'ALTER TABLE session_handoffs ADD COLUMN role TEXT',
  "ALTER TABLE session_handoffs ADD COLUMN last_activity TEXT DEFAULT (datetime('now'))",
]
for (const sql of sessionIdentityCols) {
  try { db.exec(sql) } catch (e) { /* ignore if column exists */ }
}
// Knowledge evolution: quality counters + lineage metadata (OpenSpace-inspired)
const knowledgeEvolutionCols = [
  'ALTER TABLE knowledge_documents ADD COLUMN selection_count INTEGER DEFAULT 0',
  'ALTER TABLE knowledge_documents ADD COLUMN applied_count INTEGER DEFAULT 0',
  'ALTER TABLE knowledge_documents ADD COLUMN completion_count INTEGER DEFAULT 0',
  'ALTER TABLE knowledge_documents ADD COLUMN fallback_count INTEGER DEFAULT 0',
  "ALTER TABLE knowledge_documents ADD COLUMN origin TEXT DEFAULT 'manual'",
  'ALTER TABLE knowledge_documents ADD COLUMN generation INTEGER DEFAULT 0',
  'ALTER TABLE knowledge_documents ADD COLUMN source_task_id TEXT',
  'ALTER TABLE knowledge_documents ADD COLUMN created_by_agent TEXT',
  "ALTER TABLE knowledge_documents ADD COLUMN category TEXT DEFAULT 'general'",
]
for (const sql of knowledgeEvolutionCols) {
  try { db.exec(sql) } catch (e) { /* ignore if column exists */ }
}

// v1.1: index_jobs — commit tracking, mem9, docs knowledge
const indexJobsExtraCols = [
  'ALTER TABLE index_jobs ADD COLUMN commit_hash TEXT',
  'ALTER TABLE index_jobs ADD COLUMN commit_message TEXT',
  'ALTER TABLE index_jobs ADD COLUMN triggered_by TEXT',
  'ALTER TABLE index_jobs ADD COLUMN mem9_status TEXT',
  'ALTER TABLE index_jobs ADD COLUMN mem9_chunks INTEGER DEFAULT 0',
  'ALTER TABLE index_jobs ADD COLUMN mem9_progress INTEGER DEFAULT 0',
  'ALTER TABLE index_jobs ADD COLUMN mem9_total_chunks INTEGER DEFAULT 0',
  'ALTER TABLE index_jobs ADD COLUMN docs_knowledge_status TEXT',
  'ALTER TABLE index_jobs ADD COLUMN docs_knowledge_count INTEGER DEFAULT 0',
]
for (const sql of indexJobsExtraCols) {
  try { db.exec(sql) } catch (e) { /* ignore if column exists */ }
}

// ── query_logs: add analytics columns ──
const queryLogsExtraCols = [
  'ALTER TABLE query_logs ADD COLUMN input_size INTEGER DEFAULT 0',
  'ALTER TABLE query_logs ADD COLUMN output_size INTEGER DEFAULT 0',
  'ALTER TABLE query_logs ADD COLUMN compute_tokens INTEGER DEFAULT 0',
  'ALTER TABLE query_logs ADD COLUMN compute_model TEXT',
]
for (const sql of queryLogsExtraCols) {
  try { db.exec(sql) } catch (e) { /* ignore if column exists */ }
}

// ── agent_ack: table for tracking agent change awareness ──
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_ack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      last_seen_event_id TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(agent_id, project_id)
    )
  `)
} catch (e) { /* ignore if table exists */ }

// ── change_events: table for tracking code changes ──
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS change_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      agent_id TEXT,
      commit_sha TEXT,
      commit_message TEXT,
      files_changed TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `)
} catch (e) { /* ignore if table exists */ }

// Update index_jobs table definition in schema.sql to include new columns
// (tracked in schema.sql DDL directly — no migration needed for fresh installs)

if (existsSync(schemaPath)) {
  const schema = readFileSync(schemaPath, 'utf8')
  db.exec(schema)
}

export { db }
