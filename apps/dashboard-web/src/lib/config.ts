const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''
const MCP_BASE = process.env.NEXT_PUBLIC_MCP_URL ?? ''

export const config = {
  api: {
    base: API_BASE,
    health: API_BASE ? `${API_BASE}/health` : '/health',
    keys: API_BASE ? `${API_BASE}/api/keys` : '/api/keys',
    setup: API_BASE ? `${API_BASE}/api/setup` : '/api/setup',
    mcp: {
      endpoint: MCP_BASE ? `${MCP_BASE}/mcp` : '/mcp',
      health: API_BASE ? `${API_BASE}/mcp/health` : '/mcp/health',
    },
    llmProxy: {
      models: process.env.NEXT_PUBLIC_CLIPROXY_URL
        ? `${process.env.NEXT_PUBLIC_CLIPROXY_URL}/v1/models`
        : '',
    }
  },
  mcp: {
    base: MCP_BASE,
    endpoint: MCP_BASE ? `${MCP_BASE}/mcp` : '/mcp',
    health: API_BASE ? `${API_BASE}/mcp/health` : '/mcp/health',
  },
  services: {
    cliproxy: process.env.NEXT_PUBLIC_CLIPROXY_URL ?? '',
    qdrant: process.env.NEXT_PUBLIC_QDRANT_URL ?? '',
  },
}
