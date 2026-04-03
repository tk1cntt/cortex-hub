import React from 'react'
import styles from './Tooltip.module.css'

export interface TooltipProps {
  /** Tooltip content (text or ReactNode) */
  content: React.ReactNode
  /** Trigger element */
  children: React.ReactNode
  /** Placement of tooltip */
  position?: 'top' | 'bottom'
}

/**
 * Generic hover tooltip component.
 * Wraps children and shows tooltip content on hover.
 */
export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      {children}
      <span className={`${styles.tooltip} ${styles[position]}`}>
        {content}
      </span>
    </span>
  )
}
