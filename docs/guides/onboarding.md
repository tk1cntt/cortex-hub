# Onboarding Guide — Cortex Hub

> Get started with Cortex Hub in under 5 minutes.

---

## How It Works

Cortex Hub connects AI agents through a unified **MCP (Model Context Protocol)** endpoint. Agents authenticate with **Bearer API keys**, and all LLM calls route through CLIProxy (multi-provider gateway with OAuth support).

```
AI Agent → Hub MCP (Bearer token) → Dashboard API → Backend Services
                                      ├── Qdrant (vectors)
                                      ├── GitNexus (code intelligence)
                                      ├── mem9 (agent memory, in-process)
                                      └── CLIProxy → Gemini/OpenAI/Anthropic
```

---

## Quick Start

### 1. Deploy Cortex Hub

```bash
git clone https://github.com/lktiep/cortex-hub.git
cd cortex-hub
cp .env.example .env
# Edit .env with your domain and API keys
bash scripts/deploy.sh
```

### 2. Configure Your IDE's MCP Client

Point your AI coding agent to the MCP endpoint:

```
MCP URL: http://localhost:8317/mcp  (local)
         https://cortex-mcp.your-domain.com/mcp  (production)
API Key: Generated from Dashboard → Settings → API Keys
```

Supported IDEs:
| IDE | Config Location |
|-----|----------------|
| Claude Code | `~/.claude.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |
| Gemini CLI | `~/.gemini/antigravity/mcp_config.json` |

### 3. Run Onboarding Script (Optional)

For automated IDE setup and project configuration:

```bash
# macOS / Linux
bash scripts/onboard.sh

# Windows PowerShell
.\scripts\onboard.ps1
```

The onboarding script:
- Prompts for MCP URL and API key
- Configures MCP for detected IDEs
- Sets up project profile (`.cortex/project-profile.json`)

---

## Setup Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/onboard.sh` | Interactive onboarding — prompts for MCP URL, API key, IDE selection |
| `scripts/onboard.ps1` | Windows interactive onboarding |
| `scripts/install.sh` | Non-interactive installer — reads config from env/.env |
| `scripts/install.ps1` | Windows non-interactive installer |
| `scripts/install-hub.sh` | Server-side hub deployment |
| `scripts/deploy.sh` | Rebuild + force-recreate services after code changes |
| `scripts/cortex-worker.sh` | Headless worker bot for autonomous tasks |
| `scripts/cortex-listen.sh` | Task listener (polls for assigned tasks) |

---

## First-Time Admin Setup

### 1. Open Dashboard

Navigate to your dashboard URL (e.g., `https://hub.your-domain.com` or `http://localhost:4000`).

### 2. Configure LLM Provider

Go to **Settings** and configure your LLM provider:
- Add API key for Gemini/OpenAI/Anthropic
- Or use CLIProxy OAuth (no API key needed)

### 3. Create Organization & Projects

```
Organization: Personal
├── Project: cortex-hub (git: https://github.com/lktiep/cortex-hub)
├── Project: aureus (git: https://github.com/tk1cntt/aureus)
└── Project: get-shit-done (git: https://github.com/gsd-build/get-shit-done)
```

### 4. Generate API Keys

Go to **Settings → API Keys → Generate New**:

| Field | Example |
|-------|---------|
| Name | `agent-antigravity` |
| Scope | all |
| Permissions | JSON object (or leave empty for all) |

Copy the key — it won't be shown again.

---

## Manual MCP Configuration

If your IDE supports MCP config files directly:

```json
{
  "mcpServers": {
    "cortex-hub": {
      "url": "http://localhost:8317/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

---

## Verify Connection

```bash
# Test MCP connection
curl -s http://localhost:8317/health

# Test MCP tools
curl -s -X POST http://localhost:8317/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -m json.tool
```

---

## Infrastructure Endpoints

| Service | Local URL | Port |
|---------|-----------|------|
| Dashboard API | http://localhost:4000 | 4000 |
| Hub MCP | http://localhost:8317 | 8317 |
| Qdrant | http://localhost:6333 | 6333 |
| GitNexus | http://localhost:4848 | 4848 |
| CLIProxy | http://localhost:8317 | 8317 |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `502 Bad Gateway` | Services not started — `docker compose -f infra/docker-compose.yml up -d` |
| `401 Unauthorized` | API key invalid — regenerate at Dashboard → Settings → API Keys |
| OAuth login fails | Check CLIProxy logs: `docker logs cortex-llm-proxy` |
| MCP tools not available | Check `docker logs cortex-mcp` for startup errors |
| Container won't start | Use `bash scripts/deploy.sh cortex-api` to force rebuild |
| Indexing stuck | Check `docker logs cortex-api` for GitNexus errors |
