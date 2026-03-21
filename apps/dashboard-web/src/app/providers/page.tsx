'use client'

import { useState, useCallback } from 'react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import { config } from '@/lib/config'
import styles from './page.module.css'

interface Provider {
  id: string
  name: string
  icon: string
  description: string
  authType: 'oauth' | 'apikey'
  status: 'connected' | 'disconnected' | 'error'
  models: { id: string; owned_by: string }[]
  modelCount: number
  usedBy: string[]
}

async function fetchProviders() {
  const res = await fetch(`${config.api.base}/api/llm/providers`, {
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error('Failed to fetch providers')
  return res.json() as Promise<{ providers: Provider[] }>
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    connected: 'var(--success)',
    disconnected: 'var(--text-tertiary)',
    error: 'var(--danger)',
  }
  return (
    <span
      className={styles.statusBadge}
      style={{ '--badge-color': colorMap[status] || 'var(--text-tertiary)' } as React.CSSProperties}
    >
      <span className={styles.statusDot} />
      {status}
    </span>
  )
}

interface TestResult {
  success: boolean
  provider: string
  model: string
  latency: number
  reply?: string
  error?: string
}

function ProviderCard({ provider, onReconnect }: { provider: Provider; onReconnect: () => void }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`${config.api.base}/api/llm/providers/${provider.id}/test`, {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
      })
      const data = await res.json() as TestResult
      setTestResult(data)
    } catch (err) {
      setTestResult({ success: false, provider: provider.id, model: '—', latency: 0, error: String(err) })
    } finally {
      setTesting(false)
    }
  }, [provider.id])

  return (
    <div className={`card ${styles.providerCard}`}>
      <div className={styles.providerHeader}>
        <span className={styles.providerIcon}>{provider.icon}</span>
        <div className={styles.providerInfo}>
          <h3 className={styles.providerName}>{provider.name}</h3>
          <p className={styles.providerDesc}>{provider.description}</p>
        </div>
        <StatusBadge status={provider.status} />
      </div>

      {/* Models Section */}
      {provider.status === 'connected' && provider.models.length > 0 && (
        <div className={styles.modelsSection}>
          <h4 className={styles.modelsTitle}>
            Available Models ({provider.modelCount})
          </h4>
          <div className={styles.modelsList}>
            {provider.models.slice(0, 8).map((model) => (
              <span key={model.id} className={styles.modelChip}>
                {model.id}
              </span>
            ))}
            {provider.models.length > 8 && (
              <span className={styles.modelChip} style={{ opacity: 0.6 }}>
                +{provider.models.length - 8} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Used By Section */}
      {provider.usedBy.length > 0 && (
        <div className={styles.usedBySection}>
          <span className={styles.usedByLabel}>Used by:</span>
          {provider.usedBy.map((service) => (
            <span key={service} className={styles.usedByChip}>
              {service}
            </span>
          ))}
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className={`${styles.testResult} ${testResult.success ? styles.testSuccess : styles.testFail}`}>
          <div className={styles.testHeader}>
            <span>{testResult.success ? '✅' : '❌'} Test {testResult.success ? 'Passed' : 'Failed'}</span>
            <span className={styles.testLatency}>{testResult.latency}ms</span>
          </div>
          {testResult.success ? (
            <p className={styles.testDetail}>Model: {testResult.model} — Reply: &quot;{testResult.reply}&quot;</p>
          ) : (
            <p className={styles.testDetail}>{testResult.error}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className={styles.providerActions}>
        {provider.status === 'connected' ? (
          <>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? '⏳ Testing...' : '🧪 Test Connection'}
            </button>
            <button className="btn btn-secondary btn-sm">Disconnect</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onReconnect}>
            🔐 Connect
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Gemini Embedding Config Card ── */
function GeminiConfigCard() {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch(`${config.api.base}/api/setup/configure-mem9`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey: apiKey.trim() }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json() as { success: boolean; message?: string; error?: string }
      setResult({
        success: data.success,
        message: data.success
          ? `✅ ${data.message || 'Gemini embedding configured!'}`
          : `❌ ${data.error || 'Configuration failed'}`,
      })
      if (data.success) setApiKey('')
    } catch (err) {
      setResult({ success: false, message: `❌ ${String(err)}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`card ${styles.providerCard}`}>
      <div className={styles.providerHeader}>
        <span className={styles.providerIcon}>🧠</span>
        <div className={styles.providerInfo}>
          <h3 className={styles.providerName}>Gemini Embedding (mem9)</h3>
          <p className={styles.providerDesc}>
            Google Gemini API for memory embeddings — used by the mem9 memory engine
          </p>
        </div>
      </div>

      <div style={{ padding: '0.75rem 0' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          GCP API Key
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIza..."
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
            }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
          >
            {saving ? '⏳ Testing...' : '🔗 Save & Test'}
          </button>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '0.4rem' }}>
          Get your key from{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            Google AI Studio
          </a>
          {' '}or GCP Console → APIs & Services → Credentials
        </p>
      </div>

      {result && (
        <div
          className={`${styles.testResult} ${result.success ? styles.testSuccess : styles.testFail}`}
        >
          <p className={styles.testDetail}>{result.message}</p>
        </div>
      )}
    </div>
  )
}

export default function ProvidersPage() {
  const { data, error, isLoading, mutate } = useSWR('llm-providers', fetchProviders, {
    refreshInterval: 30000,
  })

  const handleReconnect = () => {
    // Navigate to setup wizard for re-authentication
    window.location.href = '/setup'
  }

  return (
    <DashboardLayout title="LLM Providers" subtitle="Manage AI provider connections and models">
      {/* Summary Stats */}
      <div className={styles.statsRow}>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statValue}>
            {isLoading ? '...' : data?.providers.filter((p) => p.status === 'connected').length || 0}
          </span>
          <span className={styles.statLabel}>Connected</span>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statValue}>
            {isLoading ? '...' : data?.providers.reduce((sum, p) => sum + p.modelCount, 0) || 0}
          </span>
          <span className={styles.statLabel}>Models Available</span>
        </div>
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statValue}>
            {isLoading ? '...' : data?.providers.length || 0}
          </span>
          <span className={styles.statLabel}>Providers</span>
        </div>
        <div className={`card ${styles.statCard}`}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => mutate()}
            disabled={isLoading}
            style={{ width: '100%' }}
          >
            {isLoading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className={`card ${styles.errorCard}`}>
          <p>Failed to load providers. Is the backend API running?</p>
          <button className="btn btn-primary btn-sm" onClick={() => mutate()}>
            Retry
          </button>
        </div>
      )}

      {/* Gemini Embedding Config */}
      <section style={{ marginBottom: '1.5rem' }}>
        <h3 className={styles.infoTitle} style={{ marginBottom: '0.75rem' }}>Embedding Provider</h3>
        <GeminiConfigCard />
      </section>

      {/* Provider Cards */}
      <div className={styles.providersGrid}>
        {isLoading && !data && (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className={`card ${styles.providerCard} ${styles.skeleton}`}>
                <div className={styles.skeletonContent} />
              </div>
            ))}
          </>
        )}
        {data?.providers.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} onReconnect={handleReconnect} />
        ))}
      </div>

      {/* Info Section */}
      <section className={styles.infoSection}>
        <h3 className={styles.infoTitle}>How LLM Providers Work</h3>
        <div className={`card ${styles.infoCard}`}>
          <div className={styles.flowDiagram}>
            <span className={styles.flowStep}>Agent / mem9</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>CLIProxy :8317 (LLM)</span>
          </div>
          <div className={styles.flowDiagram} style={{ marginTop: '0.5rem' }}>
            <span className={styles.flowStep}>mem9 (Embedding)</span>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowStep}>Gemini API (direct)</span>
          </div>
          <p className={styles.infoText}>
            mem9 is the in-process memory engine. LLM requests (fact extraction) route through CLIProxy
            using OAuth. Embedding requests go directly to Google Gemini API using your GCP API key.
          </p>
        </div>
      </section>
    </DashboardLayout>
  )
}
