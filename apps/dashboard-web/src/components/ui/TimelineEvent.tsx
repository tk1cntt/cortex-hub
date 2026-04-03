import React from 'react'
import styles from './TimelineEvent.module.css'

export interface TimelineEventProps {
  /** Icon element (pre-rendered) */
  icon: React.ReactNode
  /** Primary detail text */
  detail: string
  /** Secondary meta text (agent, latency, etc.) */
  meta?: string
  /** Status badge text */
  status?: string
  /** Status badge color variant */
  statusVariant?: 'healthy' | 'warning' | 'error'
  /** Formatted time string */
  time?: string
}

export function TimelineEvent({
  icon,
  detail,
  meta,
  status,
  statusVariant = 'healthy',
  time,
}: TimelineEventProps) {
  return (
    <div className={styles.row}>
      <span className={styles.icon}>{icon}</span>
      <div className={styles.info}>
        <span className={styles.detail}>{detail}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </div>
      <div className={styles.right}>
        {status && (
          <span className={`badge badge-${statusVariant}`}>{status}</span>
        )}
        {time && <span className={styles.time}>{time}</span>}
      </div>
    </div>
  )
}
