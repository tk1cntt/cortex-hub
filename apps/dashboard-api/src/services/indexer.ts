import { spawn, exec, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, extname } from 'path'
import { request as httpRequest } from 'node:http'
import { createConnection } from 'node:net'
import { db } from '../db/client.js'
import { createLogger } from '@cortex/shared-utils'

const logger = createLogger('indexer')

const GITNEXUS_CONTAINER = 'cortex-gitnexus'
const DOCKER_SOCK = '/var/run/docker.sock'

/**
 * Make an HTTP request to Docker API via Unix socket.
 */
function dockerApiRequest(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Docker API request timeout')), 30000)

    const options = {
      socketPath: DOCKER_SOCK,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    }

    const req = httpRequest(options, (res) => {
      let data = ''
      res.on('data', (chunk: Buffer) => { data += chunk.toString() })
      res.on('end', () => {
        clearTimeout(timer)
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve({ _raw: data.trim() })
        }
      })
    })

    req.on('error', (err) => { clearTimeout(timer); reject(err) })

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

/**
 * Execute a command inside a container via Docker socket HTTP API.
 * Works without the docker CLI binary — talks directly to the Unix socket.
 */
async function dockerExec(container: string, cmd: string, timeoutMs = 180000): Promise<{ stdout: string; exitCode: number }> {
  // Step 1: Create exec instance
  const execInfo = await dockerApiRequest('POST', `/containers/${container}/exec`, {
    AttachStdout: true,
    AttachStderr: true,
    Cmd: ['bash', '-c', cmd],
  })

  const execId = (execInfo as Record<string, string>).Id
  if (!execId) throw new Error('No exec ID returned from Docker API')

  // Step 2: Start exec instance and capture output
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`docker exec timed out (${timeoutMs}ms)`)), timeoutMs)

    const sock = createConnection(DOCKER_SOCK)
    sock.on('connect', () => {
      const startBody = JSON.stringify({ Detach: false, Tty: false })
      const startReq =
        `POST /exec/${execId}/start HTTP/1.1\r\n` +
        `Host: localhost\r\nContent-Type: application/json\r\n` +
        `Content-Length: ${Buffer.byteLength(startBody)}\r\n` +
        `Connection: close\r\n\r\n` +
        startBody
      sock.write(startReq)
    })

    let outChunks: Buffer[] = []
    sock.on('data', (chunk: Buffer) => { outChunks.push(chunk) })
    sock.on('end', () => {
      clearTimeout(timer)
      sock.destroy()
      const rawBuffer = Buffer.concat(outChunks)
      const cleanOutput = demuxDockerStream(rawBuffer)
      resolve({ stdout: cleanOutput, exitCode: 0 })
    })
    sock.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

/**
 * Strip Docker multiplexing headers (8-byte chunks: [stream_type(1)][3 padding][size(4)])
 * and ANSI escape codes from the output.
 */
function demuxDockerStream(raw: Buffer): string {
  // Find HTTP body after headers
  const headerMarker = Buffer.from('\r\n\r\n')
  let bodyStart = raw.indexOf(headerMarker)
  let body: Buffer
  if (bodyStart === -1) {
    body = raw
  } else {
    body = raw.slice(bodyStart + 4)
  }

  // Check if multiplexing is used
  if (body.length < 8) return body.toString('utf-8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  if (body[0] !== 1 && body[0] !== 2) {
    return body.toString('utf-8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
  }

  // Parse multiplexed stream
  let result = Buffer.alloc(0)
  let pos = 0
  while (pos + 8 <= body.length) {
    const type = body[pos] ?? 0
    const b4 = body[pos + 4] ?? 0
    const b5 = body[pos + 5] ?? 0
    const b6 = body[pos + 6] ?? 0
    const b7 = body[pos + 7] ?? 0
    const size = (b4 << 24) | (b5 << 16) | (b6 << 8) | b7
    if (size <= 0 || pos + 8 + size > body.length) break
    if (type === 1 || type === 2) {
      result = Buffer.concat([result, body.slice(pos + 8, pos + 8 + size)])
    }
    pos += 8 + size
  }

  // Strip ANSI escape codes
  return (result.length > 0 ? result : body).toString('utf-8').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}
import { embedProject } from './mem9-embedder.js'
import { buildKnowledgeFromDocs } from './docs-knowledge-builder.js'

// Track running processes for cancellation
const runningJobs = new Map<string, ChildProcess>()

const REPOS_DIR = process.env.REPOS_DIR ?? '/app/data/repos'

interface ProjectRow {
  id: string
  git_repo_url: string | null
  git_provider: string | null
  git_username: string | null
  git_token: string | null
}

/**
 * Build authenticated git URL for private repos.
 * Supports: https://user:token@host/path.git
 */
export function buildAuthUrl(url: string, username?: string | null, token?: string | null): string {
  if (!token) return url

  try {
    const parsed = new URL(url)
    if (username) {
      parsed.username = encodeURIComponent(username)
    }
    parsed.password = encodeURIComponent(token)
    return parsed.toString()
  } catch {
    // For non-standard URLs (e.g., SSH), return as-is
    return url
  }
}

/**
 * Update job status in the database.
 */
function updateJob(jobId: string, updates: Record<string, unknown>) {
  const setClauses = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(', ')
  const values = Object.values(updates)

  db.prepare(`UPDATE index_jobs SET ${setClauses} WHERE id = ?`).run(...values, jobId)
}

/**
 * Append to job log.
 */
function appendLog(jobId: string, text: string) {
  const current = db.prepare('SELECT log FROM index_jobs WHERE id = ?').get(jobId) as { log: string | null } | undefined
  const newLog = (current?.log ?? '') + text + '\n'
  // Keep last 10KB of logs
  const trimmed = newLog.length > 10240 ? newLog.slice(-10240) : newLog
  db.prepare('UPDATE index_jobs SET log = ? WHERE id = ?').run(trimmed, jobId)
}

// ── Symbol extraction patterns per language ──
const SYMBOL_PATTERNS: Record<string, RegExp[]> = {
  // TypeScript / JavaScript
  '.ts':  [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, /(?:export\s+)?class\s+(\w+)/g, /(?:export\s+)?interface\s+(\w+)/g, /(?:export\s+)?type\s+(\w+)\s*=/g, /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g, /(?:export\s+)?enum\s+(\w+)/g],
  '.tsx': [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, /(?:export\s+)?class\s+(\w+)/g, /(?:export\s+)?interface\s+(\w+)/g, /(?:export\s+)?type\s+(\w+)\s*=/g, /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g],
  '.js':  [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, /(?:export\s+)?class\s+(\w+)/g, /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g],
  '.jsx': [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, /(?:export\s+)?class\s+(\w+)/g, /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g],
  // Python
  '.py':  [/^(?:async\s+)?def\s+(\w+)/gm, /^class\s+(\w+)/gm],
  // Go
  '.go':  [/^func\s+(?:\([^)]+\)\s+)?(\w+)/gm, /^type\s+(\w+)\s+(?:struct|interface)/gm],
  // Rust
  '.rs':  [/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm, /^(?:pub\s+)?struct\s+(\w+)/gm, /^(?:pub\s+)?enum\s+(\w+)/gm, /^(?:pub\s+)?trait\s+(\w+)/gm, /^(?:pub\s+)?type\s+(\w+)/gm],
  // Java / Kotlin
  '.java': [/(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+(\w+)/g, /(?:public|private|protected)\s+\w+\s+(\w+)\s*\(/g],
  '.kt':   [/(?:fun|class|interface|object|enum\s+class)\s+(\w+)/g],
  // Ruby
  '.rb':  [/^(?:\s*)def\s+(\w+)/gm, /^(?:\s*)class\s+(\w+)/gm, /^(?:\s*)module\s+(\w+)/gm],
  // PHP
  '.php': [/function\s+(\w+)/g, /class\s+(\w+)/g, /interface\s+(\w+)/g],
  // Vue / Svelte (extract script sections)
  '.vue': [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, /(?:const|let|var)\s+(\w+)\s*=/g],
  '.svelte': [/(?:export\s+)?(?:async\s+)?function\s+(\w+)/g, /(?:const|let|var)\s+(\w+)\s*=/g],
  // SQL
  '.sql': [/CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW|FUNCTION|PROCEDURE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/gi],
  // CSS
  '.css': [/\.([a-zA-Z][\w-]+)\s*\{/g],
  // C# (.NET)
  '.cs': [/(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:class|interface|struct|enum|record)\s+(\w+)/g, /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/g],
  // Swift
  '.swift': [/(?:public\s+|private\s+|internal\s+|open\s+)?(?:class|struct|enum|protocol|func)\s+(\w+)/g],
  // Dart
  '.dart': [/(?:class|mixin|extension|enum)\s+(\w+)/g, /(?:Future|void|int|String|bool|double|dynamic)\s+(\w+)\s*\(/g],
  // Scala
  '.scala': [/(?:class|object|trait|def)\s+(\w+)/g],
  // Elixir
  '.ex':  [/def(?:p)?\s+(\w+)/g, /defmodule\s+([\w.]+)/g],
  '.exs': [/def(?:p)?\s+(\w+)/g, /defmodule\s+([\w.]+)/g],
  // Lua
  '.lua': [/function\s+(?:[\w.:]*)(\w+)/g, /local\s+function\s+(\w+)/g],
  // R
  '.r': [/(\w+)\s*<-\s*function/gi],
  // C / C++
  '.c':   [/^\w[\w\s*]+\s+(\w+)\s*\([^)]*\)\s*\{/gm, /^(?:typedef\s+)?struct\s+(\w+)/gm],
  '.h':   [/^\w[\w\s*]+\s+(\w+)\s*\([^)]*\)/gm, /^(?:typedef\s+)?struct\s+(\w+)/gm],
  '.cpp': [/^\w[\w\s*:]+\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{/gm, /^class\s+(\w+)/gm],
  '.hpp': [/^class\s+(\w+)/gm, /^\w[\w\s*:]+\s+(\w+)\s*\([^)]*\)/gm],
  // Objective-C
  '.m':   [/@(?:interface|implementation|protocol)\s+(\w+)/g, /^[-+]\s*\([^)]+\)\s*(\w+)/gm],
  // Shell
  '.sh':  [/^(\w+)\s*\(\)/gm, /^function\s+(\w+)/gm],
  // Perl
  '.pl':  [/^sub\s+(\w+)/gm, /^package\s+(\w+)/gm],
  '.pm':  [/^sub\s+(\w+)/gm, /^package\s+(\w+)/gm],
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.turbo', 'coverage', '.cache', 'vendor', '.pnpm-store', 'bin', 'obj', 'packages', '.vs', '.idea'])
const SOURCE_EXTENSIONS = new Set(Object.keys(SYMBOL_PATTERNS))
// Count ALL source/config files for total file count (broader than symbol extraction)
const ALL_SOURCE_EXTENSIONS = new Set([
  ...SOURCE_EXTENSIONS,
  '.md', '.json', '.yaml', '.yml', '.html', '.toml', '.env', '.sh', '.bash',
  '.xml', '.graphql', '.gql', '.proto', '.dockerfile', '.tf', '.hcl',
  '.svelte', '.astro', '.mdx', '.prisma', '.lock', '.conf', '.cfg', '.ini',
  '.csproj', '.sln', '.xaml', '.resx', '.props', '.targets', '.fsproj', '.vbproj',
  '.gradle', '.pom', '.cmake', '.makefile', '.mk',
  '.plist', '.storyboard', '.xib', '.pbxproj',
  '.txt', '.rst', '.adoc', '.csv', '.tsv',
])
const MAX_FILE_SIZE = 512 * 1024 // 512KB

/**
 * Walk directory recursively and extract symbols from source files.
 * Pure JS — no native dependencies.
 */
function extractSymbolsFromDir(dir: string): { totalFiles: number; symbolsFound: number; symbolNames: string[] } {
  let totalFiles = 0
  const allSymbols: string[] = []

  function walk(currentDir: string) {
    let entries: string[]
    try {
      entries = readdirSync(currentDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue

      const fullPath = join(currentDir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isDirectory()) {
        walk(fullPath)
      } else if (stat.isFile()) {
        const ext = extname(entry).toLowerCase()
        if (!ALL_SOURCE_EXTENSIONS.has(ext)) continue
        if (stat.size > MAX_FILE_SIZE) continue

        totalFiles++

        // Only extract symbols from code files (not config/docs)
        const patterns = SYMBOL_PATTERNS[ext]
        if (!patterns) continue

        try {
          const content = readFileSync(fullPath, 'utf-8')
          for (const pattern of patterns) {
            const regex = new RegExp(pattern.source, pattern.flags)
            let match
            while ((match = regex.exec(content)) !== null) {
              const name = match[1]
              if (name && name.length > 1 && !name.startsWith('_')) {
                allSymbols.push(name)
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(dir)
  return { totalFiles, symbolsFound: allSymbols.length, symbolNames: allSymbols }
}

/**
 * Run a shell command and return a promise.
 */
function runCommand(cmd: string, args: string[], cwd: string, jobId: string): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, PATH: process.env.PATH } })
    runningJobs.set(jobId, child)

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      stdout += text
      appendLog(jobId, text.trim())
    })

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      stderr += text
      appendLog(jobId, `[stderr] ${text.trim()}`)
    })

    child.on('close', (code) => {
      runningJobs.delete(jobId)
      resolve({ stdout: stdout + stderr, code: code ?? 0 })
    })

    child.on('error', (err) => {
      runningJobs.delete(jobId)
      reject(err)
    })
  })
}

/**
 * Main indexing pipeline — runs async (fire-and-forget from API).
 */
export async function startIndexing(projectId: string, jobId: string, branch: string): Promise<void> {
  const project = db.prepare('SELECT id, git_repo_url, git_provider, git_username, git_token FROM projects WHERE id = ?')
    .get(projectId) as ProjectRow | undefined

  if (!project?.git_repo_url) {
    updateJob(jobId, { status: 'error', error: 'Project has no git repository URL', completed_at: new Date().toISOString() })
    return
  }

  const repoDir = join(REPOS_DIR, projectId)

  try {
    // ── Step 1: Clone ──
    updateJob(jobId, { status: 'cloning', progress: 5, started_at: new Date().toISOString() })
    logger.info(`[${jobId}] Cloning ${project.git_repo_url} branch=${branch}`)

    // Clean previous clone
    if (existsSync(repoDir)) {
      rmSync(repoDir, { recursive: true, force: true })
    }
    mkdirSync(repoDir, { recursive: true })

    const authUrl = buildAuthUrl(project.git_repo_url, project.git_username, project.git_token)
    const cloneResult = await runCommand('git', [
      'clone', '--branch', branch, '--depth', '1', '--single-branch', authUrl, '.'
    ], repoDir, jobId)

    if (cloneResult.code !== 0) {
      updateJob(jobId, { status: 'error', error: `git clone failed (exit ${cloneResult.code})`, progress: 5, completed_at: new Date().toISOString() })
      return
    }

    updateJob(jobId, { progress: 25 })
    logger.info(`[${jobId}] Clone complete`)

    // ── Step 1b: Extract commit info from HEAD ──
    try {
      const { execFileSync } = await import('child_process')
      const commitHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim()
      const commitMessage = execFileSync('git', ['log', '-1', '--format=%s'], {
        cwd: repoDir, encoding: 'utf-8', timeout: 5000,
      }).trim()
      updateJob(jobId, { commit_hash: commitHash, commit_message: commitMessage.slice(0, 200) })
      appendLog(jobId, `📌 Commit: ${commitHash} — ${commitMessage.slice(0, 100)}`)
      logger.info(`[${jobId}] HEAD commit: ${commitHash} — ${commitMessage.slice(0, 60)}`)
    } catch {
      // Non-fatal — commit info is nice-to-have
      logger.warn(`[${jobId}] Could not extract commit info`)
    }

    // ── Step 2: GitNexus Analyze ──
    // Try in order: local CLI → docker exec into gitnexus container → pure JS fallback.
    updateJob(jobId, { status: 'analyzing', progress: 30 })
    logger.info(`[${jobId}] Running gitnexus analyze`)

    let symbolsFound = 0
    let totalFiles = 0
    let symbolNames: string[] = []

    // Strategy 1: Try local CLI (fast, uses Tree-sitter AST)
    let gitnexusSuccess = false
    try {
      const analyzeResult = await runCommand('gitnexus', [
        'analyze', '.', '--force', '--embeddings'
      ], repoDir, jobId)

      const symbolMatch = analyzeResult.stdout.match(/(\d+)\s*symbols?/i)
      const fileMatch = analyzeResult.stdout.match(/(\d+)\s*files?/i)
      if (symbolMatch?.[1]) symbolsFound = parseInt(symbolMatch[1], 10)
      if (fileMatch?.[1]) totalFiles = parseInt(fileMatch[1], 10)

      if (analyzeResult.code === 0 && (symbolsFound > 0 || totalFiles > 0)) {
        gitnexusSuccess = true
        appendLog(jobId, `GitNexus: ${totalFiles} files, ${symbolsFound} symbols`)
      }
    } catch {
      // gitnexus not installed locally — expected in cortex-api container
    }

    // Strategy 2: Docker exec into gitnexus container via Docker socket HTTP API
    if (!gitnexusSuccess) {
      try {
        appendLog(jobId, 'Calling GitNexus container via Docker socket...')
        logger.info(`[${jobId}] Trying docker exec into gitnexus container`)

        const dockerResult = await dockerExec(
          GITNEXUS_CONTAINER,
          `cd ${repoDir} && gitnexus analyze --force --embeddings 2>&1`,
          180000,
        )

        appendLog(jobId, `Docker exec output (first 500 chars): ${dockerResult.stdout.slice(0, 500)}`)

        // Parse GitNexus output — try multiple patterns
        // Pattern 1: "X symbols, Y files" (old format)
        const symbolMatch = dockerResult.stdout.match(/(\d+)\s*symbols?/i)
        const fileMatch = dockerResult.stdout.match(/(\d+)\s*files?/i)

        // Pattern 2: "X nodes | Y edges" (new GitNexus format)
        const nodesMatch = dockerResult.stdout.match(/([\d,]+)\s*nodes/i)
        const edgesMatch = dockerResult.stdout.match(/([\d,]+)\s*edges/i)

        // Pattern 3: "indexed successfully (85.9s)" — check for success indicator
        const successMatch = dockerResult.stdout.match(/indexed successfully/i)

        if (symbolMatch?.[1]) symbolsFound = parseInt(symbolMatch[1], 10)
        if (fileMatch?.[1]) totalFiles = parseInt(fileMatch[1], 10)

        // Fallback to nodes/edges count
        if (!symbolsFound && nodesMatch?.[1]) {
          symbolsFound = parseInt(nodesMatch[1].replace(/,/g, ''), 10)
        }
        if (!totalFiles && edgesMatch?.[1]) {
          totalFiles = parseInt(edgesMatch[1].replace(/,/g, ''), 10)
        }

        if (successMatch && (symbolsFound > 0 || totalFiles > 0)) {
          gitnexusSuccess = true
          appendLog(jobId, `GitNexus (docker): ${totalFiles} edges, ${symbolsFound} nodes`)
          logger.info(`[${jobId}] GitNexus docker analyze: ${totalFiles} edges, ${symbolsFound} nodes`)
        } else if (successMatch) {
          // Success but couldn't parse symbols — trust GitNexus completed
          gitnexusSuccess = true
          appendLog(jobId, 'GitNexus (docker): indexed successfully (symbol count not in output)')
          logger.info(`[${jobId}] GitNexus docker analyze completed (symbols unknown)`)
        } else {
          appendLog(jobId, `[warn] Docker exec returned no success marker. Output: ${dockerResult.stdout.slice(0, 300)}`)
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        logger.error(`[${jobId}] Docker exec analyze failed: ${errMsg}`)
        appendLog(jobId, `[warn] Docker exec failed: ${errMsg.slice(0, 300)}`)
      }
    }

    // Strategy 3: Pure JS fallback (regex-based, no native deps)
    if (!gitnexusSuccess) {
      appendLog(jobId, `[info] Using pure JS symbol extraction (gitnexus CLI not available)`)
      logger.info(`[${jobId}] Using pure JS fallback extraction`)

      const fallback = extractSymbolsFromDir(repoDir)
      totalFiles = fallback.totalFiles
      symbolsFound = fallback.symbolsFound
      symbolNames = fallback.symbolNames
      appendLog(jobId, `Extracted: ${totalFiles} files, ${symbolsFound} symbols`)
    }

    if (symbolNames.length > 0) {
      appendLog(jobId, `Sample symbols: ${symbolNames.slice(0, 20).join(', ')}`)
    }

    updateJob(jobId, { progress: 70, symbols_found: symbolsFound, total_files: totalFiles })
    logger.info(`[${jobId}] Analysis complete: ${symbolsFound} symbols, ${totalFiles} files`)

    updateJob(jobId, { progress: 90 })

    // ── Step 4: Update Project ──
    db.prepare(
      `UPDATE projects SET indexed_at = datetime('now'), indexed_symbols = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(symbolsFound, projectId)

    updateJob(jobId, {
      status: 'done',
      progress: 100,
      completed_at: new Date().toISOString()
    })

    logger.info(`[${jobId}] Indexing complete!`)

    // ── Step 5: Auto-trigger mem9 embedding (controlled by MEM9_EMBEDDING_ENABLED) ──
    // Default: enabled in production, disabled in dev/test.
    // Override explicitly with MEM9_EMBEDDING_ENABLED=true/false.
    const mem9Enabled = process.env.MEM9_EMBEDDING_ENABLED === undefined
      ? process.env.NODE_ENV === 'production'
      : process.env.MEM9_EMBEDDING_ENABLED === 'true'

    if (!mem9Enabled) {
      logger.info(`[${jobId}] Skipping mem9 embedding (MEM9_EMBEDDING_ENABLED=${process.env.MEM9_EMBEDDING_ENABLED || 'undefined'}, NODE_ENV=${process.env.NODE_ENV || 'undefined'}). Embedding costs money — enable when needed.`)
      appendLog(jobId, '⏭️ Skipped mem9 embedding. Enable via MEM9_EMBEDDING_ENABLED=true or run manually: POST /api/indexing/:id/index/mem9')
      updateJob(jobId, { mem9_status: 'skipped' })
    } else {
      try {
        updateJob(jobId, { mem9_status: 'embedding' })
        appendLog(jobId, '🧠 Auto-starting mem9 embedding...')

        embedProject(projectId, branch, jobId, (progress, chunks, totalChunks) => {
          db.prepare('UPDATE index_jobs SET mem9_chunks = ?, mem9_progress = ?, mem9_total_chunks = ? WHERE id = ?')
            .run(chunks, progress, totalChunks, jobId)
        }).then((result) => {
          updateJob(jobId, { mem9_status: result.status, mem9_chunks: result.chunks })
          appendLog(jobId, `✅ mem9 done: ${result.chunks} chunks embedded`)
          if (result.errors.length > 0) {
            appendLog(jobId, `⚠️ mem9 errors: ${result.errors.slice(0, 3).join('; ')}`)
          }
          logger.info(`[${jobId}] mem9 complete: ${result.chunks} chunks`)

          // ── Step 6: Auto-build knowledge from docs (fire-and-forget) ──
          updateJob(jobId, { docs_knowledge_status: 'building' })
          appendLog(jobId, '📚 Auto-building knowledge from documentation...')
          buildKnowledgeFromDocs(projectId, jobId, repoDir).then((docsResult) => {
            updateJob(jobId, {
              docs_knowledge_status: 'done',
              docs_knowledge_count: docsResult.docsProcessed,
            })
            appendLog(jobId, `📚 Docs knowledge: ${docsResult.docsProcessed}/${docsResult.docsFound} docs → ${docsResult.chunksCreated} chunks`)
            logger.info(`[${jobId}] Docs knowledge complete: ${docsResult.docsProcessed} docs processed`)
          }).catch((err) => {
            updateJob(jobId, { docs_knowledge_status: 'error' })
            appendLog(jobId, `⚠️ Docs knowledge failed (non-fatal): ${err}`)
            logger.warn(`[${jobId}] Docs knowledge failed: ${err}`)
          })
        }).catch((err) => {
          updateJob(jobId, { mem9_status: 'error' })
          appendLog(jobId, `❌ mem9 failed: ${err}`)
          logger.warn(`[${jobId}] mem9 failed (non-fatal): ${err}`)
        })
      } catch (err) {
        logger.warn(`[${jobId}] mem9 auto-trigger failed: ${err}`)
      }
    }

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error(`[${jobId}] Indexing failed: ${errorMsg}`)
    updateJob(jobId, {
      status: 'error',
      error: errorMsg,
      completed_at: new Date().toISOString()
    })
  }
}

/**
 * Cancel a running indexing job.
 */
export function cancelJob(jobId: string): boolean {
  const child = runningJobs.get(jobId)
  if (child) {
    child.kill('SIGTERM')
    runningJobs.delete(jobId)
    updateJob(jobId, {
      status: 'error',
      error: 'Cancelled by user',
      completed_at: new Date().toISOString()
    })
    return true
  }
  return false
}
