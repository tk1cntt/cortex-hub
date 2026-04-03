import React from 'react'

interface TrendBadgeProps {
  value: number // Percentage positive or negative (e.g. 12 or -5)
}

export function TrendBadge({ value }: TrendBadgeProps) {
  const isPositive = value >= 0
  const color = isPositive ? '#22c55e' : '#ef4444' // Green / Red
  const bgColor = isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'
  const icon = isPositive ? '↑' : '↓'

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2px',
      backgroundColor: bgColor,
      color: color,
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: 600,
      lineHeight: '1',
      verticalAlign: 'middle'
    }}>
      <span style={{ fontSize: '0.85rem' }}>{icon}</span>
      {Math.abs(value)}%
    </span>
  )
}
