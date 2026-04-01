'use client'

import { formatTimeAgo, type ConductorTask } from './shared'
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

  return (
    <div className={`card ${styles.taskCard} ${styles.taskCardCompact} ${statusClass}`} onClick={onSelect}>
      <div className={styles.taskHeader}>
        <h3 className={styles.taskTitle}>{task.title}</h3>
        <StatusBadge status={task.status} />
      </div>

      <div className={styles.taskCompactMeta}>
        <code className={styles.agentName}>{task.assigned_to_agent ?? 'unassigned'}</code>
        <span className={styles.timestamp}>
          {task.created_at ? formatTimeAgo(task.created_at) : '--'}
        </span>
      </div>
    </div>
  )
}
