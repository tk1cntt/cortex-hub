import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'hub-mcp',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
})

app.get('/', (c) => {
  return c.json({
    name: 'Cortex Hub MCP Server',
    version: '0.1.0',
    tools: [],
  })
})

export default app
