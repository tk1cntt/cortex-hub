'use client'

import { useEffect, useState } from 'react'
import { getLogActionLabel } from './shared'
import styles from '../page.module.css'

interface LogEntry {
  id: number
  action: string
  message: string
  agent_id: string
  created_at: string
}

export function LiveOutput({ taskId, isActive }: { taskId: string; isActive: boolean }) {
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>

    async function fetchLogs() {
      try {
        const res = await fetch(`/api/conductor/${taskId}`)
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs ?? [])
        }
      } catch { /* ignore */ }
    }

    fetchLogs()
    if (isActive) {
      timer = setInterval(fetchLogs, 5000)
    }

    return () => clearInterval(timer)
  }, [taskId, isActive])

  if (logs.length === 0) {
    return (
      <div className={styles.logEntry} style={{ color: 'var(--text-tertiary)', borderLeftColor: 'transparent' }}>
        No output yet
      </div>
    )
  }

  return (
    <div>
      {logs.map((log) => {
        const { label, icon, color } = getLogActionLabel(log.action)
        const isProgress = log.action === 'progress'

        if (isProgress) {
          // Standard progress log — mono-spaced
          return (
            <div key={log.id} className={styles.logEntry}>
              {log.message}
            </div>
          )
        }

        // Lifecycle event — styled differently
        return (
          <div key={log.id} className={styles.liveOutputLifecycle} style={{ borderLeftColor: color }}>
            <span className={styles.liveOutputLifecycleIcon}>{icon}</span>
            <span className={styles.liveOutputLifecycleAction} style={{ color }}>{label}</span>
            <span className={styles.liveOutputLifecycleMsg}>
              {log.message || log.agent_id}
            </span>
            <span className={styles.timestamp}>
              {new Date(log.created_at).toLocaleTimeString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}
