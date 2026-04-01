'use client'

import { useState, useEffect, useRef } from 'react'
import styles from '../page.module.css'

/** Live output panel — polls task logs and auto-scrolls */
export function LiveOutput({ taskId, isActive }: { taskId: string; isActive: boolean }) {
  const [logs, setLogs] = useState<{ id: number; message: string; created_at: string }[]>([])
  const scrollRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!isActive && logs.length > 0) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/conductor/${taskId}`)
        if (!res.ok || cancelled) return
        const d = await res.json()
        const progressLogs = (d.logs ?? []).filter((l: { action: string }) => l.action === 'progress')
        if (!cancelled) setLogs(progressLogs)
      } catch { /* ignore */ }
    }
    poll()
    const interval = isActive ? setInterval(poll, 2000) : undefined
    return () => { cancelled = true; if (interval) clearInterval(interval) }
  }, [taskId, isActive])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [logs.length])

  if (logs.length === 0) {
    return (
      <div className={styles.liveOutputEmpty}>
        {isActive ? 'Waiting for output...' : 'No output recorded'}
      </div>
    )
  }

  return (
    <pre ref={scrollRef} className={styles.liveOutput}>
      {logs.map((log) => (
        <div key={log.id} className={styles.liveOutputLine}>
          <span className={styles.liveOutputTime}>
            {new Date(log.created_at).toLocaleTimeString()}
          </span>
          {log.message}
        </div>
      ))}
      {isActive && <span className={styles.liveOutputCursor}>▊</span>}
    </pre>
  )
}
