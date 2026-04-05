# Database Schema — Cortex Hub

> SQLite application database (WAL mode). Vectors stored in Qdrant separately.

---

## Tables

### `api_keys` — API key registry

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID prefix + random |
| `name` | TEXT | Human-readable name |
| `key_hash` | TEXT | SHA-256 hash |
| `scope` | TEXT | `all`, `knowledge`, `hub` |
| `permissions` | TEXT | JSON permissions |
| `project_id` | TEXT | Optional project scope |
| `created_at` | TEXT | ISO 8601 |
| `expires_at` | TEXT | ISO 8601 or NULL |
| `last_used_at` | TEXT | ISO 8601 or NULL |

### `organizations` — Multi-tenant orgs

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `name` | TEXT | Org name |
| `slug` | TEXT UNIQUE | URL-safe slug |
| `description` | TEXT | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `projects` — Repositories

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID (e.g. `proj-abc123`) |
| `org_id` | TEXT FK → organizations | |
| `name` | TEXT | |
| `slug` | TEXT | Unique per org |
| `description` | TEXT | |
| `git_repo_url` | TEXT | |
| `git_provider` | TEXT | `github`, `gitlab`, etc. |
| `git_username` | TEXT | |
| `git_token` | TEXT | Encrypted token |
| `indexed_at` | TEXT | Last index timestamp |
| `indexed_symbols` | INT | Symbol count |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `index_jobs` — Indexing job tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID (e.g. `idx-abc123`) |
| `project_id` | TEXT FK → projects | |
| `branch` | TEXT | Git branch (auto-detected if omitted) |
| `status` | TEXT | `pending`, `cloning`, `analyzing`, `done`, `error` |
| `progress` | INT | 0-100 |
| `total_files` | INT | |
| `symbols_found` | INT | |
| `log` | TEXT | stdout/stderr |
| `error` | TEXT | Error message |
| `commit_hash` | TEXT | Short hash |
| `commit_message` | TEXT | First 200 chars |
| `triggered_by` | TEXT | `manual`, `webhook`, `setup` |
| `mem9_status` | TEXT | `pending`, `embedding`, `done`, `error`, `skipped` |
| `mem9_chunks` | INT | Chunks embedded |
| `mem9_progress` | INT | 0-100 |
| `mem9_total_chunks` | INT | |
| `docs_knowledge_status` | TEXT | |
| `docs_knowledge_count` | INT | |
| `started_at` | TEXT | |
| `completed_at` | TEXT | |
| `created_at` | TEXT | |

### `knowledge_documents` — Knowledge base entries

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID (e.g. `kdoc-abc123`) |
| `title` | TEXT | |
| `source` | TEXT | `manual`, `agent`, `captured`, `derived`, `fixed` |
| `source_agent_id` | TEXT | |
| `project_id` | TEXT | |
| `tags` | TEXT | JSON array |
| `content_preview` | TEXT | First 500 chars |
| `chunk_count` | INT | |
| `status` | TEXT | `active`, `archived`, `deprecated` |
| `hit_count` | INT | |
| `selection_count` | INT | Recipe system metric |
| `applied_count` | INT | |
| `completion_count` | INT | |
| `fallback_count` | INT | |
| `origin` | TEXT | `manual`, `agent`, `captured`, `derived`, `fixed` |
| `generation` | INT | DAG depth from root |
| `source_task_id` | TEXT | |
| `created_by_agent` | TEXT | |
| `category` | TEXT | `general`, `workflow`, `tool_guide`, etc. |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `knowledge_chunks` — Embeddable text segments

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `document_id` | TEXT FK → knowledge_documents | |
| `chunk_index` | INT | |
| `content` | TEXT | |
| `char_count` | INT | |
| `created_at` | TEXT | |

### `knowledge_lineage` — Version DAG

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO | |
| `parent_id` | TEXT FK → knowledge_documents | |
| `child_id` | TEXT FK → knowledge_documents | |
| `relationship` | TEXT | `derived`, `fixed` |
| `change_summary` | TEXT | |
| `created_at` | TEXT | |

### `knowledge_usage_log` — Quality feedback tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO | |
| `document_id` | TEXT | |
| `task_id` | TEXT | |
| `session_id` | TEXT | |
| `agent_id` | TEXT | |
| `action` | TEXT | `suggested`, `applied`, `completed`, `fallback` |
| `token_count` | INT | |
| `created_at` | TEXT | |

### `conductor_tasks` — Task orchestration

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID (e.g. `task_xxx`) |
| `title` | TEXT | |
| `description` | TEXT | |
| `project_id` | TEXT | |
| `parent_task_id` | TEXT | |
| `created_by_agent` | TEXT | |
| `assigned_to_agent` | TEXT | |
| `assigned_session_id` | TEXT | |
| `status` | TEXT | Full workflow (see below) |
| `priority` | INT | 1-10, default 5 |
| `required_capabilities` | TEXT | JSON array |
| `depends_on` | TEXT | JSON array |
| `notify_on_complete` | TEXT | JSON array |
| `notified_agents` | TEXT | JSON array |
| `context` | TEXT | JSON |
| `result` | TEXT | |
| `completed_by` | TEXT | |
| `created_at` | TEXT | |
| `assigned_at` | TEXT | |
| `accepted_at` | TEXT | |
| `completed_at` | TEXT | |

**Status workflow:** `pending` → `blocked` → `assigned` → `accepted` → `in_progress` → `analyzing` → `strategy_review` → `synthesis` → `discussion` → `review` → `approved`/`rejected` → `completed`/`failed`/`cancelled`

### `conductor_task_logs` — Task audit trail

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO | |
| `task_id` | TEXT | |
| `agent_id` | TEXT | |
| `action` | TEXT | |
| `message` | TEXT | |
| `created_at` | TEXT | |

### `conductor_comments` — Task discussion

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO | |
| `task_id` | TEXT | |
| `finding_id` | TEXT | |
| `agent_id` | TEXT | |
| `comment` | TEXT | |
| `comment_type` | TEXT | `comment`, `agree`, `disagree`, `amendment` |
| `created_at` | TEXT | |

### `quality_reports` — Quality gate results

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `project_id` | TEXT | |
| `agent_id` | TEXT | |
| `session_id` | TEXT | |
| `gate_name` | TEXT | `pre_commit`, `full`, `plan_quality` |
| `score_build` | INT | 0-25 |
| `score_regression` | INT | 0-25 |
| `score_standards` | INT | 0-25 |
| `score_traceability` | INT | 0-25 |
| `score_total` | INT | 0-100 |
| `grade` | TEXT | A, B, C, D, F |
| `passed` | INT | 0 or 1 |
| `details` | TEXT | JSON |
| `api_key_name` | TEXT | |
| `created_at` | TEXT | |

### `session_handoffs` — Session transfers

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `from_agent` | TEXT | |
| `to_agent` | TEXT | NULL = open handoff |
| `project` | TEXT | |
| `task_summary` | TEXT | |
| `context` | TEXT | JSON |
| `priority` | INT | 1-10 |
| `status` | TEXT | `pending`, `claimed`, `completed`, `expired` |
| `claimed_by` | TEXT | |
| `project_id` | TEXT | |
| `created_at` | TEXT | |
| `expires_at` | TEXT | |

### `query_logs` — MCP tool telemetry

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO | |
| `agent_id` | TEXT | |
| `tool` | TEXT | MCP tool name |
| `params` | TEXT | JSON |
| `latency_ms` | INT | |
| `status` | TEXT | `ok`, `error` |
| `error` | TEXT | |
| `project_id` | TEXT | |
| `created_at` | TEXT | |

### `usage_logs` — LLM usage tracking

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK AUTO | |
| `agent_id` | TEXT | |
| `model` | TEXT | |
| `prompt_tokens` | INT | |
| `completion_tokens` | INT | |
| `total_tokens` | INT | |
| `project_id` | TEXT | |
| `request_type` | TEXT | `chat`, `embedding`, `tool` |
| `created_at` | TEXT | |

### `provider_accounts` — LLM provider config

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `name` | TEXT | |
| `type` | TEXT | `openai_compat`, `gemini`, `anthropic` |
| `auth_type` | TEXT | `api_key`, `oauth` |
| `api_base` | TEXT | |
| `api_key` | TEXT | |
| `status` | TEXT | `enabled`, `disabled`, `error` |
| `capabilities` | TEXT | JSON: `["chat","embedding","code"]` |
| `models` | TEXT | JSON array |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `model_routing` — Fallback chains

| Column | Type | Description |
|--------|------|-------------|
| `purpose` | TEXT PK | `embedding`, `chat`, `code` |
| `chain` | TEXT | JSON: `[{accountId, model}]` |
| `updated_at` | TEXT | |

### Other Tables

| Table | Purpose |
|-------|---------|
| `admin_user` | GitHub OAuth users |
| `hub_config` | Key-value config (hub_name, description) |
| `budget_settings` | Token usage limits (daily/monthly) |
| `notification_preferences` | Per-event notification toggles |
| `setup_status` | Setup wizard completion flag |

---

## Notes

- **Database:** SQLite 3.x with WAL mode (not Supabase/PostgreSQL)
- **Vectors:** Stored in Qdrant, not in SQLite. `knowledge_documents` has no vector column.
- **All IDs:** UUIDs v4 (TEXT), not auto-increment integers
- **All timestamps:** ISO 8601 TEXT strings
- **JSON columns:** Stored as TEXT, parsed by application code
- **Total tables:** 20+ (excluding indexes and config tables)
