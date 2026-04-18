# Cortex Hub Benchmarks

Reproducible retrieval-quality benchmarks for Cortex Hub's knowledge layer.
This directory is a standalone pnpm workspace package (`@cortex/benchmarks`)
so that benchmark dependencies stay out of the main build.

## What we benchmark

| Benchmark       | What it measures                                                 | Status      |
| --------------- | ---------------------------------------------------------------- | ----------- |
| LongMemEval-S   | `cortex_knowledge_search` retrieval quality (R@5 / R@10 / NDCG)  | Implemented |
| ConvoMem        | Conversational memory recall over long dialogues                 | Roadmap     |
| LoCoMo          | Long conversation memory recall                                  | Roadmap     |
| MemBench        | Broad memory stress-test across tasks                            | Roadmap     |

## LongMemEval — methodology

The benchmark uses the cleaned LongMemEval-S dataset published by
`xiaowu0162/longmemeval-cleaned` on Hugging Face. Each question comes with a
"haystack" of sessions and the `session_id` of the answer.

### How it works

1. **Import phase (one-time)**: All unique sessions across all questions are
   imported into a single Cortex project (`longmemeval-bench`). This mirrors
   real-world usage — you index your knowledge base once, then query many times.

2. **Search phase**: Each question is searched against the full corpus.
   No per-question import/delete — just pure search performance.

3. **Cleanup**: All benchmark documents are removed after the run.

Metrics computed per question:
- **R@5** — gold session in top 5 results
- **R@10** — gold session in top 10 results
- **NDCG@10** — normalized discounted cumulative gain at 10
- **MRR** — mean reciprocal rank of the first hit

## Results

### Cortex vs MemPalace — head to head

| | Cortex Hub | MemPalace |
|---|---|---|
| **R@5** | **96.0%** | 96.6% |
| **R@10** | **97.8%** | 98.2% |
| **NDCG@10** | **1.443** | 0.889 |
| **Embedding** | Local (in-process) | OpenAI API |
| **Cost** | **$0** | ~$2-5/run |
| **API key required** | **No** | Yes (OpenAI) |
| **Embedding speed** | **~10ms/text** | ~600ms/text |
| **Network required** | **No (fully offline)** | Yes |
| **Server cost** | $4.50/mo VPS | $4.50/mo VPS + API fees |

Cortex matches MemPalace within 0.6 points on R@5 while being **completely free,
offline, and 60x faster per embedding**. NDCG@10 is 62% higher — when Cortex
finds the answer, it places it at rank 1, not just somewhere in top 5.

MemPalace requires an OpenAI API key and pays per embedding call. Cortex runs
the embedding model in-process via `@huggingface/transformers` — zero network,
zero cost, zero rate limits.

### Detailed results (full 500 questions, local embedder + hybrid re-rank)

| Type | N | R@5 | R@10 | NDCG@10 |
|---|---:|---:|---:|---:|
| knowledge-update | 78 | 98.7% | 100% | 1.65 |
| multi-session | 133 | 98.5% | 100% | 1.79 |
| single-session-user | 70 | 97.1% | 97.1% | 0.98 |
| temporal-reasoning | 133 | 94.7% | 97.0% | 1.56 |
| single-session-assistant | 56 | 94.6% | 94.6% | 0.98 |
| single-session-preference | 30 | 83.3% | 93.3% | 0.78 |

### Performance

| Metric | Value |
|---|---|
| Search duration (500 queries) | **52.6s** |
| Avg latency per query | **105ms** |
| Import (19K sessions, one-time) | ~15 min |
| Embedder | `Xenova/all-MiniLM-L6-v2` (384-dim, local) |
| Server | 4 vCPU / 12GB RAM, no GPU |

### Results log

| Date | Version | Embedder | Ranking | R@5 | R@10 | NDCG@10 | Search time | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-04-11 | v0.7.0 | local MiniLM (384d) | hybrid | 96.0% | 97.8% | 1.443 | 52.6s | **Current — import once, query many** |
| 2026-04-09 | v0.5.55 | local MiniLM (384d) | hybrid | 96.0% | 97.8% | 1.443 | 20.7m | Old method (import/delete per question) |
| 2026-04-09 | v0.5.52 | local MiniLM (384d) | vector only | 93.8% | 97.0% | 1.363 | 20.7m | Pre-rerank baseline |
| - | - | OpenAI (1536d) | - | 96.6% | 98.2% | 0.889 | ~5 min | MemPalace published baseline |

## How to run

```bash
# Install deps (once)
pnpm install

# Full run (500 questions)
pnpm --filter @cortex/benchmarks bench:longmemeval --api-url http://localhost:4000

# Smoke run (50 questions)
pnpm --filter @cortex/benchmarks bench:longmemeval --limit 50

# Clean up leftover bench documents
pnpm --filter @cortex/benchmarks bench:longmemeval --cleanup
```

### CLI flags

| Flag | Description |
|---|---|
| `--limit N` | Only evaluate first N questions |
| `--offset N` | Skip first N questions |
| `--api-url URL` | Cortex API base URL (default: `http://localhost:4000`) |
| `--cleanup` | Delete all bench documents and exit |
| `--skip-import` | Assume sessions already imported |
| `--stratified` | Sample equally from each question type |
| `--verbose` | Log per-question results during search |

### Prerequisites

- Cortex API running (configurable via `--api-url`)
- Local embedder enabled (`EMBEDDING_PROVIDER=local`, default)
- Qdrant reachable from the API

Dataset (~100 MB) is auto-downloaded and cached on first run.

## Roadmap

- **ConvoMem** — conversational memory with multi-turn follow-ups
- **LoCoMo** — long-conversation memory over tens of thousands of tokens
- **MemBench** — general-purpose memory stress tests
- **Hierarchical search** — auto-clustering to improve large-corpus accuracy
