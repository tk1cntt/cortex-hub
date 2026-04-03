'use client'

import Markdown from 'react-markdown'
import styles from './MarkdownRenderer.module.css'

interface Props {
  content: string
  className?: string
}

/**
 * Renders markdown content with styled typography.
 * Uses react-markdown for safe, client-side rendering.
 */
export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={`${styles.markdown} ${className ?? ''}`}>
      <Markdown>{content}</Markdown>
    </div>
  )
}
