'use client'

import { useState, useCallback, useMemo } from 'react'
import useSWR from 'swr'
import type { StructuredFinding, StructuredTaskResult } from './shared'
import { formatTimeAgo } from './shared'
import {
  getConductorComments,
  submitConductorComment,
  updateFindingDecision,
  finalizeConductorTask,
  type ConductorComment,
  type FindingDecision,
} from '@/lib/api'
import styles from '../page.module.css'

type SortField = 'severity' | 'effort' | 'category' | 'status'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }
const effortOrder: Record<string, number> = { trivial: 0, small: 1, medium: 2, large: 3 }

interface DecisionMatrixProps {
  taskId: string
  result: StructuredTaskResult
  decisions: Record<string, FindingDecision>
  onDecisionChange?: () => void
}

export function DecisionMatrix({ taskId, result, decisions, onDecisionChange }: DecisionMatrixProps) {
  const [sortField, setSortField] = useState<SortField>('severity')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkAction, setBulkAction] = useState<'approved' | 'rejected' | null>(null)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  const { data: commentsData, mutate: mutateComments } = useSWR(
    `conductor-comments-${taskId}`,
    () => getConductorComments(taskId),
    { refreshInterval: 5000 }
  )
  const comments = commentsData?.comments ?? []

  const getDecisionStatus = useCallback((findingId: string): 'pending' | 'approved' | 'rejected' => {
    return (decisions[findingId]?.status as 'approved' | 'rejected') ?? 'pending'
  }, [decisions])

  const findings = useMemo(() => {
    let filtered = [...result.findings]

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter((f) => getDecisionStatus(f.id) === statusFilter)
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'severity':
          cmp = (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5)
          break
        case 'effort':
          cmp = (effortOrder[a.effort] ?? 5) - (effortOrder[b.effort] ?? 5)
          break
        case 'category':
          cmp = a.category.localeCompare(b.category)
          break
        case 'status': {
          const statusOrder: Record<string, number> = { pending: 0, approved: 1, rejected: 2 }
          cmp = (statusOrder[getDecisionStatus(a.id)] ?? 0) - (statusOrder[getDecisionStatus(b.id)] ?? 0)
          break
        }
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return filtered
  }, [result.findings, statusFilter, sortField, sortDir, getDecisionStatus])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const handleDecision = async (findingId: string, status: 'approved' | 'rejected', reason?: string) => {
    try {
      await updateFindingDecision(taskId, findingId, status, reason)
      onDecisionChange?.()
    } catch (err) {
      console.error('Failed to update finding decision:', err)
    }
  }

  const handleBulkAction = async () => {
    if (!bulkAction) return
    const pendingFindings = result.findings.filter((f) => getDecisionStatus(f.id) === 'pending')
    for (const f of pendingFindings) {
      await updateFindingDecision(taskId, f.id, bulkAction)
    }
    setBulkAction(null)
    onDecisionChange?.()
  }

  const handleComment = async (findingId?: string) => {
    if (!commentText.trim()) return
    setSubmitting(true)
    try {
      await submitConductorComment(taskId, commentText.trim(), findingId)
      setCommentText('')
      mutateComments()
    } catch (err) {
      console.error('Failed to submit comment:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinalize = async () => {
    setFinalizing(true)
    try {
      await finalizeConductorTask(taskId)
      onDecisionChange?.()
    } catch (err) {
      console.error('Failed to finalize:', err)
    } finally {
      setFinalizing(false)
    }
  }

  const findingComments = (findingId: string) =>
    comments.filter((c) => c.finding_id === findingId)

  const approvedCount = result.findings.filter((f) => getDecisionStatus(f.id) === 'approved').length
  const rejectedCount = result.findings.filter((f) => getDecisionStatus(f.id) === 'rejected').length
  const pendingCount = result.findings.length - approvedCount - rejectedCount

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' ^' : ' v'
  }

  return (
    <div className={styles.decisionMatrix}>
      {/* Summary bar */}
      {result.summary && (
        <p className={styles.dmSummary}>{result.summary}</p>
      )}

      {/* Stats + Filter bar */}
      <div className={styles.dmToolbar}>
        <div className={styles.dmStats}>
          <span className={styles.dmStatItem}>{result.findings.length} findings</span>
          {approvedCount > 0 && <span className={`${styles.dmStatItem} ${styles.dmStatApproved}`}>{approvedCount} approved</span>}
          {rejectedCount > 0 && <span className={`${styles.dmStatItem} ${styles.dmStatRejected}`}>{rejectedCount} rejected</span>}
          {pendingCount > 0 && <span className={`${styles.dmStatItem} ${styles.dmStatPending}`}>{pendingCount} pending</span>}
        </div>
        <div className={styles.dmFilters}>
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              className={`${styles.dmFilterBtn} ${statusFilter === f ? styles.dmFilterActive : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions */}
      {pendingCount > 0 && (
        <div className={styles.dmBulkBar}>
          <span className={styles.dmBulkLabel}>{pendingCount} pending:</span>
          <button className={`${styles.dmBulkBtn} ${styles.dmBulkApprove}`} onClick={() => { setBulkAction('approved'); handleBulkAction() }}>
            Approve All
          </button>
          <button className={`${styles.dmBulkBtn} ${styles.dmBulkReject}`} onClick={() => { setBulkAction('rejected'); handleBulkAction() }}>
            Reject All
          </button>
        </div>
      )}

      {/* Table */}
      <div className={styles.dmTableWrap}>
        <table className={styles.dmTable}>
          <thead>
            <tr>
              <th className={styles.dmThTitle}>Title</th>
              <th className={styles.dmThClickable} onClick={() => handleSort('severity')}>Severity{sortIndicator('severity')}</th>
              <th className={styles.dmThClickable} onClick={() => handleSort('category')}>Category{sortIndicator('category')}</th>
              <th className={styles.dmThClickable} onClick={() => handleSort('effort')}>Effort{sortIndicator('effort')}</th>
              <th>Comments</th>
              <th className={styles.dmThClickable} onClick={() => handleSort('status')}>Decision{sortIndicator('status')}</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => {
              const isExpanded = expandedId === finding.id
              const status = getDecisionStatus(finding.id)
              const fComments = findingComments(finding.id)
              return (
                <FindingRow
                  key={finding.id}
                  finding={finding}
                  status={status}
                  isExpanded={isExpanded}
                  comments={fComments}
                  commentText={isExpanded ? commentText : ''}
                  submitting={submitting}
                  onToggle={() => setExpandedId(isExpanded ? null : finding.id)}
                  onDecision={handleDecision}
                  onCommentTextChange={setCommentText}
                  onSubmitComment={() => handleComment(finding.id)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Finalize bar */}
      {result.findings.length > 0 && pendingCount === 0 && (
        <div className={styles.dmFinalizeBar}>
          <p className={styles.dmFinalizeText}>
            All findings reviewed: {approvedCount} approved, {rejectedCount} rejected
          </p>
          <button
            className={styles.dmFinalizeBtn}
            onClick={handleFinalize}
            disabled={finalizing}
          >
            {finalizing ? 'Finalizing...' : `Finalize (${approvedCount} items)`}
          </button>
        </div>
      )}
    </div>
  )
}

function FindingRow({
  finding,
  status,
  isExpanded,
  comments,
  commentText,
  submitting,
  onToggle,
  onDecision,
  onCommentTextChange,
  onSubmitComment,
}: {
  finding: StructuredFinding
  status: 'pending' | 'approved' | 'rejected'
  isExpanded: boolean
  comments: ConductorComment[]
  commentText: string
  submitting: boolean
  onToggle: () => void
  onDecision: (findingId: string, status: 'approved' | 'rejected', reason?: string) => void
  onCommentTextChange: (text: string) => void
  onSubmitComment: () => void
}) {
  const severityClass = styles[`dmSeverity${finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}`] ?? ''

  return (
    <>
      <tr
        className={`${styles.dmRow} ${styles[`dmRow${status.charAt(0).toUpperCase() + status.slice(1)}`] ?? ''} ${isExpanded ? styles.dmRowExpanded : ''}`}
        onClick={onToggle}
      >
        <td className={styles.dmCellTitle}>{finding.title}</td>
        <td><span className={`${styles.dmBadge} ${severityClass}`}>{finding.severity}</span></td>
        <td className={styles.dmCellCategory}>{finding.category}</td>
        <td className={styles.dmCellEffort}>{finding.effort}</td>
        <td className={styles.dmCellComments}>{comments.length > 0 ? comments.length : '--'}</td>
        <td className={styles.dmCellDecision}>
          {status === 'pending' ? (
            <div className={styles.dmDecisionBtns} onClick={(e) => e.stopPropagation()}>
              <button className={styles.dmApproveBtn} onClick={() => onDecision(finding.id, 'approved')}>
                Approve
              </button>
              <button className={styles.dmRejectBtn} onClick={() => onDecision(finding.id, 'rejected')}>
                Reject
              </button>
            </div>
          ) : (
            <span className={`${styles.dmDecisionBadge} ${status === 'approved' ? styles.dmDecisionApproved : styles.dmDecisionRejected}`}>
              {status}
            </span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className={styles.dmExpandedRow}>
          <td colSpan={6}>
            <div className={styles.dmExpandedContent}>
              <div className={styles.dmExpandedSection}>
                <h4 className={styles.dmExpandedLabel}>Description</h4>
                <p className={styles.dmExpandedText}>{finding.description}</p>
              </div>
              {finding.evidence.length > 0 && (
                <div className={styles.dmExpandedSection}>
                  <h4 className={styles.dmExpandedLabel}>Evidence</h4>
                  <ul className={styles.dmEvidenceList}>
                    {finding.evidence.map((e, i) => (
                      <li key={i} className={styles.dmEvidenceItem}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              {finding.proposal && (
                <div className={styles.dmExpandedSection}>
                  <h4 className={styles.dmExpandedLabel}>Proposal</h4>
                  <p className={styles.dmExpandedText}>{finding.proposal}</p>
                </div>
              )}

              {/* Comments section */}
              <div className={styles.dmExpandedSection}>
                <h4 className={styles.dmExpandedLabel}>Comments ({comments.length})</h4>
                {comments.length > 0 && (
                  <div className={styles.dmCommentList}>
                    {comments.map((c) => (
                      <div key={c.id} className={styles.dmComment}>
                        <div className={styles.dmCommentHeader}>
                          <span className={styles.dmCommentAgent}>{c.agent_id ?? 'anonymous'}</span>
                          <span className={`${styles.dmCommentType} ${styles[`dmType${c.comment_type.charAt(0).toUpperCase() + c.comment_type.slice(1)}`] ?? ''}`}>
                            {c.comment_type}
                          </span>
                          <span className={styles.dmCommentTime}>{formatTimeAgo(c.created_at)}</span>
                        </div>
                        <p className={styles.dmCommentBody}>{c.comment}</p>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.dmCommentForm} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    className={styles.dmCommentInput}
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => onCommentTextChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmitComment() } }}
                  />
                  <button
                    className={styles.dmCommentSubmit}
                    onClick={onSubmitComment}
                    disabled={submitting || !commentText.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
