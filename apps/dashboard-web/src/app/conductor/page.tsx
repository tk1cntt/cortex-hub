'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import {
  getConductorTasks,
  getConductorTaskStats,
  getConductorAgents,
  createConductorTask,
  type ConductorTask,
  type ConductorAgent,
  type ConductorTaskStats as _ConductorTaskStats,
} from '@/lib/api'
import { config } from '@/lib/config'
import styles from './page.module.css'

// ── Types ──
type StatusFilter = 'all' | 'pending' | 'active' | 'completed'

// ── Helpers ──
function timeAgo(date: string): string {
  const now = new Date()
  const past = new Date(date)
  const diff = Math.floor((now.getTime() - past.getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// ── Components ──
function PriorityBadge({ priority }: { priority: number }) {
  const label = priority <= 1 ? 'critical' : priority <= 2 ? 'high' : priority <= 5 ? 'medium' : 'low'
  const variant = priority <= 2 ? 'error' : priority <= 5 ? 'warning' : 'healthy'
  return <span className={`badge badge-${variant}`}>{label}</span>
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed'
      ? 'healthy'
      : status === 'in_progress' || status === 'accepted'
        ? 'warning'
        : status === 'failed'
          ? 'error'
          : 'warning'
  return <span className={`badge badge-${variant}`}>{status.replace('_', ' ')}</span>
}

function TaskCard({ task }: { task: ConductorTask }) {
  return (
    <div className={`card ${styles.taskCard}`}>
      <div className={styles.taskHeader}>
        <h3 className={styles.taskTitle}>{task.title}</h3>
        <div className={styles.taskBadges}>
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
        </div>
      </div>

      {task.description && (
        <p className={styles.taskDescription}>{task.description}</p>
      )}

      <div className={styles.metaGrid}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Assigned to</span>
          <code className={styles.agentName}>{task.assigned_to_agent ?? '—'}</code>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Created by</span>
          <code className={styles.agentName}>{task.created_by_agent}</code>
        </div>
      </div>

      <div className={styles.taskFooter}>
        <span className={styles.timestamp}>
          {task.created_at ? timeAgo(task.created_at) : '—'}
        </span>
        <code style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
          {task.id.slice(0, 12)}
        </code>
      </div>
    </div>
  )
}

// ── New Task Dialog ──
function NewTaskDialog({
  agents,
  onClose,
  onCreated,
}: {
  agents: ConductorAgent[]
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [priority, setPriority] = useState(5)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await createConductorTask({
        title: title.trim(),
        description: description.trim(),
        assignTo: assignTo || undefined,
        priority,
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>New Task</h2>
          <button className={styles.modalClose} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.formError}>{error}</div>}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Title</label>
            <input
              className={styles.formInput}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix authentication bug"
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Description</label>
            <textarea
              className={styles.formTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details about the task..."
              rows={3}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Assign to</label>
            <select
              className={styles.formSelect}
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.agentId} value={a.agentId}>
                  {a.agentId} {a.status === 'online' ? '(online)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Priority</label>
            <select
              className={styles.formSelect}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            >
              <option value={1}>Critical (1)</option>
              <option value={2}>High (2)</option>
              <option value={5}>Medium (5)</option>
              <option value={8}>Low (8)</option>
            </select>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── WebSocket Hook ──
function useConductorWebSocket(onMessage: (data: unknown) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    // Derive WS URL from API base
    const apiBase = config.api.base
    const wsUrl = apiBase
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:')
      + '/ws/conductor'

    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        // Clear any pending reconnect
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current(data)
        } catch {
          // Ignore non-JSON messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        // Auto-reconnect after 5s
        reconnectTimerRef.current = setTimeout(() => connect(), 5000)
      }

      ws.onerror = () => {
        // onclose will fire after onerror, triggering reconnect
      }
    } catch {
      // Schedule reconnect on connection failure
      reconnectTimerRef.current = setTimeout(() => connect(), 5000)
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on unmount
        wsRef.current.close()
      }
    }
  }, [connect])

  return { connected }
}

// ── Page ──
export default function ConductorPage() {
  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    mutate: mutateTasks,
  } = useSWR('conductor-tasks', () => getConductorTasks(100), {
    refreshInterval: 30000,
  })

  const { data: statsData } = useSWR('conductor-stats', getConductorTaskStats, {
    refreshInterval: 30000,
  })

  const { data: agentsData } = useSWR('conductor-agents', getConductorAgents, {
    refreshInterval: 15000,
  })

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showNewTask, setShowNewTask] = useState(false)

  // WebSocket for real-time updates
  const { connected: wsConnected } = useConductorWebSocket(
    useCallback(
      (data: unknown) => {
        const msg = data as { type?: string }
        if (
          msg.type === 'task_created' ||
          msg.type === 'task_updated' ||
          msg.type === 'task_assigned'
        ) {
          mutateTasks()
        }
      },
      [mutateTasks]
    )
  )

  const allTasks = tasksData?.tasks ?? []
  const stats = (statsData?.stats ?? {
    pending: 0,
    assigned: 0,
    accepted: 0,
    in_progress: 0,
    completed: 0,
    failed: 0,
  }) as Record<string, number>
  const agents = agentsData?.agents ?? []

  const filteredTasks = useMemo(() => {
    if (statusFilter === 'all') return allTasks
    if (statusFilter === 'pending')
      return allTasks.filter((t) => t.status === 'pending' || t.status === 'assigned')
    if (statusFilter === 'active')
      return allTasks.filter((t) => t.status === 'accepted' || t.status === 'in_progress')
    if (statusFilter === 'completed')
      return allTasks.filter((t) => t.status === 'completed')
    return allTasks
  }, [allTasks, statusFilter])

  const pendingCount = (stats.pending || 0) + (stats.assigned || 0)
  const activeCount = (stats.accepted || 0) + (stats.in_progress || 0)
  const completedCount = stats.completed || 0

  const filterTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: allTasks.length },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'active', label: 'Active', count: activeCount },
    { key: 'completed', label: 'Completed', count: completedCount },
  ]

  return (
    <DashboardLayout title="Conductor" subtitle="Task orchestration and agent coordination">
      {/* Stats Bar */}
      <div className={styles.statsGrid}>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>📋</span>
          <div>
            <div className={styles.statValue}>{pendingCount}</div>
            <div className={styles.statLabel}>Pending Tasks</div>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>🔄</span>
          <div>
            <div className={styles.statValue}>{activeCount}</div>
            <div className={styles.statLabel}>Active</div>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statIcon}>✅</span>
          <div>
            <div className={styles.statValue}>{completedCount}</div>
            <div className={styles.statLabel}>Completed</div>
          </div>
        </div>
      </div>

      {/* Task List Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Tasks</h2>
          <div className={styles.headerActions}>
            <div className={styles.wsIndicator}>
              <span className={`${styles.wsDot} ${wsConnected ? styles.wsDotConnected : ''}`} />
              {wsConnected ? 'Live' : 'Polling'}
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => mutateTasks()}
              disabled={tasksLoading}
            >
              {tasksLoading ? 'Loading...' : 'Refresh'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowNewTask(true)}>
              + New Task
            </button>
          </div>
        </div>

        {/* Status Filter Tabs */}
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

        {tasksError && (
          <div className={styles.errorBanner}>Failed to load tasks</div>
        )}

        {filteredTasks.length === 0 && !tasksLoading ? (
          <div className={`card ${styles.emptyState}`}>
            <span className={styles.emptyIcon}>🎯</span>
            <p>
              {allTasks.length > 0
                ? 'No tasks match the current filter.'
                : 'No conductor tasks yet.'}
            </p>
            <p className={styles.emptyHint}>
              Create a task using the <code>+ New Task</code> button or via the{' '}
              <code>POST /api/tasks</code> endpoint.
            </p>
          </div>
        ) : (
          <div className={styles.tasksGrid}>
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>

      {/* New Task Dialog */}
      {showNewTask && (
        <NewTaskDialog
          agents={agents}
          onClose={() => setShowNewTask(false)}
          onCreated={() => mutateTasks()}
        />
      )}
    </DashboardLayout>
  )
}
