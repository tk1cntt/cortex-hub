// ============================================================
// MCP Protocol Types — Cortex Hub
// ============================================================

/** MCP tool categories supported by Cortex Hub */
export type ToolCategory = 'code' | 'memory' | 'knowledge' | 'quality' | 'session'

/** MCP tool definition */
export type McpToolDefinition = {
  name: string
  description: string
  category: ToolCategory
  inputSchema: Record<string, unknown>
}

/** MCP tool call request */
export type McpToolCallRequest = {
  method: 'tools/call'
  params: {
    name: string
    arguments: Record<string, unknown>
  }
}

/** MCP tool call result */
export type McpToolCallResult = {
  content: {
    type: 'text' | 'resource'
    text?: string
    resource?: {
      uri: string
      mimeType: string
      text: string
    }
  }[]
  isError?: boolean
}
