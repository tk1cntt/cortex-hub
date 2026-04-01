'use client'

import { formatJson, type ConductorTask } from './shared'
import { StatusBadge, PriorityBadge, ResultDisplay } from './StatusBadge'
import { LiveOutput } from './LiveOutput'
import styles from '../page.module.css'

export function TaskDetail({
  task,
  onClose,
  onCancel,
  onDelete,
}: {
  task: ConductorTask
  onClose: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  const isRunning = task.status === 'in_progress' || task.status === 'accepted' || task.status === 'analyzing'

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>Task Details</h2>
          <button className={styles.detailClose} onClick={onClose}>
            x
          </button>
        </div>

        <div className={styles.detailBody}>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>ID</span>
            <code className={styles.detailValue}>{task.id}</code>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Status</span>
            <StatusBadge status={task.status} />
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Priority</span>
            <PriorityBadge priority={task.priority} />
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Created By</span>
            <code className={styles.detailValue}>{task.created_by_agent ?? 'unknown'}</code>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Assigned To</span>
            <code className={styles.detailValue}>{task.assigned_to_agent ?? 'any agent'}</code>
          </div>
          {task.completed_by && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Completed By</span>
              <code className={styles.detailValue}>{task.completed_by}</code>
            </div>
          )}
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Created</span>
            <span className={styles.detailValue}>
              {task.created_at ? new Date(task.created_at).toLocaleString() : '--'}
            </span>
          </div>
          {task.accepted_at && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Started</span>
              <span className={styles.detailValue}>
                {new Date(task.accepted_at).toLocaleString()}
              </span>
            </div>
          )}
          {task.completed_at && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Completed</span>
              <span className={styles.detailValue}>
                {new Date(task.completed_at).toLocaleString()}
              </span>
            </div>
          )}

          {/* Delegation Flow */}
          {(task.created_by_agent || task.assigned_to_agent || task.completed_by) && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Delegation Flow</h3>
              <div className={styles.delegationFlow}>
                {task.created_by_agent && (
                  <div className={styles.delegationStep}>
                    <span className={styles.delegationLabel}>Created by</span>
                    <code className={styles.delegationAgent}>{task.created_by_agent}</code>
                  </div>
                )}
                {task.assigned_to_agent && (
                  <>
                    <span className={styles.delegationArrow}>↓</span>
                    <div className={styles.delegationStep}>
                      <span className={styles.delegationLabel}>Assigned to</span>
                      <code className={styles.delegationAgent}>{task.assigned_to_agent}</code>
                    </div>
                  </>
                )}
                {task.completed_by && (
                  <>
                    <span className={styles.delegationArrow}>↓</span>
                    <div className={`${styles.delegationStep} ${styles.delegationStepDone}`}>
                      <span className={styles.delegationLabel}>Completed by</span>
                      <code className={styles.delegationAgent}>{task.completed_by}</code>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Parent Task Link */}
          {task.parent_task_id && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Parent Task</span>
              <code className={styles.detailValue}>{task.parent_task_id}</code>
            </div>
          )}

          {/* Title & Description */}
          <div className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>Title</h3>
            <p className={styles.detailText}>{task.title}</p>
          </div>

          {task.description && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Description</h3>
              <p className={styles.detailText}>{task.description}</p>
            </div>
          )}

          {/* Result */}
          {task.result && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Result</h3>
              <ResultDisplay result={task.result} />
            </div>
          )}

          {/* Context */}
          {task.context && task.context !== '{}' && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Context</h3>
              <pre className={styles.detailCode}>{formatJson(task.context)}</pre>
            </div>
          )}

          {/* Live Output */}
          <div className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>
              {isRunning ? '● Live Output' : 'Output Log'}
            </h3>
            <LiveOutput taskId={task.id} isActive={isRunning} />
          </div>

          {/* Actions */}
          <div className={styles.detailActions}>
            {(task.status === 'pending' || task.status === 'in_progress') && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { onCancel(); onClose() }}
              >
                Cancel Task
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { onDelete(); onClose() }}
              style={{ borderColor: 'var(--status-error)', color: 'var(--status-error)' }}
            >
              Delete Task
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
