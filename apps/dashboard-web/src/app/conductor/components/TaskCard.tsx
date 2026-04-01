'use client'

import { formatTimeAgo, getResultSummary, getTaskDuration, type ConductorTask } from './shared'
import { StatusBadge } from './StatusBadge'
import styles from '../page.module.css'

export function TaskCard({
  task,
  onSelect,
}: {
  task: ConductorTask
  onSelect: () => void
}) {
  const statusClass =
    task.status === 'pending'
      ? styles.taskCardPending
      : task.status === 'in_progress' || task.status === 'analyzing'
        ? styles.taskCardInProgress
        : task.status === 'completed'
          ? styles.taskCardCompleted
          : task.status === 'failed'
            ? styles.taskCardFailed
            : styles.taskCardCancelled

  const resultSummary = task.status === 'completed' ? getResultSummary(task.result, 100) : ''
  const duration = getTaskDuration(task)

  return (
    <div className={`card ${styles.taskCard} ${styles.taskCardCompact} ${statusClass}`} onClick={onSelect}>
      <div className={styles.taskHeader}>
        <h3 className={styles.taskTitle}>{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>

      {/* Result preview for completed tasks */}
      {resultSummary && (
        <div className={styles.taskResultPreview}>{resultSummary}</div>
      )}

      <div className={styles.taskCompactMeta}>
        <code className={styles.agentName}>{task.assigned_to_agent ?? 'unassigned'}</code>
        <span className={styles.taskMetaRight}>
          {duration && <span className={styles.taskDuration}>⏱ {duration}</span>}
          <span className={styles.timestamp}>
            {task.created_at ? formatTimeAgo(task.created_at) : '--'}
          </span>
        </span>
      </div>
    </div>
  )
}
