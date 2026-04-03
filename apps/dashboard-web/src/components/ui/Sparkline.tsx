import React from 'react'

interface SparklineProps {
  data: number[]
  color?: string
  width?: number
  height?: number
  strokeWidth?: number
}

export function Sparkline({
  data,
  color = 'currentColor',
  width = 80,
  height = 24,
  strokeWidth = 2,
}: SparklineProps) {
  if (!data || data.length === 0) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  // Map data points into paths
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d - min) / range) * (height - strokeWidth * 2) - strokeWidth
    return `${x},${y}`
  })

  // Smooth line representation
  const pathData = `M ${pts.join(' L ')}`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <path
        d={pathData}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
