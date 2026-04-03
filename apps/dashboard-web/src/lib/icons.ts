/**
 * Centralized Lucide icon mapping for Cortex Hub dashboard.
 * Replaces all emoji usage with consistent SVG icons.
 *
 * All icons use: size={20}, strokeWidth={1.5} unless overridden.
 */
import {
  LayoutDashboard,
  Building2,
  BookOpen,
  KeyRound,
  Hexagon,
  BarChart3,
  ShieldCheck,
  Target,
  ArrowLeftRight,
  Settings,
  Folder,
  FolderOpen,
  Bot,
  TrendingUp,
  Gem,
  Trophy,
  Zap,
  Search,
  ClipboardList,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  BookOpenCheck,
  KeySquare,
  Link,
  Cloud,
  Monitor,
  Clock,
  Brain,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Rocket,
  Puzzle,
  Plug,
  BookMarked,
  Repeat,
  Timer,
  Play,
  Package,
  Wrench,
  Palette,
  FlaskConical,
  Hourglass,
  Trash2,
  MessageCircle,
  Lightbulb,
  Flame,
  Hand,
  GitBranch,
  Unlock,
  ArrowUpFromLine,
  Save,
  Sparkles,
  Copy,
  Radio,
  CircleDot,
  MessageSquare,
  Globe,
  Pause,
  Dna,
  Lock,
  Waves,
  ChevronDown,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type { LucideIcon }

/** Default icon props — consistent sizing across dashboard */
export const ICON_DEFAULTS = {
  size: 20,
  strokeWidth: 1.5,
} as const

/** Inline icon props — for icons rendered alongside text */
export const ICON_INLINE = {
  size: 16,
  strokeWidth: 1.5,
  style: { display: 'inline-block', verticalAlign: 'middle' } as const,
} as const

/* ── Sidebar Navigation Icons ── */
export const NAV_ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/orgs': Building2,
  '/knowledge': BookOpen,
  '/keys': KeyRound,
  '/providers': Hexagon,
  '/usage': BarChart3,
  '/quality': ShieldCheck,
  '/conductor': Target,
  '/sessions': ArrowLeftRight,
  '/settings': Settings,
}

/* ── StatPill Icons ── */
export const STAT_ICONS = {
  projects: FolderOpen,
  agents: Bot,
  queries: TrendingUp,
  tokensSaved: Gem,
  quality: Trophy,
  uptime: Zap,
} as const satisfies Record<string, LucideIcon>

/* ── Activity Feed Icons ── */
export const ACTIVITY_ICONS = {
  query: Search,
  default: ClipboardList,
} as const satisfies Record<string, LucideIcon>

/* ── Gauge Chart Icons ── */
export const GAUGE_ICONS = {
  cpu: Cpu,
  memory: MemoryStick,
  disk: HardDrive,
} as const satisfies Record<string, LucideIcon>

/* ── Intel Card Header Icons ── */
export const INTEL_ICONS = {
  tokens: Gem,
  quality: Trophy,
  knowledge: BookOpenCheck,
  platform: KeySquare,
  server: Server,
} as const satisfies Record<string, LucideIcon>

export {
  LayoutDashboard,
  Building2,
  BookOpen,
  KeyRound,
  Hexagon,
  BarChart3,
  ShieldCheck,
  Target,
  ArrowLeftRight,
  Settings,
  Folder,
  FolderOpen,
  Bot,
  TrendingUp,
  Gem,
  Trophy,
  Zap,
  Search,
  ClipboardList,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  BookOpenCheck,
  KeySquare,
  Link,
  Cloud,
  Monitor,
  Clock,
  Brain,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Rocket,
  Puzzle,
  Plug,
  BookMarked,
  Repeat,
  Timer,
  Play,
  Package,
  Wrench,
  Palette,
  FlaskConical,
  Hourglass,
  Trash2,
  MessageCircle,
  Lightbulb,
  Flame,
  Hand,
  GitBranch,
  Unlock,
  ArrowUpFromLine,
  Save,
  Sparkles,
  Copy,
  Radio,
  CircleDot,
  MessageSquare,
  Globe,
  Pause,
  Dna,
  Lock,
  Waves,
  ChevronDown,
  X,
}
