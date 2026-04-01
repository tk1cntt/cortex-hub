'use client'

import { useMemo } from 'react'
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
import { buildTaskTree, getResultSummary, getTaskDuration, type ConductorTask, type TaskTreeNode } from './shared'
import styles from './PipelineDiagram.module.css'

/* ── Custom Node Component ── */
function PipelineNodeComponent({ data }: NodeProps) {
  const task = data.task as ConductorTask
  const isOrchestrator = data.isOrchestrator as boolean
  const onNodeClick = data.onNodeClick as ((task: ConductorTask) => void) | undefined

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

  return (
    <div
      className={`${styles.pipelineNode} ${statusClass} ${isOrchestrator ? styles.nodeOrchestrator : ''}`}
      onClick={() => onNodeClick?.(task)}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'var(--border)', width: 8, height: 8 }} />

      <div className={styles.nodeHeader}>
        <span className={`${styles.nodeIcon} ${iconColor}`}>{roleEmoji}</span>
        <span className={styles.nodeTitle}>{task.title.replace(/^\[Delegated\]\s*/, '').slice(0, 50)}</span>
      </div>

      <div className={styles.nodeAgent}>
        {task.assigned_to_agent ?? 'unassigned'}
      </div>

      {/* Result preview for completed tasks */}
      {resultSummary && (
        <div className={styles.nodeResult}>{resultSummary}</div>
      )}

      <div className={styles.nodeStatusRow}>
        <span className={`${styles.nodeStatusDot} ${dotClass}`} />
        <span className={styles.nodeStatusLabel}>{task.status.replace('_', ' ')}</span>
        {duration && <span className={styles.nodeDuration}>⏱ {duration}</span>}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--border)', width: 8, height: 8 }} />
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
  onNodeClick?: (task: ConductorTask) => void
}

export function PipelineDiagram({ tasks, onNodeClick }: Props) {
  // Build tree and convert to React Flow nodes/edges
  const { nodes, edges } = useMemo(() => {
    if (tasks.length === 0) return { nodes: [], edges: [] }

    const tree = buildTaskTree(tasks)
    const flowNodes: Node[] = []
    const flowEdges: Edge[] = []
    const HORIZ_GAP = 280
    const VERT_GAP = 160

    // Build a task lookup for edge labels
    const taskMap = new Map<string, ConductorTask>()
    for (const t of tasks) taskMap.set(t.id, t)

    function layoutNode(treeNode: TaskTreeNode, x: number, y: number, _parentId?: string): number {
      const nodeId = treeNode.task.id

      flowNodes.push({
        id: nodeId,
        type: 'pipeline',
        position: { x, y },
        data: {
          task: treeNode.task,
          isOrchestrator: treeNode.depth === 0,
          onNodeClick,
        },
      })

      if (_parentId) {
        const isActive = treeNode.task.status === 'in_progress' || treeNode.task.status === 'analyzing'
        const isComplete = treeNode.task.status === 'completed' || treeNode.task.status === 'approved'
        const parentTask = taskMap.get(_parentId)
        const label = parentTask ? getEdgeLabel(parentTask, treeNode.task) : ''

        flowEdges.push({
          id: `e-${_parentId}-${nodeId}`,
          source: _parentId,
          target: nodeId,
          animated: isActive,
          label: label || undefined,
          labelStyle: {
            fontSize: 10,
            fill: isComplete ? '#10b981' : isActive ? '#6366f1' : 'var(--text-tertiary)',
            fontWeight: 500,
          },
          labelBgStyle: {
            fill: 'var(--bg-secondary)',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          style: {
            stroke: isComplete ? '#10b981' : isActive ? '#6366f1' : 'var(--border)',
            strokeWidth: isActive ? 2.5 : isComplete ? 2 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 12,
            height: 12,
            color: isComplete ? '#10b981' : isActive ? '#6366f1' : 'var(--border)',
          },
        })
      }

      if (treeNode.children.length === 0) return x

      // Layout children horizontally below parent
      const totalWidth = (treeNode.children.length - 1) * HORIZ_GAP
      let childX = x - totalWidth / 2

      for (const child of treeNode.children) {
        childX = layoutNode(child, childX, y + VERT_GAP, nodeId)
        childX += HORIZ_GAP
      }

      return x
    }

    // Layout each root tree
    let startX = 0
    for (const root of tree) {
      const subtreeWidth = countLeaves(root) * HORIZ_GAP
      layoutNode(root, startX + subtreeWidth / 2, 40)
      startX += subtreeWidth + HORIZ_GAP
    }

    return { nodes: flowNodes, edges: flowEdges }
  }, [tasks, onNodeClick])

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
    <div>
      <div className={styles.diagramWrap}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
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

/** Count leaf nodes in a tree for layout width calculation */
function countLeaves(node: TaskTreeNode): number {
  if (node.children.length === 0) return 1
  return node.children.reduce((acc, child) => acc + countLeaves(child), 0)
}
