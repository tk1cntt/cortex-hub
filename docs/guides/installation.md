# Installation Guide

> Install Cortex Hub on any server. Two options: quick deploy or full setup.

---

## Option 1: Quick Deploy (Docker only)

If you have Docker installed and just want to get running:

```bash
git clone https://github.com/lktiep/cortex-hub.git
cd cortex-hub
cp .env.example .env
# Edit .env with your domain and API keys
docker compose -f infra/docker-compose.yml up -d
```

Services will start on these ports:
- **Dashboard API**: `http://localhost:4000`
- **Hub MCP**: `http://localhost:8317` (Streamable HTTP)
- **Qdrant**: `http://localhost:6333`
- **GitNexus**: `http://localhost:4848`
- **CLIProxy (LLM)**: `http://localhost:8317` (internal)

---

## Option 2: Full Setup (from source)

### Prerequisites

| Requirement | Minimum | Check |
|---|---|---|
| **OS** | Linux (Ubuntu 22+) | `uname -a` |
| **RAM** | 4 GB | `free -m` |
| **Disk** | 15 GB | `df -h /` |
| **Docker** | 20+ | `docker --version` |
| **Node.js** | 22 LTS | `node -v` |
| **pnpm** | 10+ | `pnpm -v` |

### Step 1: Clone and Install

```bash
git clone https://github.com/lktiep/cortex-hub.git
cd cortex-hub
```

If you need to install dependencies:

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
corepack enable
corepack prepare pnpm@latest --activate
```

### Step 2: Configure

```bash
cp .env.example .env
# Edit .env with your settings:
# - CORTEX_BASE_DOMAIN=your-domain.com
# - GEMINI_API_KEY=your-key
# - MCP_API_KEYS=generate-with-openssl-rand-hex-32
```

### Step 3: Build and Deploy

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start services
docker compose -f infra/docker-compose.yml up -d
```

Or use the deploy script:

```bash
bash scripts/deploy.sh              # All services
bash scripts/deploy.sh cortex-api   # Single service
```

---

## What Gets Deployed

```
┌─────────────────────────────────────────────────┐
│  Cortex Hub — Docker Compose Stack              │
│                                                 │
│  Service         Port   Description             │
│  ─────────────────────────────────────────────  │
│  dashboard-api   4000   Hono REST API + mem9    │
│  hub-mcp         8317   MCP Streamable HTTP     │
│  qdrant          6333   Vector database         │
│  gitnexus        4848   Code intelligence       │
│  llm-proxy       8317   OAuth LLM gateway       │
│  watchtower      —      Auto-update containers  │
│                                                 │
│  Volumes: qdrant-data, api-data,                │
│           gitnexus-data, cliproxy-auth          │
└─────────────────────────────────────────────────┘
```

---

## Verification

```bash
# Check all services are healthy
docker compose -f infra/docker-compose.yml ps

# Test API health
curl http://localhost:4000/health

# Test MCP health
curl http://localhost:8317/health

# Test Qdrant
curl http://localhost:6333/healthz
```

Expected response from `/health`:
```json
{
  "status": "ok",
  "service": "dashboard-api",
  "services": {
    "qdrant": "ok",
    "cliproxy": "ok",
    "gitnexus": "ok",
    "mem9": "ok",
    "mcp": "ok"
  }
}
```

---

## Production Deploy (with Cloudflare Tunnel)

For public access, set up Cloudflare Tunnel:

1. Point subdomains to your server:
   - `hub.your-domain.com` → Dashboard
   - `cortex-api.your-domain.com` → API
   - `cortex-mcp.your-domain.com` → MCP

2. Configure `.env`:
   ```
   CORTEX_BASE_DOMAIN=your-domain.com
   CORTEX_MCP_URL=https://cortex-mcp.your-domain.com
   CORTEX_API_URL=https://cortex-api.your-domain.com
   CORTEX_DASHBOARD_URL=https://hub.your-domain.com
   ```

3. Deploy:
   ```bash
   bash scripts/deploy.sh
   ```

---

## Uninstall

```bash
cd cortex-hub
docker compose -f infra/docker-compose.yml down -v   # Stop + remove volumes
cd ..
rm -rf cortex-hub   # Remove project files
```

---

## Updating

```bash
cd cortex-hub
git pull
bash scripts/deploy.sh   # Rebuild + restart all services
```

Or for a single service:
```bash
bash scripts/deploy.sh cortex-api
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| Container won't start | Check logs: `docker logs cortex-api` |
| Port conflict | Change port in `docker-compose.yml` |
| Out of disk | `docker system prune -af` |
| Stuck indexing job | Kill via API: update `index_jobs` status to `error` |
| MCP tools not working | Check `docker logs cortex-mcp` for auth errors |
