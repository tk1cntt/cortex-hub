# Cortex Hub — Remote Agent Launcher (Windows)
# Launch a Claude Code agent connected to Cortex Hub without cloning the repo.
#
# Usage:
#   iwr -useb "https://raw.githubusercontent.com/lktiep/cortex-hub/master/scripts/run-agent.ps1" -OutFile $env:TEMP\run-agent.ps1; & $env:TEMP\run-agent.ps1
#   .\run-agent.ps1 -Key "YOUR_API_KEY"
#   .\run-agent.ps1 -Key "abc" -Agent "win-builder" -Task "Build Godot for Windows"

[CmdletBinding()]
param(
    [string]$Key = $env:HUB_API_KEY,
    [string]$Url = $(if ($env:HUB_MCP_URL) { $env:HUB_MCP_URL } else { "https://cortex-mcp.jackle.dev/mcp" }),
    [string]$Agent = "",
    [string]$Task = "",
    [decimal]$Budget = 5.00,
    [int]$Turns = 50,
    [switch]$Interactive,
    [switch]$SkipPerms
)

$ErrorActionPreference = "Stop"

function Write-Info  { param([string]$msg) Write-Host "[cortex] $msg" -ForegroundColor Blue }
function Write-Ok    { param([string]$msg) Write-Host "[cortex] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "[cortex] $msg" -ForegroundColor Yellow }
function Write-Err   { param([string]$msg) Write-Host "[cortex] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  Cortex Hub - Remote Agent" -ForegroundColor Cyan
Write-Host "  Launch a Claude Code agent connected to Cortex Hub."
Write-Host "  No repo clone needed."
Write-Host ""

# ── Check prerequisites ──
$claudePath = Get-Command claude -ErrorAction SilentlyContinue
if (-not $claudePath) {
    Write-Err "Claude Code CLI not found. Install: npm install -g @anthropic-ai/claude-code"
    exit 1
}
Write-Ok "Claude Code CLI found: $($claudePath.Source)"

# ── Auto-detect Hub API key from existing IDE configs ──
if (-not $Key) {
    Write-Info "Detecting Cortex Hub API key from IDE configs..."
    $configPaths = @(
        "$env:USERPROFILE\.claude.json",
        "$env:USERPROFILE\.cursor\mcp.json",
        "$env:USERPROFILE\.codeium\windsurf\mcp_config.json",
        "$env:USERPROFILE\.gemini\antigravity\mcp_config.json"
    )
    foreach ($cfg in $configPaths) {
        if (-not (Test-Path $cfg)) { continue }
        try {
            $config = Get-Content $cfg -Raw | ConvertFrom-Json
            $servers = if ($config.mcpServers) { $config.mcpServers } elseif ($config.servers) { $config.servers } else { $null }
            if ($servers -and $servers.'cortex-hub') {
                $auth = $servers.'cortex-hub'.env.AUTH_HEADER
                if ($auth -and $auth.StartsWith("Bearer ")) { $auth = $auth.Substring(7) }
                if ($auth) {
                    $Key = $auth
                    Write-Ok "Found Hub API key in $cfg"
                    break
                }
            }
        } catch { }
    }
}

if (-not $Key) {
    $Key = Read-Host "Cortex Hub API Key (from Dashboard -> Keys)"
    if (-not $Key) {
        Write-Err "Hub API key required. Get one from Hub Dashboard -> Keys."
        exit 1
    }
}

if (-not $Agent) {
    $defaultAgent = "$($env:COMPUTERNAME.ToLower())-agent"
    $input = Read-Host "Agent name [$defaultAgent]"
    $Agent = if ($input) { $input } else { $defaultAgent }
}

if (-not $Task -and -not $Interactive) {
    Write-Host ""
    Write-Host "  Mode:" -ForegroundColor Cyan
    Write-Host "  1) Interactive - chat with Cortex tools available"
    Write-Host "  2) Task - run a specific task then exit"
    $modeChoice = Read-Host "Select [1]"
    if ($modeChoice -eq "2") {
        $Task = Read-Host "Task description"
    } else {
        $Interactive = $true
    }
}

# ── Create temp workspace ──
$workDir = Join-Path $env:TEMP "cortex-agent-$(Get-Random)"
New-Item -ItemType Directory -Path $workDir -Force | Out-Null
Write-Info "Workspace: $workDir"

try {
    # ── Download CLAUDE.md ──
    Write-Info "Downloading agent instructions..."
    $claudeMd = Join-Path $workDir "CLAUDE.md"
    $instrUrl = "https://raw.githubusercontent.com/lktiep/cortex-hub/master/templates/remote-agent-instructions.md"
    try {
        Invoke-WebRequest -Uri $instrUrl -OutFile $claudeMd -UseBasicParsing -ErrorAction Stop
        Write-Ok "Instructions downloaded"
    } catch {
        Write-Warn "Could not download instructions, using built-in defaults"
        @"
# Cortex Agent

At the START of every conversation, call ``cortex_session_start`` with the repo URL and agentId.
Use cortex tools (memory_search, knowledge_search, code_search) before grep/find.
When done, call ``cortex_session_end`` with a summary.
"@ | Set-Content $claudeMd -Encoding UTF8
    }

    # ── Generate MCP config ──
    Write-Info "Configuring MCP connection..."
    $mcpConfig = Join-Path $workDir "mcp.json"
    @{
        mcpServers = @{
            'cortex-hub' = @{
                command = 'npx'
                args    = @('-y', 'mcp-remote', $Url, '--header', 'Authorization:${AUTH_HEADER}')
                env     = @{ AUTH_HEADER = "Bearer $Key" }
            }
        }
    } | ConvertTo-Json -Depth 10 | Set-Content $mcpConfig -Encoding UTF8
    Write-Ok "MCP config ready -> $mcpConfig"

    # ── Build args ──
    $claudeArgs = @(
        '--mcp-config', $mcpConfig,
        '--append-system-prompt-file', $claudeMd,
        '--max-turns', "$Turns"
    )

    if ($SkipPerms) {
        $claudeArgs += '--dangerously-skip-permissions'
    } else {
        $claudeArgs += @('--allowedTools', 'Read,Glob,Grep,Bash,Edit,Write,mcp__cortex-hub__*')
    }

    # ── Launch ──
    Write-Host ""
    Write-Host "  Launching agent: $Agent" -ForegroundColor Green
    Write-Host "  Hub: $Url"
    Write-Host "  Budget: `$$Budget  |  Max turns: $Turns"
    Write-Host ""

    if ($Task) {
        Write-Info "Running task: $Task"
        $prompt = "You are Cortex agent '$Agent'. Call cortex_session_start(repo: `"local`", mode: `"development`", agentId: `"$Agent`") first, then execute this task:`n`n$Task`n`nWhen done, call cortex_session_end with a summary."

        & claude @claudeArgs --max-budget-usd "$Budget" -p $prompt
    } else {
        Write-Info "Starting interactive session. Type your requests, Cortex tools are available."
        $claudeArgs += @('--append-system-prompt', "You are Cortex agent '$Agent'. Call cortex_session_start(repo: `"local`", mode: `"development`", agentId: `"$Agent`") at the start of each session.")

        & claude @claudeArgs
    }

    Write-Ok "Agent session ended."
} finally {
    # Cleanup
    Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue
}
