import React from 'react'
import type { LucideIcon } from '@/lib/icons'
import { ICON_DEFAULTS } from '@/lib/icons'
import styles from './GaugeChart.module.css'

export interface GaugeChartProps {
  /** Percentage value 0-100 */
  value: number
  /** Gauge label */
  label: string
  /** Sub-text below the label (supports ReactNode for skeletons) */
  subtitle: React.ReactNode
  /** Ring color */
  color: string
  /** Center icon */
  Icon: LucideIcon
  /** Unique ID for SVG gradient (must be unique per instance) */
  id: string
}

export function GaugeChart({ value, label, subtitle, color, Icon, id }: GaugeChartProps) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const statusColor = value > 90 ? '#e74c3c' : value > 70 ? '#f5a623' : color

  return (
    <div className={styles.gaugeCard}>
      <div className={styles.container}>
        <svg viewBox="0 0 100 100" className={styles.svg}>
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={statusColor} />
              <stop offset="100%" stopColor={`${statusColor}70`} />
            </linearGradient>
          </defs>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth="6"
            opacity="0.3"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={`url(#grad-${id})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            className={styles.ring}
            style={{ filter: `drop-shadow(0 0 6px ${statusColor}40)` }}
          />
        </svg>
        <div className={styles.center}>
          <span className={styles.icon}>
            <Icon size={22} strokeWidth={ICON_DEFAULTS.strokeWidth} />
          </span>
          <span className={styles.value}>{value}%</span>
        </div>
      </div>
      <div className={styles.label}>{label}</div>
      <div className={styles.sub}>{subtitle}</div>
    </div>
  )
}
