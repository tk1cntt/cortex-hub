import { z } from 'zod'

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../types.js'
import { apiCall } from '../api-call.js'

/**
 * Register indexing tools.
 * Allows agents to trigger code re-indexing after pushing code changes.
 * Looks up project by git_repo_url, then calls dashboard-api indexing API.
 */
export function registerIndexingTools(server: McpServer, env: Env) {
  server.tool(
    'cortex_code_reindex',
    'Trigger re-indexing of a project after code changes. Looks up the project by name, slug, or repo URL and starts a GitNexus re-index job. Call this after pushing significant code changes to keep code intelligence up-to-date.',
    {
      project: z.string().describe('Project name (e.g. "cortex-hub"), slug, or git repository URL.'),
      branch: z.string().optional().describe('Branch to index (default: auto-detected from git HEAD)'),
    },
    async ({ project, branch }) => {
      try {
        const apiUrl = env.DASHBOARD_API_URL || 'http://localhost:4000'

        // Step 1: Look up project by name/slug/repo URL
        const lookupRes = await apiCall(env, `/api/projects/lookup?repo=${encodeURIComponent(project)}`)

        let projectId: string | null = null

        if (lookupRes.ok) {
          const lookupData = (await lookupRes.json()) as { id?: string }
          projectId = lookupData.id ?? null
        }

        // Fallback: search all projects for matching repo URL
        if (!projectId) {
          const projectsRes = await apiCall(env, '/api/projects')
          if (projectsRes.ok) {
            const data = (await projectsRes.json()) as { projects?: Array<{ id: string; git_repo_url?: string }> }
            const normalize = (url: string) => url.replace(/\.git$/, '').replace(/\/+$/, '')
            const match = data.projects?.find(
              (p) => p.git_repo_url && normalize(p.git_repo_url) === normalize(project)
            )
            projectId = match?.id ?? null
          }
        }

        if (!projectId) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'error',
                  message: `No project found for: ${project}. Register the project in the Cortex Hub dashboard first.`,
                  suggestion: `Go to ${env.DASHBOARD_API_URL || 'your-dashboard'}/projects to add the project.`,
                }, null, 2),
              },
            ],
            isError: true,
          }
        }

        // Step 2: Trigger re-index (API auto-detects branch if not specified)
        const indexBody: Record<string, unknown> = { triggeredBy: 'reindex' }
        if (branch) indexBody.branch = branch

        const indexRes = await apiCall(env, `/api/projects/${projectId}/index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(indexBody),
        })

        const indexData = (await indexRes.json()) as Record<string, unknown>

        if (!indexRes.ok) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  status: 'error',
                  message: indexData.error ?? 'Failed to start indexing',
                  projectId,
                }, null, 2),
              },
            ],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'started',
                projectId,
                jobId: indexData.jobId,
                branch: indexData.branch ?? branch ?? 'main',
                message: 'Re-indexing started. Code intelligence will be updated when complete.',
              }, null, 2),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Reindex error: ${error instanceof Error ? error.message : 'Unknown'}`,
            },
          ],
          isError: true,
        }
      }
    }
  )
}
