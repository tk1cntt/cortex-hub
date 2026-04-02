'use client'

import { useState, useMemo, useCallback } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import {
  getConductorTasks,
  getConductorAgents,
  cancelConductorTask,
  deleteConductorTask,
  deletePipeline,
  type ConductorTask,
  type ConductorAgent,
} from '@/lib/api'
import {
  TaskBriefingWizard,
  PipelineDiagram,
  TaskCard,
  TaskDetail,
  AgentDetail,
  type StatusFilter,
  type ViewMode,
  type TaskPrefill,
  type ResumeTask,
  type TaskStrategy,
  buildTaskTree,
  flattenTree,
  getIdeInfo,
  getCapColor,
  getResultSummary,
  getTaskDuration,
  StatusBadge,
  type TaskTreeNode,
} from './components'
import styles from './page.module.css'

// ── Pipeline tree views ──

/** Pipeline tree row — shows task with indentation and connector lines */
function PipelineRow({
  node,
  onSelect,
  isLast,
}: {
  node: TaskTreeNode
  onSelect: () => void
  isLast: boolean
}) {
  const { task, children, depth } = node
  const hasChildren = children.length > 0

  const statusColor = task.status === 'completed' ? 'completed'
    : task.status === 'in_progress' ? 'inProgress'
    : task.status === 'failed' ? 'failed' : 'pending'

  const resultSummary = task.status === 'completed' ? getResultSummary(task.result, 80) : ''
  const duration = getTaskDuration(task)

  return (
    <div>
      <div
        className={`${styles.pipelineRow} ${depth === 0 ? styles.pipelineRowRoot : ''}`}
        onClick={onSelect}
        style={{ paddingLeft: `${depth * 36 + 20}px` }}
      >
        {depth > 0 && (
          <span
            className={`${styles.connector} ${isLast ? styles.connectorLast : styles.connectorMid}`}
            data-status={statusColor}
          />
        )}
        <span className={`${styles.pipelineDot} ${
          task.status === 'completed' ? styles.dotCompleted
          : task.status === 'in_progress' ? styles.dotInProgress
          : task.status === 'failed' ? styles.dotFailed
          : styles.dotPending
        }`} />
        <span className={`${styles.pipelineTitle} ${depth === 0 ? styles.pipelineTitleRoot : ''}`}>
          {hasChildren && <span className={styles.pipelineExpandIcon}>▾</span>}
          {task.title}
        </span>
        <span className={styles.pipelineFlow}>
          {task.created_by_agent && <code className={styles.flowAgent}>{task.created_by_agent}</code>}
          {task.assigned_to_agent && (
            <>
              <span className={styles.flowArrow}>→</span>
              <code className={styles.flowAgent}>{task.assigned_to_agent}</code>
            </>
          )}
          {task.completed_by && task.completed_by !== task.assigned_to_agent && (
            <>
              <span className={styles.flowArrow}>→</span>
              <code className={styles.flowAgentDone}>{task.completed_by}</code>
            </>
          )}
        </span>
        <StatusBadge status={task.status} />
      </div>
      {/* Result outcome line */}
      {resultSummary && (
        <div
          className={styles.pipelineOutcome}
          style={{ paddingLeft: `${depth * 36 + 20}px` }}
        >
          {resultSummary}
          {duration && <span className={styles.pipelineDuration}>⏱ {duration}</span>}
        </div>
      )}
    </div>
  )
}

/** Classic Pipeline view — renders task tree with delegation arrows + per-pipeline diagram & delete */
function PipelineView({
  tasks,
  onSelectTask,
  onDeletePipeline,
  onShowDiagram,
}: {
  tasks: ConductorTask[]
  onSelectTask: (task: ConductorTask) => void
  onDeletePipeline: (rootTaskId: string) => void
  onShowDiagram: (rootTaskId: string) => void
}) {
  const tree = useMemo(() => buildTaskTree(tasks), [tasks])
  const flat = useMemo(() => flattenTree(tree), [tree])

  if (flat.length === 0) {
    return (
      <div className={`card ${styles.emptyState}`}>
        <p>No tasks with parent-child relationships found.</p>
      </div>
    )
  }

  const withChildren = flat.filter((n) => n.depth === 0 && n.children.length > 0)
  const rootIds = new Set(withChildren.map((n) => n.task.id))

  function hasAncestorIn(node: TaskTreeNode, ids: Set<string>, allNodes: TaskTreeNode[]): boolean {
    let parentId = node.task.parent_task_id
    while (parentId) {
      if (ids.has(parentId)) return true
      const parent = allNodes.find((n) => n.task.id === parentId)
      parentId = parent?.task.parent_task_id ?? null
    }
    return false
  }

  const pipelineTasks = flat.filter((n) => rootIds.has(n.task.id) || (n.depth > 0 && hasAncestorIn(n, rootIds, flat)))
  const orphans = flat.filter((n) => n.depth === 0 && n.children.length === 0)

  return (
    <div>
      {withChildren.length > 0 && (
        <div className={`card ${styles.pipelineCard}`}>
          <div className={styles.pipelineHeader}>
            <h3 className={styles.pipelineHeaderTitle}>Task Pipeline</h3>
            <span className={styles.pipelineHeaderCount}>{pipelineTasks.length} tasks in {withChildren.length} pipelines</span>
          </div>
          {withChildren.map((rootNode) => {
            const subtreeFlat = flattenTree([rootNode])
            const root = rootNode.task
            const subtaskCount = rootNode.children.length
            const completedCount = rootNode.children.filter((c) => c.task.status === 'completed').length
            const allComplete = subtaskCount > 0 && completedCount === subtaskCount

            let rootCaps: string[] = []
            if (root.required_capabilities) {
              try {
                const parsed = JSON.parse(root.required_capabilities)
                if (Array.isArray(parsed)) rootCaps = parsed
              } catch { /* ignore */ }
            }

            return (
              <div key={rootNode.task.id}>
                <div className={styles.orchestratorHeader}>
                  <div className={styles.orchestratorInfo}>
                    <div className={styles.orchestratorAgent}>
                      Orchestrator: <code>{root.created_by_agent ?? 'unknown'}</code>
                    </div>
                    {rootCaps.length > 0 && (
                      <div className={styles.orchestratorCaps}>
                        {rootCaps.map((cap) => {
                          const capColor = getCapColor(cap)
                          return <span key={cap} className={`${styles.capBadge} ${capColor ? styles[capColor] : ''}`}>{cap}</span>
                        })}
                      </div>
                    )}
                    {root.description && (
                      <div className={styles.orchestratorOutcome}>
                        {root.description.slice(0, 200)}{root.description.length > 200 ? '...' : ''}
                      </div>
                    )}
                  </div>
                  <div className={styles.orchestratorMeta}>
                    <span className={`${styles.orchestratorProgress} ${allComplete ? styles.orchestratorProgressComplete : ''}`}>
                      {completedCount}/{subtaskCount} subtasks
                    </span>
                    <StatusBadge status={root.status} />
                    <div className={styles.pipelineActions}>
                      <button
                        className={styles.pipelineActionBtn}
                        title="View pipeline diagram"
                        onClick={(e) => { e.stopPropagation(); onShowDiagram(root.id) }}
                      >
                        🔗
                      </button>
                      <button
                        className={`${styles.pipelineActionBtn} ${styles.pipelineActionBtnDanger}`}
                        title="Delete entire pipeline"
                        onClick={(e) => { e.stopPropagation(); onDeletePipeline(root.id) }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>

                {subtreeFlat.map((node) => {
                  const siblings = subtreeFlat.filter((n) =>
                    n.depth === node.depth && n.task.parent_task_id === node.task.parent_task_id
                  )
                  const isLast = siblings[siblings.length - 1]?.task.id === node.task.id
                  return (
                    <PipelineRow
                      key={node.task.id}
                      node={node}
                      onSelect={() => onSelectTask(node.task)}
                      isLast={isLast}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {orphans.length > 0 && (
        <div className={`card ${styles.pipelineCard}`} style={{ marginTop: 'var(--space-4)' }}>
          <div className={styles.pipelineHeader}>
            <h3 className={styles.pipelineHeaderTitle}>Standalone Tasks</h3>
            <span className={styles.pipelineHeaderCount}>{orphans.length}</span>
          </div>
          {orphans.map((node) => (
            <PipelineRow
              key={node.task.id}
              node={node}
              onSelect={() => onSelectTask(node.task)}
              isLast
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Page ──
export default function ConductorPage() {
  const { data, error, isLoading, mutate } = useSWR('conductor-tasks', () => getConductorTasks({ limit: 200 }), {
    refreshInterval: 10000,
  })
  const { data: agentsData } = useSWR('conductor-agents', getConductorAgents, {
    refreshInterval: 5000,
  })

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedTask, setSelectedTask] = useState<ConductorTask | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<ConductorAgent | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [taskPrefill, setTaskPrefill] = useState<TaskPrefill | undefined>(undefined)
  const [resumeTask, setResumeTask] = useState<ResumeTask | undefined>(undefined)
  const [diagramPipelineId, setDiagramPipelineId] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const allTasks = data?.tasks ?? []
  const agents = agentsData?.agents ?? []
  const onlineCount = agentsData?.online ?? agents.length
  const [agentsCollapsed, setAgentsCollapsed] = useState(false)

  const taskIdsWithChildren = useMemo(() => {
    const ids = new Set<string>()
    for (const t of allTasks) {
      if (t.parent_task_id) ids.add(t.parent_task_id)
    }
    return ids
  }, [allTasks])

  const filteredTasks = useMemo(() => {
    const byStatus = statusFilter === 'all' ? allTasks : allTasks.filter((t) => t.status === statusFilter)
    if (viewMode === 'list') {
      return byStatus.filter((t) => !t.parent_task_id && !taskIdsWithChildren.has(t.id))
    }
    return byStatus
  }, [allTasks, statusFilter, viewMode, taskIdsWithChildren])

  const counts = useMemo(() => ({
    all: allTasks.length,
    pending: allTasks.filter((t) => t.status === 'pending').length,
    in_progress: allTasks.filter((t) => t.status === 'in_progress').length,
    completed: allTasks.filter((t) => t.status === 'completed').length,
    failed: allTasks.filter((t) => t.status === 'failed').length,
    cancelled: allTasks.filter((t) => t.status === 'cancelled').length,
  }), [allTasks])

  const handleCancel = useCallback(async (id: string) => {
    try {
      await cancelConductorTask(id)
      mutate()
    } catch (err) {
      console.error('Failed to cancel task:', err)
    }
  }, [mutate])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteConductorTask(id)
      mutate()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }, [mutate])

  const handleDeletePipeline = useCallback(async (rootTaskId: string) => {
    try {
      await deletePipeline(rootTaskId, allTasks)
      setDeleteConfirm(null)
      mutate()
    } catch (err) {
      console.error('Failed to delete pipeline:', err)
    }
  }, [allTasks, mutate])

  const handleNewTaskFromOutcome = useCallback((task: ConductorTask) => {
    const resultText = task.result ? getResultSummary(task.result, 2000) : ''
    setTaskPrefill({
      title: `Follow-up: ${task.title}`,
      description: resultText
        ? `## Context\nBased on outcome from task "${task.title}" (${task.id}):\n\n${resultText}`
        : `Follow-up task for: ${task.title}`,
      context: { parentTaskId: task.id, sourceTaskTitle: task.title },
    })
    setSelectedTask(null)
    setShowCreateForm(true)
  }, [])

  // Get pipeline tasks for diagram modal
  const diagramTasks = useMemo(() => {
    if (!diagramPipelineId) return []
    const ids = new Set<string>()
    function collect(parentId: string) {
      ids.add(parentId)
      for (const t of allTasks) {
        if (t.parent_task_id === parentId) collect(t.id)
      }
    }
    collect(diagramPipelineId)
    return allTasks.filter((t) => ids.has(t.id))
  }, [diagramPipelineId, allTasks])

  const filterTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'in_progress', label: 'In Progress', count: counts.in_progress },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'failed', label: 'Failed', count: counts.failed },
    { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ]

  return (
    <DashboardLayout title="Conductor" subtitle="Task assignment and agent orchestration">
      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>📋</span>
          <div>
            <div className={styles.statValue}>{counts.all}</div>
            <div className={styles.statLabel}>Total</div>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>⏳</span>
          <div>
            <div className={styles.statValue}>{counts.pending}</div>
            <div className={styles.statLabel}>Pending</div>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>⚡</span>
          <div>
            <div className={styles.statValue}>{counts.in_progress}</div>
            <div className={styles.statLabel}>Running</div>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>✅</span>
          <div>
            <div className={styles.statValue}>{counts.completed}</div>
            <div className={styles.statLabel}>Done</div>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>❌</span>
          <div>
            <div className={styles.statValue}>{counts.failed}</div>
            <div className={styles.statLabel}>Failed</div>
          </div>
        </div>
      </div>

      {/* Agents Online */}
      {agents.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2
              className={`${styles.sectionTitle} ${styles.sectionTitleCollapsible}`}
              onClick={() => setAgentsCollapsed(!agentsCollapsed)}
            >
              <span className={`${styles.collapseIcon} ${agentsCollapsed ? styles.collapseIconClosed : ''}`}>▾</span>
              Agents <span className={styles.filterCount}>{onlineCount} online</span>
            </h2>
          </div>
          {!agentsCollapsed && (
            <div className={styles.agentsGrid}>
              {agents.map((agent: ConductorAgent) => {
                const { icon: ideIcon, label: ideLabel, colorClass } = getIdeInfo(agent.ide)
                const ideColor = colorClass ? styles[colorClass] : ''
                const statusLabel = agent.status === 'idle' ? 'Idle' : agent.status === 'busy' ? 'Busy' : 'Online'
                const statusClass = agent.status === 'idle' ? styles.agentOnline : agent.status === 'busy' ? styles.agentBusy : styles.agentOnline
                const platform = agent.platform ?? (agent.hostname?.includes('Mac') ? 'macOS' : 'unknown')

                return (
                  <div key={agent.agentId} className={`card ${styles.agentCard} ${styles.agentCardClickable}`} onClick={() => setSelectedAgent(agent)}>
                    <div className={styles.agentHeader}>
                      <span className={`${styles.agentIdeIcon} ${ideColor}`}>{ideIcon}</span>
                      <div className={styles.agentIdentity}>
                        <strong className={styles.agentIdText}>{agent.agentId}</strong>
                        <span className={styles.agentIdeLabel}>{ideLabel}</span>
                      </div>
                      <div className={styles.agentStatusBadge}>
                        <span className={`${styles.agentDot} ${statusClass}`} />
                        <span className={styles.agentStatusText}>{statusLabel}</span>
                      </div>
                    </div>

                    <div className={styles.agentDetails}>
                      <div className={styles.agentDetailRow}>
                        <span className={styles.agentDetailLabel}>Host</span>
                        <span className={styles.agentDetailValue}>{agent.hostname ?? '-'}</span>
                      </div>
                      <div className={styles.agentDetailRow}>
                        <span className={styles.agentDetailLabel}>Platform</span>
                        <span className={styles.agentDetailValue}>{platform}</span>
                      </div>
                      <div className={styles.agentDetailRow}>
                        <span className={styles.agentDetailLabel}>Owner</span>
                        <span className={styles.agentDetailValue}>{agent.apiKeyOwner}</span>
                      </div>
                      <div className={styles.agentDetailRow}>
                        <span className={styles.agentDetailLabel}>Connected</span>
                        <span className={styles.agentDetailValue}>{new Date(agent.connectedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    {agent.capabilities && agent.capabilities.length > 0 ? (
                      <div className={styles.agentCaps}>
                        {agent.capabilities.map((cap) => {
                          const capColorClass = getCapColor(cap)
                          return <span key={cap} className={`${styles.capBadge} ${capColorClass ? styles[capColorClass] : ''}`}>{cap}</span>
                        })}
                      </div>
                    ) : (
                      <div className={styles.agentCapsEmpty}>No capabilities registered</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Pending Strategy / Analyzing Banner */}
      {allTasks.filter(t => t.status === 'strategy_review' || t.status === 'analyzing' || (t.status === 'accepted' && (() => { try { const c = typeof t.context === 'string' ? JSON.parse(t.context) : t.context; return c?.workflow === 'orchestrated' } catch { return false } })())).map(task => {
        const ctx = typeof task.context === 'string' ? (() => { try { return JSON.parse(task.context) } catch { return {} } })() : (task.context ?? {})
        const hasStrategy = task.status === 'strategy_review' && ctx.strategy
        const isAnalyzing = task.status === 'accepted' || task.status === 'analyzing'
        return (
          <div key={task.id} className={`card ${styles.statCard}`} style={{ marginBottom: 'var(--space-3)', cursor: 'pointer', borderLeft: `3px solid ${hasStrategy ? 'var(--status-warning)' : 'var(--primary)'}` }}
            onClick={() => {
              if (hasStrategy) {
                setResumeTask({ task, strategy: ctx.strategy })
              } else {
                // Resume wizard at step 3 — will re-poll for strategy
                setResumeTask({ task, strategy: undefined as unknown as TaskStrategy })
              }
              setShowCreateForm(true)
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>{hasStrategy ? '📋' : '⏳'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{task.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {hasStrategy
                  ? `Strategy ready — click to review & approve (${task.assigned_to_agent})`
                  : `Agent ${task.assigned_to_agent} is analyzing... — click to resume`
                }
              </div>
            </div>
            {hasStrategy
              ? <span className="btn btn-primary btn-sm">Review Strategy →</span>
              : isAnalyzing && <span className="btn btn-secondary btn-sm">Resume →</span>
            }
          </div>
        )
      })}

      {/* Tasks Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Tasks</h2>
          <div className={styles.headerActions}>
            <div className={styles.viewToggleWrap}>
              <div className={styles.viewToggle}>
                <button
                  className={`${styles.viewToggleBtn} ${viewMode === 'list' ? styles.viewToggleActive : ''}`}
                  onClick={() => setViewMode('list')}
                  title="Simple standalone tasks"
                >
                  📝 List
                </button>
                <button
                  className={`${styles.viewToggleBtn} ${viewMode === 'pipeline' ? styles.viewToggleActive : ''}`}
                  onClick={() => setViewMode('pipeline')}
                  title="Multi-agent workflows"
                >
                  🔀 Pipeline
                </button>
              </div>
              <span className={styles.viewToggleHint}>
                {viewMode === 'list' ? 'Simple standalone tasks' : 'Multi-agent workflows'}
              </span>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setTaskPrefill(undefined); setShowCreateForm(true) }}
            >
              + New Task
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => mutate()}
              disabled={isLoading}
            >
              {isLoading ? '...' : '↻'}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className={styles.filterTabs}>
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.filterTab} ${statusFilter === tab.key ? styles.filterTabActive : ''}`}
              onClick={() => setStatusFilter(tab.key)}
            >
              {tab.label}
              <span className={styles.filterCount}>{tab.count}</span>
            </button>
          ))}
        </div>

        {error && (
          <div className={styles.errorBanner}>Failed to load tasks</div>
        )}

        {/* View Content */}
        {viewMode === 'pipeline' ? (
          <PipelineView
            tasks={filteredTasks}
            onSelectTask={setSelectedTask}
            onDeletePipeline={(rootId) => setDeleteConfirm(rootId)}
            onShowDiagram={(rootId) => setDiagramPipelineId(rootId)}
          />
        ) : filteredTasks.length === 0 && !isLoading ? (
          <div className={`card ${styles.emptyState}`}>
            <span className={styles.emptyIcon}>T</span>
            <p>
              {allTasks.length > 0
                ? 'No tasks match the current filter.'
                : 'No conductor tasks yet.'}
            </p>
            <p className={styles.emptyHint}>
              Create tasks via the dashboard or the <code>cortex_task_create</code> MCP tool.
            </p>
          </div>
        ) : (
          <div className={styles.tasksGrid}>
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onSelect={() => setSelectedTask(task)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pipeline Diagram Modal */}
      {diagramPipelineId && diagramTasks.length > 0 && (
        <div className={styles.diagramModalOverlay} onClick={() => setDiagramPipelineId(null)}>
          <div className={styles.diagramModalPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.diagramModalHeader}>
              <h2 className={styles.diagramModalTitle}>
                🔗 Pipeline Diagram
                <span className={styles.diagramModalSubtitle}>
                  {diagramTasks.length} tasks
                </span>
              </h2>
              <button className={styles.detailClose} onClick={() => setDiagramPipelineId(null)}>×</button>
            </div>
            <div className={styles.diagramModalBody}>
              <PipelineDiagram
                tasks={diagramTasks}
                onNodeClick={(task) => { setDiagramPipelineId(null); setSelectedTask(task) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Pipeline Confirmation */}
      {deleteConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.confirmPanel} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>🗑️ Delete Pipeline</h3>
            <p className={styles.confirmText}>
              This will <strong>cancel all pending/running tasks</strong> and <strong>permanently delete</strong> the entire pipeline including all subtasks.
            </p>
            <p className={styles.confirmText} style={{ color: 'var(--status-error)' }}>
              This action cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--status-error)', color: 'white', border: 'none' }}
                onClick={() => handleDeletePipeline(deleteConfirm)}
              >
                Delete Pipeline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Slide-over */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onCancel={() => handleCancel(selectedTask.id)}
          onDelete={() => handleDelete(selectedTask.id)}
          onNewTaskFromOutcome={handleNewTaskFromOutcome}
        />
      )}

      {/* Agent Detail Slide-over */}
      {selectedAgent && (
        <AgentDetail
          agent={selectedAgent}
          allTasks={allTasks}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* New Task Wizard */}
      {showCreateForm && (
        <TaskBriefingWizard
          onClose={() => { setShowCreateForm(false); setTaskPrefill(undefined); setResumeTask(undefined) }}
          onCreated={() => mutate()}
          agents={agents}
          prefill={taskPrefill}
          resume={resumeTask}
        />
      )}
    </DashboardLayout>
  )
}
