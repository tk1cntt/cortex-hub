'use client'

import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ConductorAgent } from '@/lib/api'
import { buildTaskTree, getResultSummary, getTaskDuration, getIdeInfo, type ConductorTask, type TaskTreeNode } from './shared'
import styles from './PipelineDiagram.module.css'

/* ── Typed node data for @xyflow/react v12 ── */
type PipelineNodeData = {
  task: ConductorTask
  isOrchestrator: boolean
  agentIde?: string
  agentCapabilities?: string[]
  [key: string]: unknown
}

type PipelineNode = Node<PipelineNodeData, 'pipeline'>

/* ── Custom Node Component ── */
function PipelineNodeComponent({ data }: NodeProps<PipelineNode>) {
  const { task, isOrchestrator, agentIde, agentCapabilities } = data

  const statusClass = (() => {
    switch (task.status) {
      case 'in_progress': return styles.nodeActive
      case 'analyzing': return styles.nodeAnalyzing
      case 'pending': case 'assigned': return styles.nodeWaiting
      case 'completed': case 'approved': return styles.nodeComplete
      case 'failed': return styles.nodeFailed
      case 'blocked': return styles.nodeBlocked
      default: return styles.nodeWaiting
    }
  })()

  const dotClass = (() => {
    switch (task.status) {
      case 'in_progress': case 'accepted': return styles.dotActive
      case 'analyzing': return styles.dotAnalyzing
      case 'pending': case 'assigned': return styles.dotWaiting
      case 'completed': case 'approved': return styles.dotComplete
      case 'failed': return styles.dotFailed
      case 'blocked': return styles.dotBlocked
      default: return styles.dotWaiting
    }
  })()

  const roleEmoji = (() => {
    const title = task.title.toLowerCase()
    if (title.includes('review')) return '🔍'
    if (title.includes('ui') || title.includes('frontend') || title.includes('design')) return '🎨'
    if (title.includes('backend') || title.includes('api')) return '🔧'
    if (title.includes('deploy') || title.includes('devops')) return '🚀'
    if (title.includes('test')) return '🧪'
    if (isOrchestrator) return '🎯'
    return '⚡'
  })()

  const iconColor = (() => {
    if (task.status === 'completed' || task.status === 'approved') return styles.iconGreen
    if (task.status === 'in_progress') return styles.iconBlue
    if (task.status === 'analyzing') return styles.iconPurple
    if (task.status === 'failed') return styles.iconRed
    return styles.iconOrange
  })()

  const resultSummary = (task.status === 'completed' || task.status === 'approved')
    ? getResultSummary(task.result, 60) : ''
  const duration = getTaskDuration(task)

  // Agent IDE info
  const ideInfo = agentIde ? getIdeInfo(agentIde) : null

  return (
    <div className={`${styles.pipelineNode} ${statusClass} ${isOrchestrator ? styles.nodeOrchestrator : ''}`}>
      <Handle type="target" position={Position.Left} className={styles.handle} />

      <div className={styles.nodeHeader}>
        <span className={`${styles.nodeIcon} ${iconColor}`}>{roleEmoji}</span>
        <span className={styles.nodeTitle}>{task.title.replace(/^\[Delegated\]\s*/, '').slice(0, 50)}</span>
      </div>

      <div className={styles.nodeAgentRow}>
        {ideInfo && (
          <span className={`${styles.nodeIdeIcon} ${ideInfo.colorClass ? styles[ideInfo.colorClass] : ''}`} title={ideInfo.label}>
            {ideInfo.icon}
          </span>
        )}
        <span className={styles.nodeAgent}>{task.assigned_to_agent ?? 'unassigned'}</span>
      </div>

      {/* Capability badges */}
      {agentCapabilities && agentCapabilities.length > 0 && (
        <div className={styles.nodeCaps}>
          {agentCapabilities.slice(0, 3).map((cap) => (
            <span key={cap} className={styles.nodeCapBadge}>{cap}</span>
          ))}
          {agentCapabilities.length > 3 && (
            <span className={styles.nodeCapBadge}>+{agentCapabilities.length - 3}</span>
          )}
        </div>
      )}

      {/* Result preview for completed tasks */}
      {resultSummary && (
        <div className={styles.nodeResult}>{resultSummary}</div>
      )}

      <div className={styles.nodeStatusRow}>
        <span className={`${styles.nodeStatusDot} ${dotClass}`} />
        <span className={styles.nodeStatusLabel}>{task.status.replace('_', ' ')}</span>
        {duration && <span className={styles.nodeDuration}>⏱ {duration}</span>}
      </div>

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  )
}

const nodeTypes = {
  pipeline: PipelineNodeComponent,
}

/* ── Edge label helper ── */
function getEdgeLabel(parentTask: ConductorTask, childTask: ConductorTask): string {
  const title = childTask.title.toLowerCase()
  if (title.includes('review')) return 'review'
  if (title.includes('delegated')) return 'delegated'
  if (title.includes('revision')) return 'revision'
  if (childTask.created_by_agent === 'auto-orchestrator') return 'auto'
  if (parentTask.assigned_to_agent && childTask.assigned_to_agent &&
      parentTask.assigned_to_agent !== childTask.assigned_to_agent) return 'delegate'
  return ''
}

/* ── Pipeline Diagram ── */
interface Props {
  tasks: ConductorTask[]
  agents?: ConductorAgent[]
  onNodeClick?: (task: ConductorTask) => void
}

export function PipelineDiagram({ tasks, agents, onNodeClick }: Props) {
  // Build agent lookup for IDE/capabilities display
  const agentMap = useMemo(() => {
    const map = new Map<string, ConductorAgent>()
    if (agents) {
      for (const a of agents) map.set(a.agentId, a)
    }
    return map
  }, [agents])

  // Build tree and convert to React Flow nodes/edges — horizontal left-to-right layout
  const { nodes, edges } = useMemo(() => {
    if (tasks.length === 0) return { nodes: [], edges: [] }

    const tree = buildTaskTree(tasks)
    const flowNodes: PipelineNode[] = []
    const flowEdges: Edge[] = []
    const DEPTH_GAP = 320   // horizontal gap between depth levels
    const SIBLING_GAP = 140 // vertical gap between siblings

    // Build a task lookup for edge labels
    const taskMap = new Map<string, ConductorTask>()
    for (const t of tasks) taskMap.set(t.id, t)

    /**
     * Horizontal layout: parent on left, children stacked vertically to the right.
     * Returns the total vertical height consumed by this subtree.
     */
    function layoutNode(treeNode: TaskTreeNode, x: number, y: number, parentId?: string): number {
      const nodeId = treeNode.task.id

      // Look up agent info
      const assignedAgent = treeNode.task.assigned_to_agent
        ? agentMap.get(treeNode.task.assigned_to_agent)
        : undefined

      if (parentId) {
        const isActive = treeNode.task.status === 'in_progress' || treeNode.task.status === 'analyzing'
        const isComplete = treeNode.task.status === 'completed' || treeNode.task.status === 'approved'
        const isFailed = treeNode.task.status === 'failed'
        const parentTask = taskMap.get(parentId)
        const label = parentTask ? getEdgeLabel(parentTask, treeNode.task) : ''

        flowEdges.push({
          id: `e-${parentId}-${nodeId}`,
          source: parentId,
          target: nodeId,
          animated: isActive,
          label: label || undefined,
          labelStyle: {
            fontSize: 10,
            fill: isComplete ? '#10b981' : isActive ? '#6366f1' : isFailed ? '#ef4444' : 'var(--text-tertiary)',
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: 'var(--bg-secondary)',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          style: {
            stroke: isComplete ? '#10b981' : isActive ? '#6366f1' : isFailed ? '#ef4444' : 'var(--border)',
            strokeWidth: isActive ? 2.5 : isComplete ? 2 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: isComplete ? '#10b981' : isActive ? '#6366f1' : isFailed ? '#ef4444' : 'var(--border)',
          },
        })
      }

      if (treeNode.children.length === 0) {
        // Leaf node — place at (x, y), occupies SIBLING_GAP height
        flowNodes.push({
          id: nodeId,
          type: 'pipeline',
          position: { x, y },
          data: {
            task: treeNode.task,
            isOrchestrator: treeNode.depth === 0,
            agentIde: assignedAgent?.ide,
            agentCapabilities: assignedAgent?.capabilities,
          },
        })
        return SIBLING_GAP
      }

      // Layout children vertically at x + DEPTH_GAP
      let childY = y
      const childHeights: number[] = []
      for (const child of treeNode.children) {
        const h = layoutNode(child, x + DEPTH_GAP, childY, nodeId)
        childHeights.push(h)
        childY += h
      }

      // Total height consumed by children
      const totalChildHeight = childHeights.reduce((a, b) => a + b, 0)

      // Center parent vertically relative to its children
      const parentY = y + (totalChildHeight - SIBLING_GAP) / 2

      flowNodes.push({
        id: nodeId,
        type: 'pipeline',
        position: { x, y: parentY },
        data: {
          task: treeNode.task,
          isOrchestrator: treeNode.depth === 0,
          agentIde: assignedAgent?.ide,
          agentCapabilities: assignedAgent?.capabilities,
        },
      })

      return Math.max(totalChildHeight, SIBLING_GAP)
    }

    // Add sequential chain edges between sibling tasks (same parent, ordered by creation)
    function addSiblingChains(treeNode: TaskTreeNode): void {
      if (treeNode.children.length > 1) {
        // Sort children by created_at
        const sorted = [...treeNode.children].sort((a, b) =>
          (a.task.created_at ?? '').localeCompare(b.task.created_at ?? '')
        )
        for (let i = 0; i < sorted.length - 1; i++) {
          const curr = sorted[i]!
          const next = sorted[i + 1]!
          const isComplete = curr.task.status === 'completed' || curr.task.status === 'approved'
          const nextActive = next.task.status === 'in_progress' || next.task.status === 'analyzing'
          flowEdges.push({
            id: `chain-${curr.task.id}-${next.task.id}`,
            source: curr.task.id,
            target: next.task.id,
            animated: nextActive,
            type: 'smoothstep',
            style: {
              stroke: isComplete ? '#10b981' : 'var(--border-subtle)',
              strokeWidth: 1.5,
              strokeDasharray: isComplete ? undefined : '6 3',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 10,
              height: 10,
              color: isComplete ? '#10b981' : 'var(--border-subtle)',
            },
          })
        }
      }
      for (const child of treeNode.children) addSiblingChains(child)
    }

    // Layout each root tree, stacking vertically
    let startY = 0
    for (const root of tree) {
      const height = layoutNode(root, 40, startY)
      addSiblingChains(root)
      startY += height + SIBLING_GAP / 2
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [tasks, agentMap])

  // Handle node click via ReactFlow's onNodeClick — avoids stale callback in node data
  const handleNodeClick = useCallback((_event: React.MouseEvent, node: PipelineNode) => {
    onNodeClick?.(node.data.task)
  }, [onNodeClick])

  if (tasks.length === 0) {
    return (
      <div className={styles.diagramWrap}>
        <div className={styles.diagramEmpty}>
          <span className={styles.diagramEmptyIcon}>🔗</span>
          <span className={styles.diagramEmptyText}>No pipeline tasks. Create an orchestrated task to see the diagram.</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className={styles.diagramWrap} style={{ flex: 1, minHeight: 0 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
        >
          <Background gap={20} size={1} color="var(--border-subtle)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      <div className={styles.diagramLegend}>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#6366f1', boxShadow: '0 0 4px rgba(99, 102, 241, 0.5)' }} />
          analyzing
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#10b981', boxShadow: '0 0 4px rgba(16, 185, 129, 0.5)' }} />
          active
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: 'var(--text-tertiary)', opacity: 0.5 }} />
          waiting
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#10b981' }} />
          complete
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#ef4444' }} />
          failed
        </div>
        <div className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: '#f59e0b' }} />
          blocked
        </div>
      </div>
    </div>
  )
}
