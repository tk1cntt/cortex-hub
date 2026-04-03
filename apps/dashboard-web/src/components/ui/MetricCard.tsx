import React from 'react'
import { Sparkline } from './Sparkline'
import { TrendBadge } from './TrendBadge'
import type { LucideIcon } from '@/lib/icons'
import { ICON_DEFAULTS } from '@/lib/icons'
import styles from './MetricCard.module.css'

export interface MetricCardProps {
  /** Lucide icon component */
  Icon: LucideIcon
  /** Primary display value (supports ReactNode for skeletons / transitions) */
  value: React.ReactNode
  /** Metric label */
  label: string
  /** Optional trend percentage (renders TrendBadge) */
  trendValue?: number
  /** Optional sparkline data points */
  sparklineData?: number[]
  /** Accent color for sparkline */
  color?: string
  /** Stagger animation index */
  index?: number
}

export function MetricCard({
  Icon,
  value,
  label,
  trendValue,
  sparklineData,
  color,
  index = 0,
}: MetricCardProps) {
  return (
    <div
      className={styles.metricCard}
      style={{ '--stagger-index': index } as React.CSSProperties}
    >
      <span className={styles.icon}>
        <Icon size={ICON_DEFAULTS.size} strokeWidth={ICON_DEFAULTS.strokeWidth} />
      </span>
      <div className={styles.content}>
        <span className={`${styles.value} live-value`}>{value}</span>
        <span className={styles.label}>{label}</span>
      </div>
      {(trendValue !== undefined || sparklineData) && (
        <div className={styles.trend}>
          {sparklineData && (
            <Sparkline data={sparklineData} color={color || '#4a90d9'} width={60} height={20} />
          )}
          {trendValue !== undefined && <TrendBadge value={trendValue} />}
        </div>
      )}
    </div>
  )
}
