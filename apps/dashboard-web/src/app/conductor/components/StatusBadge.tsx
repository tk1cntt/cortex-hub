'use client'

import { parseResult } from './shared'
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer'
import styles from '../page.module.css'

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed' || status === 'approved'
      ? 'healthy'
      : status === 'in_progress' || status === 'analyzing'
        ? 'warning'
        : status === 'pending'
          ? 'warning'
          : status === 'failed'
            ? 'error'
            : 'error'
  const label = status.replace('_', ' ')
  return <span className={`badge badge-${variant}`}>{label}</span>
}

export function PriorityBadge({ priority }: { priority: number }) {
  const label = priority <= 3 ? 'high' : priority <= 6 ? 'medium' : 'low'
  const variant = priority <= 3 ? 'error' : priority <= 6 ? 'warning' : 'healthy'
  return (
    <span className={`badge badge-${variant}`}>
      {label} ({priority})
    </span>
  )
}

/** Fix flattened markdown: insert newlines before headings, table rows, list items */
function fixFlatMarkdown(text: string): string {
  return text
    .replace(/\s*(#{1,6}\s)/g, '\n\n$1')           // headings: ### Title
    .replace(/\s*(\|[-:]+[-|:]+\|)/g, '\n$1\n')     // table separator: |---|---|
    .replace(/\s*(\|(?:[^|\n]+\|)+)\s*/g, '\n$1')   // table rows: | cell | cell |
    .replace(/\s*(\d+\.\s)/g, '\n$1')                // numbered list: 1. item
    .replace(/\s*([*-]\s)/g, '\n$1')                 // bullet list: - item
    .replace(/\*\*Estimated effort/g, '\n\n**Estimated effort')
    .trim()
}

export function ResultDisplay({ result }: { result: string | null }) {
  const parsed = parseResult(result)
  if (parsed.type === 'empty') return null
  if (parsed.type === 'string') return <MarkdownRenderer content={fixFlatMarkdown(parsed.text)} />
  if (parsed.type === 'subtasks') {
    return (
      <div className={styles.resultSubtasks}>
        {parsed.items.map((item, i) => (
          <div key={i} className={styles.resultSubtaskCard}>
            <div className={styles.resultSubtaskHeader}>
              <span className={styles.resultSubtaskTitle}>{item.title ?? `Subtask ${i + 1}`}</span>
              {item.status && <StatusBadge status={item.status} />}
            </div>
            {item.message && <p className={styles.resultSubtaskMsg}>{item.message}</p>}
            {item.agent && (
              <code className={styles.resultSubtaskAgent}>{item.agent}</code>
            )}
          </div>
        ))}
      </div>
    )
  }
  // type === 'object'
  return (
    <div>
      {parsed.summary.length > 0 && (
        <div className={styles.resultSummaryGrid}>
          {parsed.summary.map(({ key, value }) => (
            <div key={key} className={styles.resultSummaryItem}>
              <span className={styles.resultSummaryKey}>{key.replace(/_/g, ' ')}</span>
              <span className={styles.resultSummaryValue}>
                {value.length > 100 ? <MarkdownRenderer content={value} /> : value}
              </span>
            </div>
          ))}
        </div>
      )}
      <details className={styles.resultRawToggle}>
        <summary className={styles.resultRawLabel}>Raw JSON</summary>
        <pre className={styles.detailCode}>{parsed.raw}</pre>
      </details>
    </div>
  )
}
