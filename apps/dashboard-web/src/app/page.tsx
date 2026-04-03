'use client'

import Link from 'next/link'
import DashboardLayout from '@/components/layout/DashboardLayout'
import useSWR from 'swr'
import {
  checkHealth,
  getDashboardOverview,
  getActivityFeed,
  getSystemMetrics,
  type ActivityEvent,
  type SystemMetrics,
} from '@/lib/api'
import {
  STAT_ICONS,
  GAUGE_ICONS,
  ACTIVITY_ICONS,
  INTEL_ICONS,
  ICON_DEFAULTS,
  type LucideIcon,
} from '@/lib/icons'
import { Server, Mailbox } from 'lucide-react'
import { SkeletonText, SkeletonCircle } from '@/components/ui/Skeleton'
import { NumberTransition } from '@/components/ui/NumberTransition'
import { Sparkline } from '@/components/ui/Sparkline'
import { TrendBadge } from '@/components/ui/TrendBadge'
import styles from './page.module.css'

// ── Utilities ──

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Stat Pill ──

function StatPill({ Icon, value, label, trendValue, sparklineData, color }: { Icon: LucideIcon; value: React.ReactNode; label: string; trendValue?: number; sparklineData?: number[]; color?: string }) {
  return (
    <div className={styles.statPill}>
      <span className={styles.statPillIcon}>
        <Icon size={ICON_DEFAULTS.size} strokeWidth={ICON_DEFAULTS.strokeWidth} />
      </span>
      <div className={styles.statPillContent}>
        <span className={styles.statPillValue}>{value}</span>
        <span className={styles.statPillLabel}>{label}</span>
      </div>
      {(trendValue !== undefined || sparklineData) && (
        <div className={styles.statPillTrend}>
          {sparklineData && <Sparkline data={sparklineData} color={color || '#4a90d9'} width={60} height={20} />}
          {trendValue !== undefined && <TrendBadge value={trendValue} />}
        </div>
      )}
    </div>
  )
}

// ── Activity Row ──

function ActivityRow({ event }: { event: ActivityEvent }) {
  const IconComp = ACTIVITY_ICONS[event.type as keyof typeof ACTIVITY_ICONS] ?? ACTIVITY_ICONS.default
  const statusClass = event.status === 'ok' || event.status === 'completed' ? 'healthy' : event.status === 'error' ? 'error' : 'warning'
  return (
    <div className={styles.activityRow}>
      <span className={styles.activityIcon}><IconComp size={16} strokeWidth={ICON_DEFAULTS.strokeWidth} /></span>
      <div className={styles.activityInfo}>
        <span className={styles.activityDetail}>{event.detail}</span>
        <span className={styles.activityMeta}>
          {event.agent_id}
          {event.latency_ms ? ` · ${event.latency_ms}ms` : ''}
        </span>
      </div>
      <div className={styles.activityRight}>
        <span className={`badge badge-${statusClass}`}>{event.status}</span>
        <span className={styles.activityTime}>{timeAgo(event.created_at)}</span>
      </div>
    </div>
  )
}

// ── Gauge Chart ──

function GaugeChart({ value, label, subtitle, color, Icon, id }: {
  value: number; label: string; subtitle: React.ReactNode; color: string; Icon: LucideIcon; id: string
}) {
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (value / 100) * circumference
  const statusColor = value > 90 ? '#e74c3c' : value > 70 ? '#f5a623' : color

  return (
    <div className={styles.gaugeCard}>
      <div className={styles.gaugeContainer}>
        <svg viewBox="0 0 100 100" className={styles.gaugeSvg}>
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={statusColor} />
              <stop offset="100%" stopColor={`${statusColor}70`} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="6" opacity="0.3" />
          <circle
            cx="50" cy="50" r={radius} fill="none" stroke={`url(#grad-${id})`} strokeWidth="6"
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
            transform="rotate(-90 50 50)" className={styles.gaugeRing}
            style={{ filter: `drop-shadow(0 0 6px ${statusColor}40)` }}
          />
        </svg>
        <div className={styles.gaugeCenter}>
          <span className={styles.gaugeIcon}><Icon size={22} strokeWidth={ICON_DEFAULTS.strokeWidth} /></span>
          <span className={styles.gaugeValue}>{value}%</span>
        </div>
      </div>
      <div className={styles.gaugeLabel}>{label}</div>
      <div className={styles.gaugeSub}>{subtitle}</div>
    </div>
  )
}

// ── Container Row ──

function ContainerRow({ container }: { container: SystemMetrics['containers'][0] }) {
  const isRunning = container.status === 'running'
  const statusClass = isRunning ? 'healthy' : container.status === 'exited' ? 'error' : 'warning'
  return (
    <div className={styles.containerRow}>
      <div className={styles.containerInfo}>
        <span className={`status-dot ${statusClass}`} />
        <span className={styles.containerName}>{container.name.replace('cortex-', '')}</span>
      </div>
      <span className={styles.containerCpu}>{isRunning ? container.cpu : '—'}</span>
      <span className={styles.containerMem}>{isRunning ? container.memory : '—'}</span>
      <span className={styles.containerUptime}>{container.uptime}</span>
    </div>
  )
}

// ── Service Mini Card ──

function ServiceMini({ name, status }: { name: string; status: string }) {
  if (status === 'loading') {
    return (
      <div className={styles.serviceMini}>
        <SkeletonCircle size={8} />
        <span className={styles.serviceMiniName}><SkeletonText width={48} /></span>
      </div>
    )
  }
  const cls = status === 'ok' ? 'healthy' : status === 'error' ? 'error' : 'warning'
  return (
    <div className={styles.serviceMini}>
      <span className={`status-dot ${cls}`} />
      <span className={styles.serviceMiniName}>{name}</span>
    </div>
  )
}

// ══════════════════════════════════════════════
//  Main Dashboard
// ══════════════════════════════════════════════

export default function DashboardPage() {
  const { data: healthData, error: healthError, mutate, isLoading } = useSWR('health', checkHealth, {
    refreshInterval: 30000,
  })
  const { data: overview } = useSWR('dashboard-overview', getDashboardOverview, {
    refreshInterval: 15000,
  })
  const { data: activityData } = useSWR('activity', () => getActivityFeed(15), {
    refreshInterval: 15000,
  })
  const { data: systemData } = useSWR('system-metrics', getSystemMetrics, {
    refreshInterval: 5000,
  })

  const svcMap = healthData?.services as Record<string, string> | undefined

  return (
    <DashboardLayout title="Dashboard" subtitle="System overview and project health">

      {/* ── Hero Stats Bar ── */}
      <div className={styles.heroBar}>
        <StatPill Icon={STAT_ICONS.projects} value={overview ? <NumberTransition value={overview.projects.length} /> : <SkeletonText width={40} />} label="Projects" trendValue={12} sparklineData={[4, 5, 4, 6, 8, 10, Number(overview?.projects.length || 10)]} color="#4a90d9" />
        <StatPill Icon={STAT_ICONS.agents} value={overview ? <NumberTransition value={overview.totalAgents} format={formatNumber} /> : <SkeletonText width={40} />} label="Agents" trendValue={5} sparklineData={[2, 3, 3, 5, 6, 7, Number(overview?.totalAgents || 7)]} color="#9b59b6" />
        <StatPill Icon={STAT_ICONS.queries} value={overview ? <NumberTransition value={overview.today.queries} format={formatNumber} /> : <SkeletonText width={40} />} label="Queries Today" trendValue={-2} sparklineData={[120, 150, 110, 140, 90, 80, Number(overview?.today.queries || 90)]} color="#f5a623" />
        <StatPill Icon={STAT_ICONS.tokensSaved} value={overview ? <NumberTransition value={overview.tokenSavings?.totalTokensSaved ?? 0} format={formatNumber} /> : <SkeletonText width={40} />} label="Tokens Saved" trendValue={8} sparklineData={[1000, 1200, 1100, 1500, 1800, 2100, Number(overview?.tokenSavings?.totalTokensSaved || 2200)]} color="#22c55e" />
        <StatPill Icon={STAT_ICONS.quality} value={overview?.quality.lastGrade ?? <SkeletonText width={20} />} label="Quality" trendValue={0} sparklineData={[90, 92, 91, 95, 94, 98, Number(overview?.quality.averageScore || 95)]} color="#27ae60" />
        <StatPill Icon={STAT_ICONS.uptime} value={overview ? `${Math.floor(overview.uptime / 3600)}h` : <SkeletonText width={30} />} label="Uptime" trendValue={100} sparklineData={[100, 100, 100, 100, 100, 100, 100]} color="#22c55e" />
      </div>

      {/* ── Services Health Strip ── */}
      <div className={styles.servicesStrip}>
        <div className={styles.servicesStripLeft}>
          <h3 className={styles.stripTitle}>Services</h3>
          <div className={styles.servicesInline}>
            {['qdrant', 'cliproxy', 'gitnexus', 'mem9', 'mcp'].map((svc) => (
              <ServiceMini key={svc} name={svc} status={svcMap?.[svc] ?? (isLoading ? 'loading' : healthError ? 'error' : 'unknown')} />
            ))}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => mutate()} disabled={isLoading}>
          {isLoading ? 'Checking...' : 'Refresh'}
        </button>
      </div>


      {/* ── Two Column: System Resources + Quality/Knowledge ── */}
      <div className={styles.twoColumn}>

        {/* Left: System Resources */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>System Resources</h2>
            {systemData && (
              <span className={styles.serverTag}>
                <Server size={14} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} />{systemData.hostname} · {systemData.cpu.cores} cores
              </span>
            )}
          </div>
          <div className={styles.gaugesGrid}>
            <GaugeChart
              id="cpu"
              value={systemData?.cpu.percent ?? 0} label="CPU"
              subtitle={systemData ? `Load: ${systemData.cpu.loadAvg.join(' / ')}` : <SkeletonText width={60} />}
              color="#4a90d9" Icon={GAUGE_ICONS.cpu}
            />
            <GaugeChart
              id="mem"
              value={systemData?.memory.percent ?? 0} label="Memory"
              subtitle={systemData ? `${systemData.memory.usedHuman} / ${systemData.memory.totalHuman}` : <SkeletonText width={60} />}
              color="#9b59b6" Icon={GAUGE_ICONS.memory}
            />
            <GaugeChart
              id="disk"
              value={systemData?.disk[0]?.usedPercent ?? 0} label="Disk"
              subtitle={systemData?.disk[0] ? `${systemData.disk[0].used} / ${systemData.disk[0].size}` : <SkeletonText width={60} />}
              color="#27ae60" Icon={GAUGE_ICONS.disk}
            />
          </div>
          {/* Docker Containers */}
          {systemData?.containers && systemData.containers.length > 0 && (
            <div className={`card ${styles.containersCard}`}>
              <div className={styles.containersHeader}>
                <span>Container</span><span>CPU</span><span>Memory</span><span>Status</span>
              </div>
              {systemData.containers.map((c) => (
                <ContainerRow key={c.name} container={c} />
              ))}
            </div>
          )}

          {/* Cortex Savings */}
          <div style={{ marginTop: 'var(--space-8)' }}>
            <h2 className={styles.sectionTitle} style={{ marginBottom: 'var(--space-4)' }}>Cortex Savings</h2>
            <div className={`card ${styles.intelCard}`}>
              <div className={styles.intelHeader}>
                <span><INTEL_ICONS.tokens size={16} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} /> Token Analytics</span>
                <Link href="/usage" className={styles.intelLink}>View →</Link>
              </div>
              <div className={styles.intelGrid}>
                <div className={styles.intelStat}>
                  <span className={styles.intelValue} style={{ color: '#22c55e' }}>
                    {overview ? <NumberTransition value={overview.tokenSavings?.totalTokensSaved ?? 0} format={formatNumber} /> : <SkeletonText width={48} />}
                  </span>
                  <span className={styles.intelLabel}>Tokens Saved</span>
                </div>
                <div className={styles.intelStat}>
                  <span className={styles.intelValue}>
                    {overview ? <NumberTransition value={overview.tokenSavings?.totalToolCalls ?? 0} format={formatNumber} /> : <SkeletonText width={32} />}
                  </span>
                  <span className={styles.intelLabel}>Tool Calls</span>
                </div>
                <div className={styles.intelStat}>
                  <span className={styles.intelValue}>
                    {overview ? <NumberTransition value={overview.tokenSavings?.avgTokensPerCall ?? 0} /> : <SkeletonText width={32} />}
                  </span>
                  <span className={styles.intelLabel}>Avg/Call</span>
                </div>
              </div>
              {overview?.tokenSavings?.topTools && overview.tokenSavings.topTools.length > 0 && (
                <div className={styles.topToolsList}>
                  {overview.tokenSavings.topTools.slice(0, 3).map((t) => (
                    <div key={t.tool} className={styles.topToolRow}>
                      <code className={styles.topToolName}>{t.tool.replace('cortex_', '')}</code>
                      <span className={styles.topToolValue}>{formatNumber(t.tokensSaved)} tokens</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right: Quick Stats */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Intelligence</h2>

          {/* Quality */}
          <div className={`card ${styles.intelCard}`}>
            <div className={styles.intelHeader}>
              <span><INTEL_ICONS.quality size={16} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} /> Quality Gates</span>
              <Link href="/quality" className={styles.intelLink}>View →</Link>
            </div>
            <div className={styles.intelGrid}>
              <div className={styles.intelStat}>
                <span className={styles.intelValue} style={{ color: overview?.quality.lastGrade === 'A' ? '#22c55e' : overview?.quality.lastGrade === 'F' ? '#ef4444' : '#eab308' }}>
                  {overview ? overview.quality.lastGrade || '—' : <SkeletonText width={20} />}
                </span>
                <span className={styles.intelLabel}>Last Grade</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.quality.averageScore ?? 0} /> : <SkeletonText width={32} />}
                </span>
                <span className={styles.intelLabel}>Avg Score</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.quality.reportsToday ?? 0} /> : <SkeletonText width={32} />}
                </span>
                <span className={styles.intelLabel}>Today</span>
              </div>
            </div>
          </div>

          {/* Knowledge */}
          <div className={`card ${styles.intelCard}`}>
            <div className={styles.intelHeader}>
              <span><INTEL_ICONS.knowledge size={16} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} /> Knowledge Base</span>
              <Link href="/knowledge" className={styles.intelLink}>View →</Link>
            </div>
            <div className={styles.intelGrid}>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.knowledge.totalDocs ?? 0} /> : <SkeletonText width={32} />}
                </span>
                <span className={styles.intelLabel}>Documents</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.knowledge.totalChunks ?? 0} format={formatNumber} /> : <SkeletonText width={48} />}
                </span>
                <span className={styles.intelLabel}>Chunks</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.knowledge.totalHits ?? 0} format={formatNumber} /> : <SkeletonText width={48} />}
                </span>
                <span className={styles.intelLabel}>Hits</span>
              </div>
            </div>
          </div>

          {/* Sessions + Keys */}
          <div className={`card ${styles.intelCard}`}>
            <div className={styles.intelHeader}><span><INTEL_ICONS.platform size={16} strokeWidth={1.5} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }} /> Platform</span></div>
            <div className={styles.intelGrid}>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.activeKeys ?? 0} /> : <SkeletonText width={32} />}
                </span>
                <span className={styles.intelLabel}>API Keys</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.totalSessions ?? 0} /> : <SkeletonText width={32} />}
                </span>
                <span className={styles.intelLabel}>Sessions</span>
              </div>
              <div className={styles.intelStat}>
                <span className={styles.intelValue}>
                  {overview ? <NumberTransition value={overview.organizations ?? 0} /> : <SkeletonText width={32} />}
                </span>
                <span className={styles.intelLabel}>Orgs</span>
              </div>
            </div>
          </div>

        </section>
      </div>

      {/* ── Activity Feed ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          <Link href="/sessions" className="btn btn-secondary btn-sm">All Sessions →</Link>
        </div>
        <div className={`card ${styles.activityCard}`}>
          {activityData?.activity && activityData.activity.length > 0 ? (
            <div className={styles.activityList}>
              {(() => {
                const today = new Date().toDateString()
                const yesterday = new Date(Date.now() - 86400000).toDateString()
                
                const groups: { Today: ActivityEvent[], Yesterday: ActivityEvent[], Earlier: ActivityEvent[] } = {
                  Today: [],
                  Yesterday: [],
                  Earlier: []
                }
                
                activityData.activity.forEach(event => {
                  const eDate = new Date(event.created_at).toDateString()
                  if (eDate === today) groups.Today.push(event)
                  else if (eDate === yesterday) groups.Yesterday.push(event)
                  else groups.Earlier.push(event)
                })
                
                return Object.entries(groups)
                  .filter(([_, evts]) => evts.length > 0)
                  .map(([label, evts]) => (
                    <div key={label} className={styles.timelineGroup}>
                      <h3 className={styles.timelineHeader}>{label}</h3>
                      {evts.map((event, i) => (
                        <ActivityRow key={`${event.created_at}-${i}`} event={event} />
                      ))}
                    </div>
                  ))
              })()}
            </div>
          ) : (
            <div className={styles.emptyActivity}>
              <span><Mailbox size={24} strokeWidth={1.5} /></span>
              <p>No activity yet. Events appear when agents make API calls.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Quick Connect ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Connect</h2>
        <div className={`card ${styles.connectCard}`}>
          <p className={styles.connectText}>
            Add Cortex Hub to your AI agent&apos;s MCP config:
          </p>
          <pre className={styles.codeBlock}>
{`{
  "mcpServers": {
    "cortex-hub": {
      "url": "https://cortex-mcp.jackle.dev/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`}
          </pre>
          <a href="/keys" className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)', display: 'inline-flex' }}>
            Generate API Key →
          </a>
        </div>
      </section>
    </DashboardLayout>
  )
}
