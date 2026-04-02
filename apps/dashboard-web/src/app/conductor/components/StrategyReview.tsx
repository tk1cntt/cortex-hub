'use client'

import { useState } from 'react'
import { type TaskStrategy } from './shared'
import type { ConductorAgent } from '@/lib/api'
import styles from './StrategyReview.module.css'

interface Props {
  analyzing: boolean
  strategy: TaskStrategy | null
  leadAgent: string
  agents: ConductorAgent[]
  submitting: boolean
  progressMessages: string[]
  error: string | null
  onApprove: (strategy: TaskStrategy) => void
  onReject: () => void
  onRetry: () => void
  onCancel: () => void
  onBack: () => void
}

export function StrategyReview({
  analyzing,
  strategy,
  leadAgent,
  agents,
  submitting,
  progressMessages,
  error,
  onApprove,
  onReject,
  onRetry,
  onCancel,
  onBack,
}: Props) {
  // Local editable copy of strategy roles
  const [editedRoles, setEditedRoles] = useState<TaskStrategy['roles'] | null>(null)

  // When strategy arrives, init editable roles
  const roles = editedRoles ?? strategy?.roles ?? []

  const updateRoleAgent = (index: number, agent: string) => {
    const updated = [...roles]
    const current = updated[index]
    if (!current) return
    updated[index] = { ...current, agent }
    setEditedRoles(updated)
  }

  const handleApprove = () => {
    if (!strategy) return
    onApprove({
      ...strategy,
      roles: editedRoles ?? strategy.roles,
    })
  }

  // ── Error State ──
  if (error) {
    return (
      <div className={styles.strategyBody}>
        <div className={styles.errorState}>
          <div className={styles.errorIcon}>!</div>
          <h3 className={styles.errorTitle}>Analysis Failed</h3>
          <p className={styles.errorMessage}>{error}</p>
          <div className={styles.errorActions}>
            <button className="btn btn-secondary btn-sm" onClick={onCancel}>
              Cancel Task
            </button>
            <button className="btn btn-primary btn-sm" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Analyzing State ──
  if (analyzing) {
    return (
      <div className={styles.strategyBody}>
        <div className={styles.analyzingState}>
          <div className={styles.analyzingOrb}>
            <div className={styles.analyzingOrbInner}>🧠</div>
            <div className={styles.analyzingRing} />
          </div>
          <h3 className={styles.analyzingTitle}>Agent is analyzing...</h3>
          <p className={styles.analyzingSubtitle}>
            The lead agent is reviewing the task brief and preparing a strategy
          </p>
          <div className={styles.analyzingAgent}>
            <span className={styles.analyzingAgentDot} />
            <code>{leadAgent}</code> — working
          </div>

          {/* Progress messages from agent */}
          {progressMessages.length > 0 && (
            <div className={styles.progressLog}>
              {progressMessages.map((msg, i) => (
                <div key={i} className={styles.progressItem}>
                  <span className={styles.progressDot} />
                  <span className={styles.progressText}>{msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── No strategy yet (should not normally appear, but fallback) ──
  if (!strategy) {
    return (
      <div className={styles.strategyBody}>
        <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 'var(--space-6)' }}>
          Waiting for agent response...
        </p>
        <div className={styles.strategyActions}>
          <button className="btn btn-secondary btn-sm" onClick={onBack}>&larr; Back</button>
        </div>
      </div>
    )
  }

  // ── Strategy Display ──
  return (
    <div className={styles.strategyBody}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 var(--space-2) 0' }}>
        Strategy Proposal
      </h2>
      <p style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', margin: '0 0 var(--space-5) 0' }}>
        Review the agent&apos;s plan. Edit role assignments or approve to begin execution.
      </p>

      {/* Summary */}
      <div className={styles.strategySummary}>
        <p className={styles.strategySummaryText}>{strategy.summary}</p>
        {strategy.estimatedEffort && (
          <span className={styles.strategyEffort}>⏱ {strategy.estimatedEffort}</span>
        )}
      </div>

      {/* Roles */}
      {roles.length > 0 && (
        <>
          <h4 className={styles.rolesHeader}>Team Roles ({roles.length})</h4>
          <div className={styles.rolesList}>
            {roles.map((role, i) => (
              <div key={role.role} className={styles.roleCard}>
                <span className={styles.roleEmoji}>
                  {role.label.match(/^(\S+)/)?.[1] || '⚡'}
                </span>
                <div className={styles.roleInfo}>
                  <div className={styles.roleLabel}>{role.label.replace(/^(\S+)\s*/, '')}</div>
                  <div className={styles.roleRationale}>{role.rationale}</div>
                </div>
                <div className={styles.roleAgentSelect}>
                  <select
                    className={styles.roleAgentDropdown}
                    value={role.agent}
                    onChange={(e) => updateRoleAgent(i, e.target.value)}
                  >
                    <option value="">— Not assigned —</option>
                    {agents.map((agent) => (
                      <option key={agent.agentId} value={agent.agentId}>
                        {agent.agentId}{agent.ide ? ` (${agent.ide})` : ''}
                      </option>
                    ))}
                    {role.agent && !agents.find(a => a.agentId === role.agent) && (
                      <option value={role.agent}>{role.agent} (offline)</option>
                    )}
                  </select>
                  {strategy.roles[i]?.agent === role.agent && role.agent && (
                    <span className={styles.roleSuggested}>suggested</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Subtask Preview */}
      {strategy.subtasks.length > 0 && (
        <>
          <h4 className={styles.subtasksHeader}>Execution Plan ({strategy.subtasks.length} tasks)</h4>
          <div className={styles.subtasksList}>
            {strategy.subtasks.map((subtask, i) => (
              <div key={i} className={styles.subtaskItem}>
                <span className={styles.subtaskNum}>{i + 1}</span>
                <span className={styles.subtaskTitle}>{subtask.title}</span>
                <span className={styles.subtaskRole}>{subtask.role}</span>
                {subtask.dependsOn && subtask.dependsOn.length > 0 && (
                  <span className={styles.subtaskDeps}>
                    waits for: {subtask.dependsOn.join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className={styles.strategyActions}>
        <button className={`btn btn-secondary btn-sm ${styles.rejectBtn}`} onClick={onReject}>
          ✗ Reject & Re-assign
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>&larr; Back</button>
        <button
          className={`btn btn-primary btn-sm ${styles.approveBtn}`}
          disabled={submitting}
          onClick={handleApprove}
        >
          {submitting ? 'Creating pipeline...' : '✓ Approve & Execute'}
        </button>
      </div>
    </div>
  )
}
