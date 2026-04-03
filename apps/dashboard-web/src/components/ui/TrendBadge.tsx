import React from 'react'
import styles from './TrendBadge.module.css'

interface TrendBadgeProps {
  value: number // Percentage positive or negative (e.g. 12 or -5)
}

export function TrendBadge({ value }: TrendBadgeProps) {
  const variant = value > 0 ? 'up' : value < 0 ? 'down' : 'flat'
  const icon = value > 0 ? '↑' : value < 0 ? '↓' : '—'

  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      <span className={styles.arrow}>{icon}</span>
      {Math.abs(value)}%
    </span>
  )
}
