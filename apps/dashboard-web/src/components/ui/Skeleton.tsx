import React from 'react'
import styles from './Skeleton.module.css'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: number | string
  height?: number | string
  className?: string
}

export function Skeleton({ width, height, className = '', style, ...props }: SkeletonProps) {
  return (
    <div
      className={`${styles.shimmer} ${className}`}
      style={{ width, height, ...style }}
      {...props}
    />
  )
}

export function SkeletonText({ width = '100%', height = '1rem', className = '', ...props }: SkeletonProps) {
  return (
    <Skeleton
      width={width}
      height={height}
      className={`${styles.text} ${className}`}
      {...props}
    />
  )
}

export function SkeletonCircle({ size = 40, className = '', ...props }: SkeletonProps & { size?: number | string }) {
  return (
    <Skeleton
      width={size}
      height={size}
      className={`${styles.circle} ${className}`}
      {...props}
    />
  )
}

export function SkeletonCard({ className = '', children, ...props }: SkeletonProps) {
  return (
    <div className={`${styles.shimmer} ${styles.card} ${className}`} {...props}>
      {children}
    </div>
  )
}
