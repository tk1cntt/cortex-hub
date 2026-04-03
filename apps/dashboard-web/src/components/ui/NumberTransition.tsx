'use client'

import React, { useEffect, useState, useRef } from 'react'

interface NumberTransitionProps {
  value: number
  durationMs?: number
  format?: (val: number) => string | React.ReactNode
}

function easeOutQuart(x: number): number {
  return 1 - Math.pow(1 - x, 4)
}

export function NumberTransition({ value, durationMs = 1200, format = (val) => val.toString() }: NumberTransitionProps) {
  const [current, setCurrent] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const startTime = useRef<number | null>(null)
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)
    
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion) {
      setCurrent(value)
      return
    }

    let rafId: number
    setCurrent(prev => {
      // If we are already animating or restarting, start from where we left off
      const startValue = prev
      const endValue = value
      const range = endValue - startValue

      if (range === 0) return prev

      startTime.current = null
      
      const animate = (timestamp: number) => {
        if (!startTime.current) startTime.current = timestamp
        const elapsed = timestamp - startTime.current
        const progress = Math.min(elapsed / durationMs, 1)
        
        // Easing function to make it slow down at the end
        const easeProgress = easeOutQuart(progress)
        
        // Using Math.round so that final value doesn't jitter right before completing
        setCurrent(Math.round(startValue + range * easeProgress))
        
        if (progress < 1) {
          rafId = requestAnimationFrame(animate)
        } else {
          setCurrent(endValue)
        }
      }
      
      rafId = requestAnimationFrame(animate)
      return prev
    })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [value, durationMs, prefersReducedMotion])

  return <>{format(current)}</>
}
