import React from 'react'

export interface StatusDotProps {
  /** Color variant */
  variant: 'healthy' | 'warning' | 'error' | 'muted'
  /** Optional size override in pixels */
  size?: number
  /** Additional CSS classes */
  className?: string
}

/**
 * Colored dot with glow effect indicating status.
 * Wraps the global `.status-dot` CSS classes from globals.css.
 */
export function StatusDot({ variant, size, className }: StatusDotProps) {
  return (
    <span
      className={`status-dot ${variant}${className ? ` ${className}` : ''}`}
      style={size ? { width: size, height: size } : undefined}
    />
  )
}
