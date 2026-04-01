'use client'

import { getIdeInfo, getCapColor, formatTimeAgo, type ConductorTask } from './shared'
import { StatusBadge } from './StatusBadge'
import type { ConductorAgent } from '@/lib/api'
import styles from '../page.module.css'

export function AgentDetail({
  agent,
  allTasks,
  onClose,
}: {
  agent: ConductorAgent
  allTasks: ConductorTask[]
  onClose: () => void
}) {
  const { label: ideLabel } = getIdeInfo(agent.ide)
  const platform = agent.platform ?? (agent.hostname?.includes('Mac') ? 'macOS' : 'unknown')
  const agentTasks = allTasks.filter((t) => t.assigned_to_agent === agent.agentId)
  const currentTask = agentTasks.find((t) => t.status === 'in_progress' || t.status === 'accepted')
  const recentCompleted = agentTasks.filter((t) => t.status === 'completed').slice(0, 5)

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div className={styles.detailPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>Agent Details</h2>
          <button className={styles.detailClose} onClick={onClose}>x</button>
        </div>

        <div className={styles.detailBody}>
          {/* Identity */}
          <div className={styles.agentDetailPanelIdentity}>
            <strong className={styles.agentDetailPanelName}>{agent.agentId}</strong>
            <span className={styles.agentDetailPanelIde}>{ideLabel}</span>
          </div>

          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Hostname</span>
            <span className={styles.detailValue}>{agent.hostname ?? '-'}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Platform</span>
            <span className={styles.detailValue}>{platform}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Owner</span>
            <span className={styles.detailValue}>{agent.apiKeyOwner}</span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Status</span>
            <span className={`badge badge-${agent.status === 'busy' ? 'warning' : 'healthy'}`}>
              {agent.status ?? 'online'}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Connected</span>
            <span className={styles.detailValue}>{new Date(agent.connectedAt).toLocaleString()}</span>
          </div>

          {/* Capabilities */}
          <div className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>Capabilities</h3>
            {agent.capabilities && agent.capabilities.length > 0 ? (
              <div className={styles.agentCaps}>
                {agent.capabilities.map((cap) => {
                  const capColor = getCapColor(cap)
                  return <span key={cap} className={`${styles.capBadge} ${capColor ? styles[capColor] : ''}`}>{cap}</span>
                })}
              </div>
            ) : (
              <span className={styles.agentCapsEmpty}>No capabilities registered</span>
            )}
          </div>

          {/* Current Task */}
          {currentTask && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>● Current Task</h3>
              <div className={styles.agentDetailTaskCard}>
                <div className={styles.resultSubtaskHeader}>
                  <span className={styles.resultSubtaskTitle}>{currentTask.title}</span>
                  <StatusBadge status={currentTask.status} />
                </div>
                {currentTask.description && (
                  <p className={styles.resultSubtaskMsg}>{currentTask.description}</p>
                )}
              </div>
            </div>
          )}

          {/* Recent Completed Tasks */}
          {recentCompleted.length > 0 && (
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Recent Completed ({recentCompleted.length})</h3>
              <div className={styles.resultSubtasks}>
                {recentCompleted.map((t) => (
                  <div key={t.id} className={styles.agentDetailTaskCard}>
                    <div className={styles.resultSubtaskHeader}>
                      <span className={styles.resultSubtaskTitle}>{t.title}</span>
                      <span className={styles.timestamp}>
                        {t.completed_at ? formatTimeAgo(t.completed_at) : '--'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total stats */}
          <div className={styles.detailSection}>
            <h3 className={styles.detailSectionTitle}>Task Summary</h3>
            <div className={styles.resultSummaryGrid}>
              <div className={styles.resultSummaryItem}>
                <span className={styles.resultSummaryKey}>Total Assigned</span>
                <span className={styles.resultSummaryValue}>{agentTasks.length}</span>
              </div>
              <div className={styles.resultSummaryItem}>
                <span className={styles.resultSummaryKey}>Completed</span>
                <span className={styles.resultSummaryValue}>{agentTasks.filter((t) => t.status === 'completed').length}</span>
              </div>
              <div className={styles.resultSummaryItem}>
                <span className={styles.resultSummaryKey}>In Progress</span>
                <span className={styles.resultSummaryValue}>{agentTasks.filter((t) => t.status === 'in_progress').length}</span>
              </div>
              <div className={styles.resultSummaryItem}>
                <span className={styles.resultSummaryKey}>Failed</span>
                <span className={styles.resultSummaryValue}>{agentTasks.filter((t) => t.status === 'failed').length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
