'use client'

import { useState, useCallback } from 'react'
import { formatJson, getResultSummary, getTaskDuration, type ConductorTask, type StructuredTaskResult } from './shared'
import { StatusBadge, PriorityBadge, ResultDisplay } from './StatusBadge'
import { DecisionMatrix } from './DecisionMatrix'
import { LiveOutput } from './LiveOutput'
import type { FindingDecision } from '@/lib/api'
import styles from '../page.module.css'

export function TaskDetail({
  task,
  onClose,
  onCancel,
  onDelete,
  onNewTaskFromOutcome,
}: {
  task: ConductorTask
  onClose: () => void
  onCancel: () => void
  onDelete: () => void
  onNewTaskFromOutcome?: (task: ConductorTask) => void
}) {
  const isRunning = task.status === 'in_progress' || task.status === 'accepted' || task.status === 'analyzing'

  // Detect structured findings for DecisionMatrix
  const [decisionVersion, setDecisionVersion] = useState(0)
  const refreshDecisions = useCallback(() => setDecisionVersion((v) => v + 1), [])

  let structuredResult: StructuredTaskResult | null = null
  let contextDecisions: Record<string, FindingDecision> = {}
  try {
    if (task.result) {
      const parsed = JSON.parse(task.result)
      if (parsed && Array.isArray(parsed.findings) && parsed.findings.length > 0) {
        structuredResult = parsed as StructuredTaskResult
      }
    }
  } catch { /* not structured */ }
  try {
    if (task.context) {
      const ctx = JSON.parse(task.context)
      if (ctx.decisions) contextDecisions = ctx.decisions as Record<string, FindingDecision>
    }
  } catch { /* ignore */ }

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
          {/* Timeline */}
          <div className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>Timeline</h3>
            <div className={styles.taskTimeline}>
              <div className={styles.timelineStep}>
                <span className={`${styles.timelineDot} ${styles.timelineDotActive}`} />
                <div className={styles.timelineInfo}>
                  <span className={styles.timelineLabel}>📋 Created</span>
                  <span className={styles.timelineTime}>
                    {task.created_at ? new Date(task.created_at).toLocaleString() : '--'}
                  </span>
                </div>
              </div>
              <div className={styles.timelineStep}>
                <span className={`${styles.timelineDot} ${task.accepted_at ? styles.timelineDotActive : styles.timelineDotPending}`} />
                <div className={styles.timelineInfo}>
                  <span className={styles.timelineLabel}>🤚 Accepted</span>
                  <span className={styles.timelineTime}>
                    {task.accepted_at ? new Date(task.accepted_at).toLocaleString() : 'Pending'}
                  </span>
                </div>
              </div>
              <div className={styles.timelineStep}>
                <span className={`${styles.timelineDot} ${task.completed_at ? styles.timelineDotActive : styles.timelineDotPending}`} />
                <div className={styles.timelineInfo}>
                  <span className={styles.timelineLabel}>
                    {task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳'} {task.status === 'failed' ? 'Failed' : 'Completed'}
                  </span>
                  <span className={styles.timelineTime}>
                    {task.completed_at ? `${new Date(task.completed_at).toLocaleString()} (${getTaskDuration(task)})` : 'In progress...'}
                  </span>
                </div>
              </div>
            </div>
          </div>

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

          {/* Result: DecisionMatrix for structured findings, or standard display */}
          {task.result && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>
                {structuredResult ? 'Decision Matrix' : 'Result'}
              </h3>
              {structuredResult ? (
                <DecisionMatrix
                  key={decisionVersion}
                  taskId={task.id}
                  result={structuredResult}
                  decisions={contextDecisions}
                  onDecisionChange={refreshDecisions}
                />
              ) : (
                <>
                  {(() => {
                    const summary = getResultSummary(task.result)
                    return summary ? (
                      <div className={styles.taskResultPreview} style={{ marginBottom: 'var(--space-3)', whiteSpace: 'normal' }}>
                        {summary}
                      </div>
                    ) : null
                  })()}
                  <ResultDisplay result={task.result} />
                </>
              )}
              {onNewTaskFromOutcome && (
                <button
                  className={styles.outcomeActionBtn}
                  onClick={() => { onNewTaskFromOutcome(task); onClose() }}
                >
                  New Task from Outcome
                </button>
              )}
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
            {(task.status === 'pending' || task.status === 'assigned' || task.status === 'accepted' || task.status === 'in_progress' || task.status === 'analyzing') && (
              <button
                className="btn btn-sm"
                style={{ background: 'var(--status-warning)', color: 'white', border: 'none' }}
                onClick={onCancel}
              >
                ⛔ Force Cancel
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
