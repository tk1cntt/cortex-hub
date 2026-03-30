import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Env } from '../types.js'
import { fetchNotifications, formatConductorBlock } from '../notifications.js'

/**
 * Register Conductor tools for multi-agent task orchestration.
 *
 * Tools:
 *   cortex.task.create   — assign a task to another agent
 *   cortex.task.accept   — accept an assigned task
 *   cortex.task.complete — mark a task as completed
 *   cortex.task.list     — list tasks for an agent
 */
export function registerConductorTools(server: McpServer, env: Env) {
  // task.create — create and assign a task to an agent
  server.tool(
    'cortex.task.create',
    'Create a task and assign it to another AI agent. The target agent will be notified automatically via Conductor injection.',
    {
      title: z.string().describe('Short title for the task'),
      description: z.string().optional().describe('Detailed description of what needs to be done'),
      assignedTo: z.string().describe('Agent name to assign the task to'),
      createdBy: z.string().describe('Your agent name'),
      priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Task priority (default: medium)'),
      notifyOnComplete: z.array(z.string()).optional().describe('Agent names to notify when this task is completed'),
    },
    async ({ title, description, assignedTo, createdBy, priority, notifyOnComplete }) => {
      try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/tasks/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, assignedTo, createdBy, priority, notifyOnComplete }),
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return {
            content: [{ type: 'text' as const, text: `Task creation failed: ${response.status} ${errorText}` }],
            isError: true,
          }
        }

        const data = await response.json() as { taskId: string }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              taskId: data.taskId,
              assignedTo,
              priority: priority ?? 'medium',
              message: `Task assigned to ${assignedTo}. They will see it on their next MCP call.`,
            }, null, 2),
          }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Task create error: ${error instanceof Error ? error.message : 'Unknown'}` }],
          isError: true,
        }
      }
    }
  )

  // task.accept — accept a task
  server.tool(
    'cortex.task.accept',
    'Accept an assigned task, signalling that you are now working on it.',
    {
      taskId: z.string().describe('The task ID to accept'),
    },
    async ({ taskId }) => {
      try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/tasks/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId }),
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return {
            content: [{ type: 'text' as const, text: `Task accept failed: ${response.status} ${errorText}` }],
            isError: true,
          }
        }

        return {
          content: [{ type: 'text' as const, text: `Task ${taskId} accepted. Status changed to "accepted".` }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Task accept error: ${error instanceof Error ? error.message : 'Unknown'}` }],
          isError: true,
        }
      }
    }
  )

  // task.complete — mark task as completed
  server.tool(
    'cortex.task.complete',
    'Mark a task as completed with an optional result. Agents listed in notifyOnComplete will be notified.',
    {
      taskId: z.string().describe('The task ID to complete'),
      result: z.string().optional().describe('Summary of the work done or output location'),
      completedBy: z.string().optional().describe('Your agent name'),
    },
    async ({ taskId, result, completedBy }) => {
      try {
        const response = await fetch(`${env.DASHBOARD_API_URL}/api/tasks/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, result, completedBy }),
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return {
            content: [{ type: 'text' as const, text: `Task complete failed: ${response.status} ${errorText}` }],
            isError: true,
          }
        }

        return {
          content: [{ type: 'text' as const, text: `Task ${taskId} marked as completed.` }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Task complete error: ${error instanceof Error ? error.message : 'Unknown'}` }],
          isError: true,
        }
      }
    }
  )

  // task.list — list tasks for an agent
  server.tool(
    'cortex.task.list',
    'List tasks assigned to a specific agent, optionally filtered by status.',
    {
      agentId: z.string().describe('The agent name to list tasks for'),
      status: z.string().optional().describe('Filter by status: assigned, accepted, in_progress, completed, cancelled'),
    },
    async ({ agentId, status }) => {
      try {
        const url = new URL(`${env.DASHBOARD_API_URL}/api/tasks/agent/${encodeURIComponent(agentId)}`)
        if (status) url.searchParams.set('status', status)

        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(10000),
        })

        if (!response.ok) {
          const errorText = await response.text()
          return {
            content: [{ type: 'text' as const, text: `Task list failed: ${response.status} ${errorText}` }],
            isError: true,
          }
        }

        const data = await response.json()
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Task list error: ${error instanceof Error ? error.message : 'Unknown'}` }],
          isError: true,
        }
      }
    }
  )

  // task.notifications — fetch and display conductor notifications (mainly for debugging)
  server.tool(
    'cortex.task.notifications',
    'Fetch pending task notifications for the current agent. Normally these are injected automatically into every MCP response.',
    {
      agentId: z.string().describe('The agent name to check notifications for'),
    },
    async ({ agentId }) => {
      try {
        const block = await fetchNotifications(env, agentId)
        return {
          content: [{ type: 'text' as const, text: block || 'No pending notifications.' }],
        }
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `Notification fetch error: ${error instanceof Error ? error.message : 'Unknown'}` }],
          isError: true,
        }
      }
    }
  )
}
