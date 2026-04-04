-- Cortex Hub v1 — SQLite WAL mode
-- Active schema — all tables used by dashboard-api

-- ============================================================
-- Admin Users (GitHub OAuth)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_user (
    id           TEXT PRIMARY KEY,
    github_id    TEXT UNIQUE NOT NULL,
    username     TEXT NOT NULL,
    display_name TEXT,
    avatar_url   TEXT,
    email        TEXT,
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ============================================================
-- Setup Status
-- ============================================================
CREATE TABLE IF NOT EXISTS setup_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    completed BOOLEAN DEFAULT 0,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,       -- prefix + short random
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,    -- sha256 hash of the actual key
    scope TEXT NOT NULL,       -- e.g., 'all', 'knowledge', 'hub'
    permissions TEXT,          -- JSON string of permissions
    project_id TEXT,           -- optional scope to a project
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS query_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    params TEXT,
    latency_ms INTEGER,
    status TEXT DEFAULT 'ok',
    error TEXT,
    project_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_handoffs (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT,
    project TEXT NOT NULL,
    task_summary TEXT NOT NULL,
    context TEXT NOT NULL,           -- JSON
    priority INTEGER DEFAULT 5,
    status TEXT DEFAULT 'pending',
    claimed_by TEXT,
    project_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT
);

-- ── Organizations ──
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- ── Projects ──
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    git_repo_url TEXT,
    git_provider TEXT,              -- 'github', 'gitlab', 'bitbucket', 'azure', 'local'
    git_username TEXT,
    git_token TEXT,
    indexed_at TEXT,
    indexed_symbols INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(org_id, slug)
);

-- ── Index Jobs ──
CREATE TABLE IF NOT EXISTS index_jobs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    branch TEXT DEFAULT 'main',
    status TEXT DEFAULT 'pending',       -- pending | cloning | analyzing | ingesting | done | error
    progress INTEGER DEFAULT 0,          -- 0-100
    total_files INTEGER DEFAULT 0,
    symbols_found INTEGER DEFAULT 0,
    log TEXT,                             -- stdout/stderr from gitnexus
    error TEXT,
    commit_hash TEXT,                     -- short git commit hash
    commit_message TEXT,                  -- commit message (first 200 chars)
    triggered_by TEXT,                    -- 'manual', 'webhook', 'setup'
    mem9_status TEXT,                     -- pending | embedding | done | error
    mem9_chunks INTEGER DEFAULT 0,        -- number of chunks embedded
    mem9_progress INTEGER DEFAULT 0,      -- 0-100 for embedding progress
    mem9_total_chunks INTEGER DEFAULT 0,  -- total chunks to embed
    docs_knowledge_status TEXT,           -- pending | building | done | error
    docs_knowledge_count INTEGER DEFAULT 0, -- number of docs knowledge entries
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- ── Usage Logs ──
CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    project_id TEXT,
    request_type TEXT DEFAULT 'chat',  -- 'chat', 'embedding', 'tool'
    created_at TEXT DEFAULT (datetime('now'))
);

-- ── Conductor Tasks ──
CREATE TABLE IF NOT EXISTS conductor_tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    project_id TEXT,
    parent_task_id TEXT,
    created_by_agent TEXT,
    assigned_to_agent TEXT,
    assigned_session_id TEXT,
    status TEXT DEFAULT 'pending'
        CHECK(status IN ('pending','blocked','assigned','accepted','in_progress','analyzing','strategy_review','synthesis','discussion','review','approved','rejected','completed','failed','cancelled')),
    priority INTEGER DEFAULT 5,
    required_capabilities TEXT DEFAULT '[]',
    depends_on TEXT DEFAULT '[]',
    notify_on_complete TEXT DEFAULT '[]',
    notified_agents TEXT DEFAULT '[]',
    context TEXT DEFAULT '{}',
    result TEXT,
    completed_by TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    assigned_at TEXT,
    accepted_at TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_conductor_tasks_assigned ON conductor_tasks(assigned_to_agent, status);
CREATE INDEX IF NOT EXISTS idx_conductor_tasks_status ON conductor_tasks(status);
CREATE INDEX IF NOT EXISTS idx_conductor_tasks_parent ON conductor_tasks(parent_task_id);

CREATE TABLE IF NOT EXISTS conductor_task_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    agent_id TEXT,
    action TEXT NOT NULL,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conductor_task_logs_task ON conductor_task_logs(task_id);

-- ── Conductor Comments ──
CREATE TABLE IF NOT EXISTS conductor_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,
    finding_id TEXT,
    agent_id TEXT,
    comment TEXT NOT NULL,
    comment_type TEXT DEFAULT 'comment'
        CHECK(comment_type IN ('comment', 'agree', 'disagree', 'amendment')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conductor_comments_task ON conductor_comments(task_id);

-- ── Hub Configuration ──
CREATE TABLE IF NOT EXISTS hub_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert defaults
INSERT OR IGNORE INTO hub_config (key, value) VALUES ('hub_name', 'Cortex Hub');
INSERT OR IGNORE INTO hub_config (key, value) VALUES ('hub_description', 'Self-hosted MCP Intelligence Platform');

-- ── Notification Preferences ──
CREATE TABLE IF NOT EXISTS notification_preferences (
    key TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO notification_preferences (key, enabled) VALUES ('agent_disconnect', 1);
INSERT OR IGNORE INTO notification_preferences (key, enabled) VALUES ('quality_gate_failure', 1);
INSERT OR IGNORE INTO notification_preferences (key, enabled) VALUES ('task_assignment', 1);
INSERT OR IGNORE INTO notification_preferences (key, enabled) VALUES ('session_handoff', 1);

-- ── Knowledge Documents (Vector-searchable knowledge base) ──
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    source_agent_id TEXT,
    project_id TEXT,
    tags TEXT DEFAULT '[]',
    content_preview TEXT,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
        CHECK(status IN ('active', 'archived', 'deprecated')),
    hit_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    selection_count INTEGER DEFAULT 0,
    applied_count INTEGER DEFAULT 0,
    completion_count INTEGER DEFAULT 0,
    fallback_count INTEGER DEFAULT 0,
    origin TEXT DEFAULT 'manual',
    generation INTEGER DEFAULT 0,
    source_task_id TEXT,
    created_by_agent TEXT,
    category TEXT DEFAULT 'general'
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_project ON knowledge_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_updated ON knowledge_documents(updated_at DESC);

-- ── Knowledge Chunks (Individual embeddable text segments) ──
CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    char_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON knowledge_chunks(document_id);

-- ── Knowledge Lineage (Version DAG — inspired by OpenSpace) ──
CREATE TABLE IF NOT EXISTS knowledge_lineage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    relationship TEXT DEFAULT 'derived'
        CHECK(relationship IN ('derived','fixed')),
    change_summary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_lineage_parent ON knowledge_lineage(parent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_lineage_child ON knowledge_lineage(child_id);

-- ── Knowledge Usage Log (quality feedback tracking) ──
CREATE TABLE IF NOT EXISTS knowledge_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    task_id TEXT,
    session_id TEXT,
    agent_id TEXT,
    action TEXT NOT NULL
        CHECK(action IN ('suggested','applied','completed','fallback')),
    token_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_usage_doc ON knowledge_usage_log(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_usage_task ON knowledge_usage_log(task_id);

-- ── Quality Reports (Quality gate results) ──
CREATE TABLE IF NOT EXISTS quality_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    agent_id TEXT NOT NULL,
    session_id TEXT,
    gate_name TEXT NOT NULL,              -- 'pre_commit', 'full', 'plan_quality'
    score_build INTEGER DEFAULT 0,        -- 0-25
    score_regression INTEGER DEFAULT 0,   -- 0-25
    score_standards INTEGER DEFAULT 0,    -- 0-25
    score_traceability INTEGER DEFAULT 0, -- 0-25
    score_total INTEGER DEFAULT 0,        -- 0-100
    grade TEXT CHECK(grade IN ('A','B','C','D','F')),
    passed INTEGER DEFAULT 0,
    details TEXT,                         -- JSON
    api_key_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quality_reports_agent ON quality_reports(agent_id);
CREATE INDEX IF NOT EXISTS idx_quality_reports_project ON quality_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_quality_reports_created ON quality_reports(created_at DESC);

-- ── Budget Settings (Token usage limits) ──
CREATE TABLE IF NOT EXISTS budget_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    daily_limit INTEGER DEFAULT 0,
    monthly_limit INTEGER DEFAULT 0,
    alert_threshold REAL DEFAULT 0.8,
    updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO budget_settings (id) VALUES (1);

-- ── Provider Accounts (LLM providers: OAuth/API keys) ──
CREATE TABLE IF NOT EXISTS provider_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,                -- 'openai_compat', 'gemini', 'anthropic', etc.
    auth_type TEXT DEFAULT 'api_key'
        CHECK(auth_type IN ('api_key', 'oauth')),
    api_base TEXT NOT NULL,
    api_key TEXT,
    status TEXT DEFAULT 'enabled'
        CHECK(status IN ('enabled', 'disabled', 'error')),
    capabilities TEXT DEFAULT '["chat"]',  -- JSON array: ["chat","embedding","code"]
    models TEXT DEFAULT '[]',              -- JSON array of model IDs
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_status ON provider_accounts(status);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_type ON provider_accounts(type);

-- ── Model Routing (Fallback chains per purpose) ──
CREATE TABLE IF NOT EXISTS model_routing (
    purpose TEXT PRIMARY KEY,          -- 'embedding', 'chat', 'code'
    chain TEXT NOT NULL,               -- JSON array of {accountId, model}
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default model routing (empty — configured via setup wizard)
INSERT OR IGNORE INTO model_routing (purpose, chain) VALUES ('embedding', '[]');
INSERT OR IGNORE INTO model_routing (purpose, chain) VALUES ('chat', '[]');

-- Insert default uncompleted setup status
INSERT OR IGNORE INTO setup_status (id, completed) VALUES (1, 0);

-- Insert default organization
INSERT OR IGNORE INTO organizations (id, name, slug, description)
VALUES ('org-default', 'Personal', 'personal', 'Default personal organization');

-- ============================================================
-- Migrations (for existing databases)
-- ============================================================
-- v1.1: Add commit tracking and mem9 status to index_jobs
ALTER TABLE index_jobs ADD COLUMN commit_hash TEXT;
ALTER TABLE index_jobs ADD COLUMN commit_message TEXT;
ALTER TABLE index_jobs ADD COLUMN triggered_by TEXT;
ALTER TABLE index_jobs ADD COLUMN mem9_status TEXT;
ALTER TABLE index_jobs ADD COLUMN mem9_chunks INTEGER DEFAULT 0;
ALTER TABLE index_jobs ADD COLUMN mem9_progress INTEGER DEFAULT 0;
ALTER TABLE index_jobs ADD COLUMN mem9_total_chunks INTEGER DEFAULT 0;
ALTER TABLE index_jobs ADD COLUMN docs_knowledge_status TEXT;
ALTER TABLE index_jobs ADD COLUMN docs_knowledge_count INTEGER DEFAULT 0;
