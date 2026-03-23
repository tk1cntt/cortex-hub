// ============================================================
// Complexity-Based Model Routing — Pure Heuristics
// Zero LLM overhead. Inspired by GSD-2's routing strategy.
//
// Analyzes task signals to classify complexity → model tier.
// Light tasks → cheap models, heavy tasks → capable models.
// ============================================================

/** Model tier — maps to provider chain priority */
export type ModelTier = 'light' | 'standard' | 'heavy'

/** Complexity classification result */
export type ComplexityAnalysis = {
  tier: ModelTier
  score: number // 1-10
  signals: ComplexitySignal[]
  reasoning: string
  recommendedModel?: string
}

/** Individual complexity signal with weight */
export type ComplexitySignal = {
  name: string
  value: number
  weight: number
  contribution: number
}

/** Task input for complexity analysis */
export type TaskInput = {
  /** The user's request or task description */
  prompt: string
  /** Number of files likely to be touched */
  fileCount?: number
  /** Number of steps in the plan */
  stepCount?: number
  /** Estimated token count for the prompt */
  tokenEstimate?: number
  /** Task type hint */
  taskType?: 'completion' | 'planning' | 'research' | 'review' | 'generation' | 'debug' | 'refactor'
  /** Previous attempt failed (escalation) */
  isRetry?: boolean
  /** Context about the codebase */
  codebaseSize?: 'small' | 'medium' | 'large'
}

/** Model tier configuration */
export type TierConfig = {
  light: { models: string[]; maxTokens?: number }
  standard: { models: string[]; maxTokens?: number }
  heavy: { models: string[]; maxTokens?: number }
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  light: {
    models: ['gpt-5.4-mini', 'gemini-2.5-flash', 'claude-haiku-4-5-20251001'],
    maxTokens: 4096,
  },
  standard: {
    models: ['gpt-5.4', 'gemini-2.5-pro', 'claude-sonnet-4-6-20260312'],
    maxTokens: 8192,
  },
  heavy: {
    models: ['o3', 'gemini-2.5-pro', 'claude-opus-4-6-20260312'],
    maxTokens: 16384,
  },
}

// ── Complexity Keywords ──

const HEAVY_KEYWORDS = [
  'architect', 'design system', 'refactor entire', 'migration',
  'rewrite', 'from scratch', 'full build', 'production-grade',
  'security audit', 'threat model', 'performance optimization',
  'database schema', 'api design', 'microservices', 'distributed',
  'complex', 'advanced', 'comprehensive', 'enterprise',
]

const LIGHT_KEYWORDS = [
  'fix typo', 'rename', 'add comment', 'update readme',
  'bump version', 'format', 'lint', 'simple', 'quick',
  'minor', 'small change', 'one line', 'trivial',
  'remove unused', 'cleanup', 'status', 'check',
  'list', 'show', 'help', 'explain briefly',
]

const STANDARD_KEYWORDS = [
  'add feature', 'implement', 'create', 'update',
  'fix bug', 'debug', 'test', 'review',
  'endpoint', 'component', 'function', 'class',
]

// ── Main Analyzer ──

/** Analyze task complexity using pure heuristics — zero LLM cost */
export function analyzeComplexity(input: TaskInput): ComplexityAnalysis {
  const signals: ComplexitySignal[] = []
  const prompt = input.prompt.toLowerCase()

  // Signal 1: Keyword analysis (weight: 3)
  const heavyHits = HEAVY_KEYWORDS.filter(k => prompt.includes(k)).length
  const lightHits = LIGHT_KEYWORDS.filter(k => prompt.includes(k)).length
  const standardHits = STANDARD_KEYWORDS.filter(k => prompt.includes(k)).length

  const keywordScore = Math.min(10, Math.max(1,
    5 + (heavyHits * 2) - (lightHits * 2) + (standardHits * 0.5)
  ))
  signals.push({ name: 'keywords', value: keywordScore, weight: 3, contribution: keywordScore * 3 })

  // Signal 2: Prompt length (weight: 2) — longer prompts = more complex
  const wordCount = prompt.split(/\s+/).length
  const lengthScore = wordCount <= 10 ? 2 : wordCount <= 50 ? 4 : wordCount <= 150 ? 6 : wordCount <= 500 ? 8 : 10
  signals.push({ name: 'promptLength', value: lengthScore, weight: 2, contribution: lengthScore * 2 })

  // Signal 3: File count (weight: 2)
  const fileScore = !input.fileCount ? 5 :
    input.fileCount <= 1 ? 2 : input.fileCount <= 3 ? 4 : input.fileCount <= 10 ? 6 : input.fileCount <= 20 ? 8 : 10
  signals.push({ name: 'fileCount', value: fileScore, weight: 2, contribution: fileScore * 2 })

  // Signal 4: Step count (weight: 2)
  const stepScore = !input.stepCount ? 5 :
    input.stepCount <= 1 ? 2 : input.stepCount <= 3 ? 4 : input.stepCount <= 5 ? 6 : input.stepCount <= 10 ? 8 : 10
  signals.push({ name: 'stepCount', value: stepScore, weight: 2, contribution: stepScore * 2 })

  // Signal 5: Task type (weight: 2)
  const typeScores: Record<string, number> = {
    completion: 3, review: 4, debug: 5, generation: 6,
    research: 7, refactor: 8, planning: 9,
  }
  const typeScore = input.taskType ? (typeScores[input.taskType] ?? 5) : 5
  signals.push({ name: 'taskType', value: typeScore, weight: 2, contribution: typeScore * 2 })

  // Signal 6: Token estimate (weight: 1)
  const tokenScore = !input.tokenEstimate ? 5 :
    input.tokenEstimate <= 1000 ? 2 : input.tokenEstimate <= 5000 ? 4 :
    input.tokenEstimate <= 20000 ? 6 : input.tokenEstimate <= 50000 ? 8 : 10
  signals.push({ name: 'tokenEstimate', value: tokenScore, weight: 1, contribution: tokenScore * 1 })

  // Signal 7: Codebase size (weight: 1)
  const sizeScores: Record<string, number> = { small: 3, medium: 5, large: 8 }
  const sizeScore = input.codebaseSize ? (sizeScores[input.codebaseSize] ?? 5) : 5
  signals.push({ name: 'codebaseSize', value: sizeScore, weight: 1, contribution: sizeScore * 1 })

  // Signal 8: Retry escalation (weight: 1)
  const retryScore = input.isRetry ? 8 : 5
  signals.push({ name: 'retryEscalation', value: retryScore, weight: 1, contribution: retryScore * 1 })

  // Calculate weighted average
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0)
  const weightedSum = signals.reduce((sum, s) => sum + s.contribution, 0)
  const rawScore = weightedSum / totalWeight

  // Normalize to 1-10
  const score = Math.round(Math.max(1, Math.min(10, rawScore)) * 10) / 10

  // Classify tier
  const tier: ModelTier = score <= 3.5 ? 'light' : score <= 6.5 ? 'standard' : 'heavy'

  // Build reasoning
  const topSignals = [...signals]
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map(s => `${s.name}(${s.value})`)
    .join(', ')

  const reasoning = `Complexity ${score}/10 → ${tier} tier [${topSignals}]`

  return { tier, score, signals, reasoning }
}

/** Select best model from chain based on tier preference */
export function selectModelForTier(
  tier: ModelTier,
  availableModels: string[],
  config: TierConfig = DEFAULT_TIER_CONFIG
): string | null {
  const preferred = config[tier].models

  // Try preferred models first
  for (const model of preferred) {
    if (availableModels.some(m => m.includes(model) || model.includes(m))) {
      return availableModels.find(m => m.includes(model) || model.includes(m)) ?? null
    }
  }

  // Fallback: for heavy tier, try standard models; for light, accept any
  if (tier === 'heavy') {
    for (const model of config.standard.models) {
      if (availableModels.some(m => m.includes(model) || model.includes(m))) {
        return availableModels.find(m => m.includes(model) || model.includes(m)) ?? null
      }
    }
  }

  // Last resort: first available
  return availableModels[0] ?? null
}

/** Reorder a provider chain by tier preference */
export function reorderChainByTier<T extends { model: string }>(
  chain: T[],
  tier: ModelTier,
  config: TierConfig = DEFAULT_TIER_CONFIG
): T[] {
  const preferred = config[tier].models
  const preferredSet = new Set(preferred)

  // Score each slot: lower = better match for tier
  const scored = chain.map(slot => {
    let priority = 999
    for (let i = 0; i < preferred.length; i++) {
      if (slot.model.includes(preferred[i] ?? '') || (preferred[i] ?? '').includes(slot.model)) {
        priority = i
        break
      }
    }
    return { slot, priority, isPreferred: preferredSet.has(slot.model) || priority < 999 }
  })

  // Sort: preferred models first (by priority), then others
  scored.sort((a, b) => a.priority - b.priority)
  return scored.map(s => s.slot)
}
