'use client'

import { useState } from 'react'
import Markdown from 'react-markdown'
import { Copy, Check } from 'lucide-react'
import styles from './MarkdownRenderer.module.css'

interface Props {
  content: string
  className?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CodeBlock({ className, children, ...props }: any) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const isInline = !match && !className?.includes('language-')

  if (isInline && typeof children === 'string' && !children.includes('\n')) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.codeBlockWrapper}>
      <div className={styles.codeBlockHeader}>
        {language && <span className={styles.codeLang}>{language}</span>}
        <button 
          className={styles.copyBtn} 
          onClick={handleCopy} 
          aria-label="Copy code"
          type="button"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className={className}>
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ResponsiveTable({ children, ...props }: any) {
  return (
    <div className={styles.tableWrapper}>
      <table {...props}>{children}</table>
    </div>
  )
}

/**
 * Renders markdown content with styled typography.
 * Uses react-markdown for safe, client-side rendering.
 */
export function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={`${styles.markdown} ${className ?? ''}`}>
      <Markdown
        components={{
          code: CodeBlock,
          table: ResponsiveTable
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
