import type { Env } from '../types.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

/**
 * Register Session Tools
 *
 * cortex_session_start: Mandatory tool to begin a session.
 * Returns the project mission brief and quality standards.
 * Enhanced with Conductor Phase 1v2 identity fields.
 */
export function registerSessionTools(server: McpServer, env: Env) {
  server.tool(
    'cortex_session_start',
    'Start a new execution session with optional agent identity metadata.',
    {
      repo: z.string().describe('The URL of the repository being worked on'),
      mode: z.string().optional().describe('Session mode: development, onboarding, review'),
      agentId: z.string().optional().describe('Agent identifier (e.g. claude-code)'),
      hostname: z.string().optional().describe('Machine hostname'),
      os: z.string().optional().describe('Operating system (macOS/Windows/Linux)'),
      ide: z.string().optional().describe('IDE type (claude-code-cli/claude-code-vscode/antigravity/cursor/windsurf/codex)'),
      branch: z.string().optional().describe('Current git branch'),
      capabilities: z.array(z.string()).optional().describe('Agent capabilities'),
      role: z.string().optional().describe('Agent role from agent-identity.json'),
    },
    async ({ repo, mode, agentId, hostname, os, ide, branch, capabilities, role }) => {
      const missionBrief = `
# Mission Brief: Cortex Hub (Phase 6)
Current Goal: Polish, GA Release, and Quality Enforcement.

## Mandatory Standards:
- SOLID Principles: Applied to all shared packages.
- Clean Architecture: Decoupled services (hub-mcp, dashboard-api).
- Quality Gates: pnpm build, typecheck, and lint MUST pass before commit.

## Active Task:
Resuming current objective from STATE.md.
      `.trim()

      // Register session with the dashboard API
      let sessionId = `sess_${Math.random().toString(36).substr(2, 9)}`
      try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: `session_start:${mode ?? 'development'}`,
            project: repo,
            agentId: agentId ?? 'claude-code',
            hostname,
            os,
            ide,
            branch,
            capabilities,
            role,
          }),
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const data = await response.json() as { sessionId?: string }
          if (data.sessionId) sessionId = data.sessionId
        }
      } catch {
        // Dashboard API unavailable — continue with local session ID
      }

      // Search for relevant knowledge/recipes to suggest (OpenSpace-inspired)
      let relevantKnowledge: Array<{ id: string; title: string; description: string; origin: string; quality: Record<string, number> }> = []
      try {
        const searchQuery = mode ?? branch ?? 'development'
        const knowledgeRes = await fetch(`${env.DASHBOARD_API_URL}/api/knowledge/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery, limit: 3 }),
          signal: AbortSignal.timeout(5000),
        })
        if (knowledgeRes.ok) {
          const data = await knowledgeRes.json() as {
            results?: Array<{
              documentId?: string
              title?: string
              content?: string
              origin?: string
              quality?: Record<string, number>
              deprecated?: boolean
            }>
          }
          relevantKnowledge = (data.results ?? [])
            .filter(r => r.documentId && !r.deprecated)
            .slice(0, 3)
            .map(r => ({
              id: r.documentId!,
              title: r.title ?? '',
              description: (r.content ?? '').slice(0, 200),
              origin: r.origin ?? 'manual',
              quality: r.quality ?? {},
            }))
        }
      } catch {
        // Knowledge search unavailable — continue without suggestions
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              session_id: sessionId,
              mission_brief: missionBrief,
              status: 'active',
              standards: ['SOLID', 'Clean Architecture', 'Phase Gate Enforcement'],
              identity: {
                agentId: agentId ?? 'claude-code',
                hostname: hostname ?? null,
                os: os ?? null,
                ide: ide ?? null,
                branch: branch ?? null,
                capabilities: capabilities ?? [],
                role: role ?? null,
              },
              relevant_knowledge: relevantKnowledge.length > 0 ? relevantKnowledge : undefined,
            }, null, 2)
          }
        ]
      }
    }
  )

  server.tool(
    'cortex_session_end',
    'Close a session with a summary of work done. Reports session duration and compliance.',
    {
      sessionId: z.string().describe('The session ID from cortex_session_start'),
      summary: z.string().describe('Brief summary of work done in this session'),
    },
    async ({ sessionId, summary }) => {
      try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/sessions/${encodeURIComponent(sessionId)}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ summary }),
          signal: AbortSignal.timeout(10000),
        })

        if (response.ok) {
          const data = await response.json() as { session?: { id: string; status: string; duration?: number } }
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status: 'closed',
                sessionId,
                summary,
                session: data.session ?? null,
              }, null, 2),
            }],
          }
        }

        // Fallback: mark session completed directly if endpoint doesn't exist
        try {
          await fetch(`${env.DASHBOARD_API_URL}/api/sessions/handoff`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              action: 'session_end',
              status: 'completed',
              summary,
            }),
            signal: AbortSignal.timeout(5000),
          })
        } catch { /* ignore */ }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ status: 'closed', sessionId, summary }, null, 2),
          }],
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Session end error: ${error instanceof Error ? error.message : 'Unknown'}`,
          }],
          isError: true,
        }
      }
    }
  )
}
