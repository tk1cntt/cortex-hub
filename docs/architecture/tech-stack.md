# Technology Stack

> Every component in Cortex is open source, self-hosted, and vendor-lock-in free.

---

## Core Stack

| Layer | Technology | Version | License | Role |
|---|---|---|---|---|
| **Runtime** | Node.js | 22 LTS | MIT | Server runtime |
| **Language** | TypeScript | 5.x | Apache 2.0 | Type safety across all packages |
| **Package Manager** | pnpm | 10.x | MIT | Fast, disk-efficient monorepo |
| **Build System** | Turborepo | 2.x | MIT | Monorepo task orchestration |

## Backend Services

| Service | Technology | Version | License | Role |
|---|---|---|---|---|
| **Code Intelligence** | GitNexus | latest | MIT | AST parsing, graph analysis, impact detection (Docker eval-server on :4848) |
| **Vector Database** | Qdrant | 1.13.6 | Apache 2.0 | Semantic search for knowledge + memory |
| **Agent Memory** | mem9 (in-process) | latest | MIT | Long-term memory with vector embeddings (runs inside dashboard-api) |
| **Application DB** | SQLite (WAL mode) | 3.x | Public Domain | Quality reports, sessions, query logs, tasks, knowledge |
| **API Framework** | Hono | 4.x | MIT | Lightweight HTTP framework (dashboard-api + hub-mcp) |

## Infrastructure

| Component | Technology | Tier | Role |
|---|---|---|---|
| **MCP Gateway** | Hono (Node.js, Docker) | ~$0 (self-hosted) | Hub MCP Server — Streamable HTTP + JSON-RPC on :8317 |
| **LLM Gateway** | CLIProxy (eceasy/cli-proxy-api) | ~$0 (self-hosted) | OAuth-based LLM proxy on :8317 — no API keys needed |
| **Tunnel** | Cloudflare Tunnel | Free | Secure server exposure, zero open ports |
| **Containers** | Docker + Compose | Free | Service orchestration |
| **Auto-update** | Watchtower | Free | Container image auto-updates |
| **CI/CD** | GitHub Actions | Free (public) | Lint, test, build, deploy |

## Frontend

| Technology | Version | License | Role |
|---|---|---|---|
| **Framework** | Next.js | 15.x | MIT | React framework with App Router |
| **UI Library** | React | 19.x | MIT | Component rendering |
| **Styling** | Vanilla CSS + CSS Variables | — | Design system tokens |
| **Font** | Inter (Google Fonts) | OFL | Modern, clean typography |

---

## Docker Services

| Service | Image | Port | Description |
|---|---|---|---|
| **dashboard-api** | `ghcr.io/lktiep/cortex-api:latest` | 4000 | Hono REST API + mem9 in-process |
| **hub-mcp** | `ghcr.io/lktiep/cortex-mcp:latest` | 8317→8317 | MCP Streamable HTTP server |
| **gitnexus** | `ghcr.io/lktiep/cortex-gitnexus:latest` | 4848 | Code intelligence eval-server |
| **qdrant** | `qdrant/qdrant:v1.13.6` | 6333 | Vector database |
| **llm-proxy** | `eceasy/cli-proxy-api:latest` | 8317 | OAuth-based LLM gateway |
| **watchtower** | `containrrr/watchtower:latest` | — | Auto-update containers |

---

## Estimated Monthly Cost

| Item | Cost |
|---|---|
| Server (self-hosted / existing VPS) | $0 |
| Docker containers (self-hosted) | $0 |
| Cloudflare Tunnel | $0 |
| GitNexus embeddings (local AST) | $0 |
| CLIProxy (OAuth, no API key) | $0 |
| mem9 code embedding (opt-in) | ~$0.05–$2/month (Gemini) |
| **Total** | **≈ $0–$2/month** |
