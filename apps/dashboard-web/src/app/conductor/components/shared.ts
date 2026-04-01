import type { ConductorTask, ConductorTaskLog } from '@/lib/api'

// ── Types ──
export type StatusFilter = 'all' | 'pending' | 'assigned' | 'accepted' | 'in_progress' | 'review' | 'completed' | 'failed' | 'cancelled'
export type ViewMode = 'list' | 'pipeline'

export interface TaskTreeNode {
  task: ConductorTask
  children: TaskTreeNode[]
  depth: number
}

/** Strategy proposed by lead agent after task analysis */
export interface TaskStrategy {
  summary: string
  roles: StrategyRole[]
  subtasks: StrategySubtask[]
  estimatedEffort?: string
}

export interface StrategyRole {
  role: string
  label: string
  agent: string
  rationale: string
  capabilities?: string[]
}

export interface StrategySubtask {
  title: string
  description?: string
  role: string
  dependsOn?: string[]
  priority?: number
}

/** Task briefing acceptance criteria item */
export interface AcceptanceCriterion {
  id: string
  text: string
  completed: boolean
}

/** Image attachment */
export interface ImageAttachment {
  data: string
  name: string
}

// ── Helpers ──
export function formatTimeAgo(dateStr: string): string {
  const now = new Date()
  const past = new Date(dateStr)
  const diff = Math.floor((now.getTime() - past.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function formatJson(value: string | null): string {
  if (!value) return ''
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

/** Parse result JSON into a structured display */
export type ParsedResult =
  | { type: 'empty' }
  | { type: 'string'; text: string }
  | { type: 'subtasks'; items: { title?: string; status?: string; message?: string; agent?: string; [k: string]: unknown }[] }
  | { type: 'object'; summary: { key: string; value: string }[]; raw: string }

export function parseResult(value: string | null): ParsedResult {
  if (!value) return { type: 'empty' }
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed === 'string') return { type: 'string', text: parsed }
    if (Array.isArray(parsed)) {
      return { type: 'subtasks', items: parsed }
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.subtaskResults)) {
        return { type: 'subtasks', items: parsed.subtaskResults }
      }
      const summary: { key: string; value: string }[] = []
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          summary.push({ key: k, value: String(v) })
        } else if (v === null) {
          summary.push({ key: k, value: '—' })
        }
      }
      return { type: 'object', summary, raw: JSON.stringify(parsed, null, 2) }
    }
    return { type: 'string', text: String(parsed) }
  } catch {
    return { type: 'string', text: value }
  }
}

/** Build a tree from flat task list using parent_task_id */
export function buildTaskTree(tasks: ConductorTask[]): TaskTreeNode[] {
  const taskMap = new Map<string, TaskTreeNode>()
  const roots: TaskTreeNode[] = []

  for (const task of tasks) {
    taskMap.set(task.id, { task, children: [], depth: 0 })
  }

  for (const task of tasks) {
    const node = taskMap.get(task.id)!
    if (task.parent_task_id && taskMap.has(task.parent_task_id)) {
      const parent = taskMap.get(task.parent_task_id)!
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  function sortChildren(nodes: TaskTreeNode[]) {
    nodes.sort((a, b) => a.task.priority - b.task.priority || a.task.created_at.localeCompare(b.task.created_at))
    for (const node of nodes) sortChildren(node.children)
  }
  sortChildren(roots)
  return roots
}

/** Flatten tree into ordered list with depth info for rendering */
export function flattenTree(nodes: TaskTreeNode[]): TaskTreeNode[] {
  const result: TaskTreeNode[] = []
  function walk(list: TaskTreeNode[]) {
    for (const node of list) {
      result.push(node)
      walk(node.children)
    }
  }
  walk(nodes)
  return result
}

/** Get status icon symbol */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'completed': return '✓'
    case 'in_progress': return '●'
    case 'review': return '◎'
    case 'failed': return '✗'
    case 'pending': return '○'
    case 'assigned': return '◐'
    case 'accepted': return '◑'
    case 'analyzing': return '◉'
    case 'approved': return '✓'
    default: return '○'
  }
}

/** Get IDE display info */
export function getIdeInfo(ide?: string): { icon: string; label: string; colorClass: string } {
  switch (ide) {
    case 'claude-code': return { icon: 'C', label: 'Claude Code', colorClass: 'ideBlue' }
    case 'codex': return { icon: 'X', label: 'OpenAI Codex', colorClass: 'ideGreen' }
    case 'antigravity': return { icon: 'G', label: 'Antigravity (Gemini)', colorClass: 'idePurple' }
    case 'cursor': return { icon: 'Cu', label: 'Cursor', colorClass: 'ideOrange' }
    default: return { icon: 'A', label: ide ?? 'Unknown', colorClass: '' }
  }
}

/** Get capability badge color class name */
export function getCapColor(cap: string): string {
  if (['backend', 'frontend', 'database', 'server'].includes(cap)) return 'capCode'
  if (['review', 'testing'].includes(cap)) return 'capReview'
  if (['devops', 'docker', 'deploy'].includes(cap)) return 'capDeploy'
  if (['design'].includes(cap)) return 'capDesign'
  if (['security'].includes(cap)) return 'capSecurity'
  return ''
}

// Re-export for convenient imports
export type { ConductorTask, ConductorTaskLog }
