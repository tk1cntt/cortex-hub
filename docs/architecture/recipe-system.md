# Recipe System — Self-Evolving Knowledge (OpenSpace-inspired)

> Implemented: 2026-04-02 | Commit: `4adbcf5`
> Inspired by: [HKUDS/OpenSpace](https://github.com/HKUDS/OpenSpace)

## Context

Cortex Hub had knowledge base + memory but agents couldn't automatically learn from task execution. Each agent reasoned from scratch for similar tasks — wasting tokens and time.

OpenSpace proved that auto-capturing "skills" from execution and reusing them reduces token usage by 46% and improves quality 4.2x.

**Design principle**: Zero new MCP tools. Integrated into existing `knowledge_store`, `knowledge_search`, `session_start`, `session_end`, `quality_report`. Agent workflow unchanged, output better.

---

## Architecture

**Recipe = Knowledge document with quality metrics + lineage.**

```
Agent workflow (UNCHANGED):
  session_start     -> response now includes relevant_knowledge[]
  knowledge_search  -> results now ranked by quality metrics
  ... work ...
  session_end / quality_report -> auto-capture recipe if pattern detected
```

### Data Model

Extended `knowledge_documents` with:

| Column | Type | Purpose |
|--------|------|---------|
| `selection_count` | INTEGER | Times suggested to an agent |
| `applied_count` | INTEGER | Times agent actually used it |
| `completion_count` | INTEGER | Times task completed with this knowledge |
| `fallback_count` | INTEGER | Times agent abandoned it mid-task |
| `origin` | TEXT | `manual` / `agent` / `captured` / `derived` / `fixed` |
| `category` | TEXT | `general` / `workflow` / `tool_guide` / `reference` / `error_fix` |
| `generation` | INTEGER | DAG distance from root (0 = original) |
| `source_task_id` | TEXT | Conductor task that spawned this |
| `created_by_agent` | TEXT | Which agent created it |

New tables:
- **`knowledge_lineage`** — Parent-child DAG (many-to-many, relationship: `derived` or `fixed`)
- **`knowledge_usage_log`** — Usage events (suggested/applied/completed/fallback + token_count)
- **`knowledge_chunks`** — Individual embeddable text segments (FK to knowledge_documents)

### Quality Metrics (OpenSpace core idea)

```
applied_rate    = applied_count / selection_count
completion_rate = completion_count / applied_count
effective_rate  = completion_count / selection_count  (end-to-end)
fallback_rate   = fallback_count / selection_count    (higher = worse)
```

### Search Ranking

Hybrid score replaces pure vector similarity:

```
score = vector_similarity * 0.6 + effective_rate * 0.3 + recency * 0.1
```

- Only applies when `selection_count >= 3` (enough data)
- Docs with `fallback_rate > 0.5` and `selection_count >= 5` flagged as `deprecated`

### Evolution Types (from OpenSpace)

| Type | Trigger | Action |
|------|---------|--------|
| **CAPTURED** | Task completion / session end | LLM analyzes execution → new knowledge doc |
| **DERIVED** | New capture is similar (>0.85) to existing | LLM merges → new doc linked to parent |
| **FIXED** | Doc has `fallback_rate > 0.4`, `selection >= 5` | LLM repairs → new doc replaces old |

Anti-loop safeguards:
- Newly evolved docs need `selection_count >= 5` before re-evaluation
- LLM confirmation gate before FIX evolution
- Rate limit: max 5 captures/hour

---

## Files

### Services
- `apps/dashboard-api/src/services/recipe-capture.ts` — Auto-capture from task/session
- `apps/dashboard-api/src/services/knowledge-evolution.ts` — FIX evolution + health monitor

### Routes
- `apps/dashboard-api/src/routes/knowledge.ts` — Quality-ranked search, lineage, token-savings, track-feedback, health-check

### Modified
- `apps/dashboard-api/src/db/schema.sql` — +2 tables (knowledge_lineage, knowledge_usage_log, knowledge_chunks), +9 columns on knowledge_documents
- `apps/dashboard-api/src/db/client.ts` — Migration blocks
- `apps/hub-mcp/src/tools/session.ts` — `relevant_knowledge` in response
- `apps/hub-mcp/src/tools/quality.ts` — Auto-track feedback
- `packages/shared-types/src/models.ts` — KnowledgeDocument, KnowledgeQuality, KnowledgeLineageEdge types

### API Endpoints
- `POST /api/knowledge` — Create knowledge document
- `POST /api/knowledge/search` — Quality-ranked search
- `POST /api/knowledge/track-feedback` — Auto-increment completion/fallback counters
- `POST /api/knowledge/health-check` — Find and fix unhealthy knowledge docs
- `GET /api/knowledge/lineage/:id` — Full DAG traversal (ancestors + descendants)
- `GET /api/knowledge/token-savings` — Compare token usage with/without knowledge

---

## Verification Workflow

### End-to-End Test Flow

```
1. SESSION START
   Agent calls cortex_session_start
   -> Response has relevant_knowledge[] (top 3 recipes)
   VERIFY: relevant_knowledge field present in response

        |
        v

2. KNOWLEDGE SEARCH
   Agent calls cortex_knowledge_search
   -> Results ranked by hybrid score (vector + quality)
   -> Each result has quality{} + origin + category
   -> selection_count++ automatic
   VERIFY: quality object in response, scores re-ranked

        |
        v

3. AGENT WORKS
   Uses knowledge to solve task
   ... code, debug, implement ...

        |
        v

4. QUALITY REPORT
   Agent calls cortex_quality_report
   -> passed=true  -> completion_count++ for recent docs
   -> passed=false -> fallback_count++ for recent docs
   VERIFY: POST /api/knowledge/track-feedback called

        |
        v

5a. TASK COMPLETE (conductor task -> completed)
    recipe-capture.ts reads logs + result + context
    LLM analyzes -> should_capture?
    YES: store as captured/derived knowledge doc
    VERIFY: new kdoc with origin='captured' in DB

5b. SESSION END (agent calls session complete)
    recipe-capture.ts reads summary
    LLM analyzes -> should_capture?
    YES: store as knowledge doc
    VERIFY: new kdoc with tags=['auto-recipe']

        |
        v

6. EVOLUTION (periodic or on-demand)
   POST /api/knowledge/health-check
   Finds docs with fallback_rate > 0.4, selection >= 5
   LLM confirms + generates improved content
   New doc (origin='fixed'), old archived
   knowledge_lineage edge created
   VERIFY: lineage DAG via GET /api/knowledge/lineage/:id

        |
        v

7. DASHBOARD
   Knowledge page shows origin badges (captured/derived/fixed)
   Quality metrics: "75% effective", "v2"
   GET /api/knowledge/token-savings
   VERIFY: UI renders new fields
```

### Quick Smoke Test (curl)

```bash
# 1. Create a test knowledge doc with origin
curl -X POST http://localhost:4000/api/knowledge \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Recipe","content":"## Steps\n1. Do X\n2. Do Y","tags":["test"],"origin":"captured","category":"workflow"}'

# 2. Search and verify quality fields
curl -X POST http://localhost:4000/api/knowledge/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"test recipe steps"}'

# 3. Track feedback
curl -X POST http://localhost:4000/api/knowledge/track-feedback \
  -H 'Content-Type: application/json' \
  -d '{"action":"completed"}'

# 4. Check token savings
curl http://localhost:4000/api/knowledge/token-savings

# 5. Run health check
curl -X POST http://localhost:4000/api/knowledge/health-check

# 6. Get lineage DAG (replace kdoc-xxx with actual ID)
curl http://localhost:4000/api/knowledge/lineage/kdoc-xxx
```

### What to Monitor

| Metric | Expected | Alert If |
|--------|----------|----------|
| Auto-captured recipes/day | 1-5 | 0 for 3+ days |
| Avg effective_rate | > 0.5 | < 0.3 across all docs |
| Fallback rate | < 0.3 | > 0.5 for any doc with 10+ selections |
| Evolution fixes/week | 0-2 | > 5 (too many bad docs) |
| Token savings | 20-40% | Negative (knowledge hurting) |

---

## Verification Workflow

### End-to-End Test Flow

```
1. SESSION START
   Agent calls cortex_session_start
   -> Response has relevant_knowledge[] (top 3 recipes)
   VERIFY: relevant_knowledge field present in response

        |
        v

2. KNOWLEDGE SEARCH
   Agent calls cortex_knowledge_search
   -> Results ranked by hybrid score (vector + quality)
   -> Each result has quality{} + origin + category
   -> selection_count++ automatic
   VERIFY: quality object in response, scores re-ranked

        |
        v

3. AGENT WORKS
   Uses knowledge to solve task
   ... code, debug, implement ...

        |
        v

4. QUALITY REPORT
   Agent calls cortex_quality_report
   -> passed=true  -> completion_count++ for recent docs
   -> passed=false -> fallback_count++ for recent docs
   VERIFY: POST /api/knowledge/track-feedback called

        |
        v

5a. TASK COMPLETE (conductor task -> completed)
    recipe-capture.ts reads logs + result + context
    LLM analyzes -> should_capture?
    YES: store as captured/derived knowledge doc
    VERIFY: new kdoc with origin='captured' in DB

5b. SESSION END (agent calls session complete)
    recipe-capture.ts reads summary
    LLM analyzes -> should_capture?
    YES: store as knowledge doc
    VERIFY: new kdoc with tags=['auto-recipe']

        |
        v

6. EVOLUTION (periodic or on-demand)
   POST /api/knowledge/health-check
   Finds docs with fallback_rate > 0.4, selection >= 5
   LLM confirms + generates improved content
   New doc (origin='fixed'), old archived
   knowledge_lineage edge created
   VERIFY: lineage DAG via GET /api/knowledge/lineage/:id

        |
        v

7. DASHBOARD
   Knowledge page shows origin badges (captured/derived/fixed)
   Quality metrics: "75% effective", "v2"
   GET /api/knowledge/token-savings
   VERIFY: UI renders new fields
```

### Quick Smoke Test (curl)

```bash
# 1. Create a test knowledge doc with origin
curl -X POST http://localhost:4000/api/knowledge \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Recipe","content":"## Steps\n1. Do X\n2. Do Y","tags":["test"],"origin":"captured","category":"workflow"}'

# 2. Search and verify quality fields
curl -X POST http://localhost:4000/api/knowledge/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"test recipe steps"}'

# 3. Track feedback
curl -X POST http://localhost:4000/api/knowledge/track-feedback \
  -H 'Content-Type: application/json' \
  -d '{"action":"completed"}'

# 4. Check token savings
curl http://localhost:4000/api/knowledge/token-savings

# 5. Run health check
curl -X POST http://localhost:4000/api/knowledge/health-check

# 6. Get lineage DAG (replace kdoc-xxx with actual ID)
curl http://localhost:4000/api/knowledge/lineage/kdoc-xxx
```

### What to Monitor

| Metric | Expected | Alert If |
|--------|----------|----------|
| Auto-captured recipes/day | 1-5 | 0 for 3+ days |
| Avg effective_rate | > 0.5 | < 0.3 across all docs |
| Fallback rate | < 0.3 | > 0.5 for any doc with 10+ selections |
| Evolution fixes/week | 0-2 | > 5 (too many bad docs) |
| Token savings | 20-40% | Negative (knowledge hurting) |
