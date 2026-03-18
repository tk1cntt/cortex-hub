# Onboarding Guide — Cortex Hub

> Get started with Cortex Hub in under 5 minutes.

---

## Step 1: Access the LLM Proxy Dashboard

Open **https://llm.hub.jackle.dev** (or `http://<server-ip>:9090`) in your browser.

This is the CLIProxyAPI management UI — it provides an OpenAI-compatible API endpoint without requiring any API keys.

## Step 2: Authenticate with Your AI Provider

Click **Login** and choose one of the supported OAuth providers:

| Provider | Auth Method | Models Available |
|----------|-------------|-----------------|
| **OpenAI Codex** | OAuth (ChatGPT Plus account) | GPT-4o, GPT-4.1, o3, o4-mini |
| **Gemini CLI** | Google OAuth | Gemini 2.5 Pro/Flash |
| **Claude Code** | Anthropic OAuth | Claude 4 Sonnet/Opus |
| **Custom** | API Key | Any OpenAI-compatible endpoint |

> **No API key needed** for OpenAI, Gemini, and Claude — just use your existing subscription!

## Step 3: Verify Connection

After OAuth login, the proxy automatically configures itself. Test it:

```bash
curl http://localhost:8080/v1/models
```

You should see a list of available models from your authenticated providers.

## Step 4: Access Cortex Hub Dashboard

Open **https://hub.jackle.dev** — the Dashboard Web UI.

From here you can:
- **Settings → AI Provider**: View and manage your proxy configuration
- **API Keys**: Generate `cortex_*` keys for your AI agents
- **Services**: Monitor Qdrant, Neo4j, mem0 health in real-time

## Step 5: Connect Your AI Agent

Configure your AI agent (Antigravity, GoClaw, etc.) to use the Cortex Hub MCP Server:

```json
{
  "mcpServers": {
    "cortex-hub": {
      "url": "https://mcp.hub.jackle.dev",
      "headers": {
        "Authorization": "Bearer cortex_YOUR_API_KEY"
      }
    }
  }
}
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│  Your AI Agent (Antigravity, GoClaw, etc.)  │
│  MCP Client → hub.jackle.dev               │
└──────────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────┐
    │   Cortex Hub MCP Server     │
    │   (Cloudflare Worker)       │
    └──┬──────┬──────┬──────┬─────┘
       │      │      │      │
   ┌───▼──┐ ┌─▼──┐ ┌▼───┐ ┌▼────────┐
   │Qdrant│ │Neo4j│ │mem0│ │LLM Proxy│
   │Vector│ │Graph│ │    │ │(OAuth)  │
   └──────┘ └────┘ └────┘ └─────────┘
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `502 Bad Gateway` at hub.jackle.dev | Services not started — run `docker compose up -d` |
| mem0 won't start | Authenticate at the LLM Proxy UI first (port 9090) |
| API key rejected | Check key is active in Dashboard → API Keys |
| Slow embeddings | Switch to local Ollama model in proxy settings |
