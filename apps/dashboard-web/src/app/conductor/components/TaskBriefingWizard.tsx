'use client'

import { useState, useCallback, useRef } from 'react'
import {
  type AcceptanceCriterion,
  type ImageAttachment,
  type TaskStrategy,
  getIdeInfo,
} from './shared'
import { StrategyReview } from './StrategyReview'
import { createConductorTask, type ConductorAgent, type ConductorTask } from '@/lib/api'
import styles from './TaskBriefingWizard.module.css'

type WizardStep = 1 | 2 | 3 | 4

interface Props {
  onClose: () => void
  onCreated: () => void
  agents: ConductorAgent[]
}



export function TaskBriefingWizard({ onClose, onCreated, agents }: Props) {
  // ── Step 1: Brief ──
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([])
  const [images, setImages] = useState<ImageAttachment[]>([])
  const [priority, setPriority] = useState(5)
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Step 2: Assign Lead ──
  const [leadAgent, setLeadAgent] = useState('')

  // ── Step 3: Strategy Review ──
  const [analyzing, setAnalyzing] = useState(false)
  const [strategy, setStrategy] = useState<TaskStrategy | null>(null)
  const [createdTask, setCreatedTask] = useState<ConductorTask | null>(null)

  // ── Step 4: Pipeline ──
  const [createdTaskIds, setCreatedTaskIds] = useState<string[]>([])

  // ── Wizard state ──
  const [step, setStep] = useState<WizardStep>(1)
  const [submitting, setSubmitting] = useState(false)

  // ── Image paste handler ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item || !item.type.startsWith('image/')) continue
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = (ev) => {
        const data = ev.target?.result as string
        if (!data) return
        setImages(prev => [...prev, { data, name: file.name || `image-${prev.length + 1}.png` }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files) return
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file || !file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = (ev) => {
        const data = ev.target?.result as string
        if (!data) return
        setImages(prev => [...prev, { data, name: file.name }])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  // ── Criteria management ──
  const addCriterion = () => {
    setCriteria(prev => [...prev, { id: `c-${Date.now()}`, text: '', completed: false }])
  }
  const updateCriterion = (id: string, text: string) => {
    setCriteria(prev => prev.map(c => c.id === id ? { ...c, text } : c))
  }
  const removeCriterion = (id: string) => {
    setCriteria(prev => prev.filter(c => c.id !== id))
  }

  // ── Tags ──
  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  // ── Step 2 → 3: Create task and simulate agent analysis ──
  const handleAssignAndAnalyze = async () => {
    if (!leadAgent) return
    setStep(3)
    setAnalyzing(true)

    try {
      // Create the actual task with 'analyzing' status indicator
      const imageMetadata = images.length > 0
        ? { attachments: images.map(img => ({ type: 'image', name: img.name, data: img.data })) }
        : undefined

      const res = await createConductorTask({
        title: title.trim(),
        description: [
          description.trim(),
          criteria.filter(c => c.text.trim()).length > 0
            ? '\n\n**Acceptance Criteria:**\n' + criteria.filter(c => c.text.trim()).map(c => `- [ ] ${c.text}`).join('\n')
            : '',
          tags.length > 0 ? `\n\n**Tags:** ${tags.join(', ')}` : '',
        ].join(''),
        assignedTo: leadAgent,
        priority,
        agentId: 'dashboard-ui',
        metadata: {
          ...imageMetadata,
          workflow: 'orchestrated',
          phase: 'analyzing',
          acceptanceCriteria: criteria.filter(c => c.text.trim()).map(c => c.text),
          tags,
        },
      })
      setCreatedTask(res.task)

      // Simulate agent analysis (in production, this would poll for agent response)
      await new Promise(r => setTimeout(r, 2500))

      // Generate simulated strategy based on description keywords
      const desc = (title + ' ' + description).toLowerCase()
      const simulatedRoles: TaskStrategy['roles'] = []
      const simulatedSubtasks: TaskStrategy['subtasks'] = []

      if (desc.includes('ui') || desc.includes('giao diện') || desc.includes('frontend') || desc.includes('design') || desc.includes('component') || desc.includes('dashboard')) {
        const uiAgent = agents.find(a => a.capabilities?.includes('frontend'))
        simulatedRoles.push({
          role: 'ui',
          label: '🎨 UI / Frontend',
          agent: uiAgent?.agentId || 'anti-01',
          rationale: 'Task involves UI/frontend changes. Best suited for agents with frontend capability.',
        })
        simulatedSubtasks.push({
          title: `UI Implementation: ${title.trim()}`,
          description: 'Implement the UI changes described in the brief',
          role: 'ui',
        })
      }

      if (desc.includes('api') || desc.includes('backend') || desc.includes('database') || desc.includes('endpoint') || desc.includes('server')) {
        const backendAgent = agents.find(a => a.capabilities?.includes('backend'))
        simulatedRoles.push({
          role: 'backend',
          label: '🔧 Backend',
          agent: backendAgent?.agentId || '',
          rationale: 'Task requires backend/API changes.',
        })
        simulatedSubtasks.push({
          title: `Backend changes: ${title.trim()}`,
          description: 'Implement backend API and logic changes',
          role: 'backend',
          dependsOn: simulatedRoles.some(r => r.role === 'ui') ? [] : undefined,
        })
      }

      // Always suggest a reviewer
      const reviewAgent = agents.find(a => a.capabilities?.includes('review'))
      simulatedRoles.push({
        role: 'review',
        label: '🔍 Reviewer',
        agent: reviewAgent?.agentId || 'codex',
        rationale: 'Code review ensures quality and catches issues before merge.',
      })
      simulatedSubtasks.push({
        title: `Review: ${title.trim()}`,
        description: 'Review all code changes for quality and correctness',
        role: 'review',
        dependsOn: simulatedSubtasks.map(s => s.role),
      })

      // If no specific roles matched, add a general implementation role
      if (simulatedRoles.length === 1) { // only reviewer
        simulatedRoles.unshift({
          role: 'implementation',
          label: '⚡ Implementation',
          agent: leadAgent,
          rationale: 'General task implementation by the lead agent.',
        })
        simulatedSubtasks.unshift({
          title: `Implement: ${title.trim()}`,
          description: description.trim(),
          role: 'implementation',
        })
      }

      setStrategy({
        summary: `Analyzed task "${title.trim()}". Identified ${simulatedRoles.length} roles needed with ${simulatedSubtasks.length} work items. ` +
          (simulatedSubtasks.some(s => s.dependsOn?.length) ? 'Review depends on implementation completion.' : 'Tasks can run in parallel.'),
        roles: simulatedRoles,
        subtasks: simulatedSubtasks,
        estimatedEffort: simulatedSubtasks.length <= 2 ? 'Small (~1 session)' : 'Medium (~2-3 sessions)',
      })
    } catch (err) {
      console.error('Failed to create task:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Step 3 → 4: Approve strategy and create subtasks ──
  const handleApproveStrategy = async (approvedStrategy: TaskStrategy) => {
    if (!createdTask) return
    setSubmitting(true)

    try {
      const taskIds = [createdTask.id]

      // Create subtasks for each role
      for (const subtask of approvedStrategy.subtasks) {
        const role = approvedStrategy.roles.find(r => r.role === subtask.role)
        if (!role?.agent) continue

        const subRes = await createConductorTask({
          title: subtask.title,
          description: [
            subtask.description ?? '',
            `\n\nRole: ${role.label}`,
            `Parent task: ${title.trim()}`,
          ].join(''),
          assignedTo: role.agent,
          priority,
          agentId: 'dashboard-ui',
          metadata: {
            parentTaskId: createdTask.id,
            role: role.role,
            workflow: 'orchestrated',
            phase: 'execution',
          },
        })
        taskIds.push(subRes.task.id)
      }

      setCreatedTaskIds(taskIds)
      onCreated()
      setStep(4)
    } catch (err) {
      console.error('Failed to create subtasks:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step labels ──
  const stepLabels = ['Brief', 'Lead Agent', 'Strategy', 'Pipeline']
  const priorityLabel = priority <= 3 ? 'Critical' : priority <= 5 ? 'High' : priority <= 7 ? 'Medium' : 'Low'

  return (
    <div className={styles.wizardOverlay} onClick={onClose}>
      <div className={styles.wizardPanel} onClick={(e) => e.stopPropagation()}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          {stepLabels.map((label, i) => (
            <div
              key={label}
              className={`${styles.stepItem} ${step === (i + 1) as WizardStep ? styles.stepItemActive : ''} ${step > i + 1 ? styles.stepItemDone : ''}`}
            >
              <span className={styles.stepNum}>{step > i + 1 ? '✓' : i + 1}</span>
              <span className={styles.stepLabel}>{label}</span>
              {i < stepLabels.length - 1 && <span className={styles.stepLine} />}
            </div>
          ))}
        </div>

        {/* ════════ Step 1: Brief ════════ */}
        {step === 1 && (
          <div className={styles.wizardBody}>
            <h2 className={styles.wizardTitle}>Describe your task</h2>
            <p className={styles.wizardSubtitle}>Be thorough — the lead agent will use this to plan the work</p>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                Title <span className={styles.fieldRequired}>*</span>
              </label>
              <input
                className={styles.fieldInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Description</label>
              <textarea
                ref={textareaRef}
                className={styles.fieldTextarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onPaste={handlePaste}
                onDrop={handleImageDrop}
                onDragOver={(e) => e.preventDefault()}
                placeholder="Describe the task in detail. Include context, requirements, and constraints. Paste screenshots with Ctrl+V..."
                rows={6}
              />
              <span className={styles.fieldHint}>Tip: Paste screenshots directly (Ctrl+V) or drag & drop images</span>
            </div>

            {/* Image previews */}
            {images.length > 0 && (
              <div className={styles.imageGrid}>
                {images.map((img, i) => (
                  <div key={i} className={styles.imageThumb}>
                    <img src={img.data} alt={img.name} />
                    <button
                      type="button"
                      className={styles.imageRemove}
                      onClick={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Acceptance Criteria */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Acceptance Criteria</label>
              <div className={styles.criteriaList}>
                {criteria.map((c) => (
                  <div key={c.id} className={styles.criterionItem}>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>☐</span>
                    <input
                      className={styles.criterionInput}
                      value={c.text}
                      onChange={(e) => updateCriterion(c.id, e.target.value)}
                      placeholder="e.g., Pipeline nodes should pulse when active"
                    />
                    <button className={styles.criterionRemove} onClick={() => removeCriterion(c.id)}>×</button>
                  </div>
                ))}
                <button className={styles.addCriterionBtn} onClick={addCriterion}>
                  + Add criterion
                </button>
              </div>
            </div>

            {/* Priority */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Priority</label>
              <div className={styles.prioritySlider}>
                <input
                  type="range"
                  className={styles.priorityTrack}
                  min={1}
                  max={10}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                />
                <div>
                  <span className={styles.priorityValue}>{priority}</span>
                  <span className={styles.priorityLabel}>{priorityLabel}</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Tags</label>
              <div className={styles.tagsList}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                    <button className={styles.tagRemove} onClick={() => setTags(prev => prev.filter(t => t !== tag))}>×</button>
                  </span>
                ))}
                <input
                  className={styles.tagInput}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addTag(tagInput)
                    }
                  }}
                  onBlur={() => { if (tagInput) addTag(tagInput) }}
                  placeholder="Add tag..."
                />
              </div>
            </div>

            <div className={styles.wizardActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!title.trim()}
                onClick={() => setStep(2)}
              >
                Next: Assign Lead →
              </button>
            </div>
          </div>
        )}

        {/* ════════ Step 2: Assign Lead Agent ════════ */}
        {step === 2 && (
          <div className={styles.wizardBody}>
            <h2 className={styles.wizardTitle}>Assign Lead Agent</h2>
            <p className={styles.wizardSubtitle}>This agent will own and orchestrate the task</p>

            <div className={styles.orchestratorCallout}>
              <span className={styles.orchestratorCalloutIcon}>🎯</span>
              <div className={styles.orchestratorCalloutText}>
                <strong>The lead agent will:</strong> analyze task requirements, propose a strategy with role assignments, and coordinate execution after your approval.
              </div>
            </div>

            <div className={styles.agentGrid}>
              {agents.map((agent) => {
                const { icon, label, colorClass } = getIdeInfo(agent.ide)
                const isSelected = leadAgent === agent.agentId

                return (
                  <div
                    key={agent.agentId}
                    className={`${styles.agentOption} ${isSelected ? styles.agentOptionSelected : ''}`}
                    onClick={() => setLeadAgent(agent.agentId)}
                  >
                    {isSelected && <span className={styles.agentOptionCheck}>✓</span>}
                    <div className={styles.agentOptionHeader}>
                      <span className={`${styles.agentOptionIcon} ${styles[colorClass] || ''}`}>{icon}</span>
                      <div>
                        <div className={styles.agentOptionName}>{agent.agentId}</div>
                        <div className={styles.agentOptionIde}>{label}</div>
                      </div>
                    </div>
                    {agent.capabilities && agent.capabilities.length > 0 && (
                      <div className={styles.agentOptionCaps}>
                        {agent.capabilities.map((cap) => (
                          <span key={cap} className={styles.agentOptionCap}>{cap}</span>
                        ))}
                      </div>
                    )}
                    <div className={styles.agentOptionStatus}>
                      <span className={`${styles.statusDot} ${agent.status === 'busy' ? styles.statusDotBusy : ''}`} />
                      {agent.status === 'idle' ? 'Available' : agent.status === 'busy' ? 'Busy' : 'Online'}
                    </div>
                  </div>
                )
              })}
            </div>

            {agents.length === 0 && (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-tertiary)' }}>
                No agents online. Tasks will be queued for pickup.
              </div>
            )}

            <div className={styles.wizardActions}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← Back</button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!leadAgent}
                onClick={handleAssignAndAnalyze}
              >
                Assign & Analyze →
              </button>
            </div>
          </div>
        )}

        {/* ════════ Step 3: Strategy Review ════════ */}
        {step === 3 && (
          <StrategyReview
            analyzing={analyzing}
            strategy={strategy}
            leadAgent={leadAgent}
            agents={agents}
            submitting={submitting}
            onApprove={handleApproveStrategy}
            onReject={() => {
              setStrategy(null)
              setAnalyzing(false)
              setStep(2)
            }}
            onBack={() => setStep(2)}
          />
        )}

        {/* ════════ Step 4: Pipeline Monitor ════════ */}
        {step === 4 && (
          <div className={styles.wizardBody}>
            <h2 className={styles.wizardTitle}>🚀 Pipeline Active</h2>
            <p className={styles.wizardSubtitle}>
              {createdTaskIds.length} tasks created. Close this wizard and switch to Pipeline view to see the live diagram.
            </p>
            <div style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '2px solid var(--status-healthy, #10b981)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto var(--space-4)',
                fontSize: '1.5rem',
              }}>
                ✓
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Strategy approved. {createdTaskIds.length - 1} subtasks dispatched to agents.
              </p>
            </div>
            <div className={styles.wizardActions}>
              <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
                Close & View Pipeline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
