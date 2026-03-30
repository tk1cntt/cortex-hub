# Cortex Agent — Universal task executor with WebSocket connection (Windows PowerShell)
# Works with any IDE: Claude, Codex, Antigravity, Cursor
#
# Usage:
#   .\cortex-agent.ps1 start                          # Auto-detect IDE
#   .\cortex-agent.ps1 start -Name "builder"          # Custom name
#   .\cortex-agent.ps1 start -Engine claude            # Specify engine
#   .\cortex-agent.ps1 start -Engine codex             # Use Codex
#   .\cortex-agent.ps1 start -Url wss://hub.jackle.dev/ws/conductor
#   .\cortex-agent.ps1 stop                            # Stop daemon
#   .\cortex-agent.ps1 status                          # Show status

param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "status", "help")]
    [string]$Command = "help",

    [string]$Name = "",
    [string]$Engine = "",
    [string]$Url = "",
    [string]$ApiKey = "",
    [int]$MaxTurns = 30,
    [switch]$Foreground
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Constants & defaults
# ---------------------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$CortexDir = Join-Path $RepoRoot ".cortex"
$PidFile = Join-Path $CortexDir "agent.pid"
$LogFile = Join-Path $CortexDir "agent.log"
$WsPidFile = Join-Path $CortexDir "agent-ws.pid"
$MaxLogLines = 1000
$ReconnectDelay = 5
$MaxReconnectDelay = 60

# Resolve URL
if (-not $Url) {
    $Url = if ($env:CORTEX_WS_URL) { $env:CORTEX_WS_URL } else { "ws://cortex-api:4000/ws/conductor" }
}

# Resolve API key
if (-not $ApiKey) {
    $ApiKey = $env:HUB_API_KEY
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $Message"
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function Write-Info {
    param([string]$Message)
    Write-Host "[cortex-agent] $Message" -ForegroundColor Blue
    Write-Log "INFO  $Message"
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[cortex-agent] $Message" -ForegroundColor Green
    Write-Log "OK    $Message"
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[cortex-agent] $Message" -ForegroundColor Yellow
    Write-Log "WARN  $Message"
}

function Write-Err {
    param([string]$Message)
    Write-Host "[cortex-agent] $Message" -ForegroundColor Red
    Write-Log "ERROR $Message"
}

function Invoke-LogRotation {
    if (Test-Path $LogFile) {
        $lines = (Get-Content $LogFile).Count
        if ($lines -gt $MaxLogLines) {
            $content = Get-Content $LogFile | Select-Object -Last $MaxLogLines
            Set-Content -Path $LogFile -Value $content
        }
    }
}

function Initialize-CortexDir {
    if (-not (Test-Path $CortexDir)) {
        New-Item -ItemType Directory -Path $CortexDir -Force | Out-Null
    }
}

# ---------------------------------------------------------------------------
# Engine detection
# ---------------------------------------------------------------------------

function Get-Engine {
    if ($Engine) {
        if (-not (Get-Command $Engine -ErrorAction SilentlyContinue)) {
            Write-Err "Specified engine '$Engine' not found in PATH"
            exit 1
        }
        return $Engine
    }

    if (Get-Command "claude" -ErrorAction SilentlyContinue) { return "claude" }
    if (Get-Command "codex" -ErrorAction SilentlyContinue) { return "codex" }
    if (Get-Command "gemini" -ErrorAction SilentlyContinue) { return "gemini" }

    Write-Err "No supported engine found. Install one of: claude, codex, gemini"
    exit 1
}

# ---------------------------------------------------------------------------
# Agent name resolution
# ---------------------------------------------------------------------------

function Get-AgentName {
    if ($Name) { return $Name }

    $identityFile = Join-Path $CortexDir "agent-identity.json"
    if (Test-Path $identityFile) {
        try {
            $identity = Get-Content $identityFile | ConvertFrom-Json
            if ($identity.hostname) { return $identity.hostname }
            if ($identity.name) { return $identity.name }
        } catch {}
    }

    $hostname = $env:COMPUTERNAME
    $eng = Get-Engine
    return "$hostname-$eng"
}

# ---------------------------------------------------------------------------
# WebSocket client Node.js script
# ---------------------------------------------------------------------------

function Get-WsClientScript {
    param(
        [string]$WsUrl,
        [string]$AgentName,
        [string]$TaskFilePath
    )

    $qs = "agentId=$([uri]::EscapeDataString($AgentName))"
    if ($ApiKey) { $qs += "&apiKey=$ApiKey" }
    $fullUrl = "${WsUrl}?${qs}"
    $eng = Get-Engine

    return @"
const WebSocket = require('ws');
const fs = require('fs');
const url = '$fullUrl';
const taskFile = '$($TaskFilePath -replace '\\','\\\\')';

let reconnectDelay = $ReconnectDelay;
const maxDelay = $MaxReconnectDelay;
let alive = true;

process.on('SIGTERM', () => { alive = false; process.exit(0); });
process.on('SIGINT',  () => { alive = false; process.exit(0); });

function connect() {
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('CONNECTED');
    reconnectDelay = $ReconnectDelay;
    ws.send(JSON.stringify({
      type: 'agent.register',
      agentId: '$AgentName',
      engine: '$eng',
      capabilities: ['code', 'review', 'test'],
      timestamp: new Date().toISOString()
    }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'task.assigned') {
        fs.writeFileSync(taskFile, JSON.stringify(msg, null, 2));
        console.log('TASK:' + msg.taskId);
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      } else {
        console.log('MSG:' + msg.type);
      }
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('DISCONNECTED');
    if (alive) {
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
        connect();
      }, reconnectDelay * 1000);
    }
  });

  ws.on('error', (err) => {
    console.error('WS_ERROR:' + err.message);
  });
}

connect();
"@
}

# ---------------------------------------------------------------------------
# Report task completion
# ---------------------------------------------------------------------------

function Send-Completion {
    param(
        [string]$TaskId,
        [string]$Status,
        [string]$Summary,
        [string]$AgentName
    )

    $httpUrl = $Url -replace '^ws://', 'http://' -replace '^wss://', 'https://' -replace '/ws/conductor.*', ''

    $body = @{
        taskId      = $TaskId
        agentId     = $AgentName
        status      = $Status
        summary     = $Summary
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json

    $headers = @{ "Content-Type" = "application/json" }
    if ($ApiKey) { $headers["Authorization"] = "Bearer $ApiKey" }

    try {
        Invoke-RestMethod -Uri "$httpUrl/v1/tasks/$TaskId/complete" -Method Post -Body $body -Headers $headers | Out-Null
    } catch {
        Write-Warn "Failed to report completion for task $TaskId"
    }
}

# ---------------------------------------------------------------------------
# Execute a task
# ---------------------------------------------------------------------------

function Invoke-Task {
    param(
        [string]$EngineCmd,
        [string]$TaskDesc,
        [string]$TaskId,
        [string]$TaskBranch = ""
    )

    Write-Info "Executing task $TaskId with engine=$EngineCmd"

    if ($TaskBranch) {
        Write-Info "Checking out branch: $TaskBranch"
        try {
            git -C $RepoRoot checkout -B $TaskBranch 2>$null
        } catch {
            try { git -C $RepoRoot checkout $TaskBranch 2>$null } catch {
                Write-Warn "Could not checkout branch $TaskBranch"
            }
        }
    }

    $outputFile = Join-Path $env:TEMP "cortex-task-output-$TaskId.txt"
    $exitCode = 0

    try {
        switch ($EngineCmd) {
            "claude" {
                & claude -p $TaskDesc --allowedTools "Edit,Write,Bash,Read,Grep,Glob" --max-turns $MaxTurns *> $outputFile
            }
            "codex" {
                & codex exec $TaskDesc *> $outputFile
            }
            "gemini" {
                & gemini $TaskDesc *> $outputFile
            }
            default {
                Write-Err "Unknown engine: $EngineCmd"
                return $false
            }
        }
    } catch {
        $exitCode = 1
    }

    if ($exitCode -eq 0) {
        Write-Ok "Task $TaskId completed successfully"
        return $true
    } else {
        Write-Warn "Task $TaskId failed"
        return $false
    }
}

# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

function Start-AgentLoop {
    $eng = Get-Engine
    $agentName = Get-AgentName

    Initialize-CortexDir
    Invoke-LogRotation

    Write-Info "Starting Cortex Agent"
    Write-Info "  Engine:  $eng"
    Write-Info "  Name:    $agentName"
    Write-Info "  WS URL:  $Url"
    Write-Info "  PID:     $PID"
    Write-Info "  Log:     $LogFile"

    $PID | Out-File -FilePath $PidFile -NoNewline

    $taskFile = Join-Path $env:TEMP "cortex-task-$PID.json"

    # Start WebSocket client
    Write-Info "Connecting to Hub WebSocket..."
    $wsScript = Get-WsClientScript -WsUrl $Url -AgentName $agentName -TaskFilePath $taskFile
    $wsScriptFile = Join-Path $env:TEMP "cortex-ws-client.js"
    $wsScript | Out-File -FilePath $wsScriptFile -Encoding utf8

    $wsProcess = Start-Process -FilePath "node" -ArgumentList $wsScriptFile -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $CortexDir "ws-stdout.log") -RedirectStandardError (Join-Path $CortexDir "ws-stderr.log")
    $wsProcess.Id | Out-File -FilePath $WsPidFile -NoNewline

    Write-Info "WebSocket client PID: $($wsProcess.Id)"

    try {
        while ($true) {
            # Check WS client is alive
            if ($wsProcess.HasExited) {
                Write-Warn "WebSocket client died, restarting..."
                $wsProcess = Start-Process -FilePath "node" -ArgumentList $wsScriptFile -PassThru -NoNewWindow -RedirectStandardOutput (Join-Path $CortexDir "ws-stdout.log") -RedirectStandardError (Join-Path $CortexDir "ws-stderr.log")
                $wsProcess.Id | Out-File -FilePath $WsPidFile -NoNewline
            }

            # Check for new task
            if (Test-Path $taskFile) {
                $taskJson = Get-Content $taskFile -Raw
                Remove-Item $taskFile -Force

                try {
                    $task = $taskJson | ConvertFrom-Json
                    $taskId = $task.taskId
                    $taskDesc = if ($task.description) { $task.description } else { $task.prompt }
                    $taskBranch = $task.branch

                    if ($taskId -and $taskDesc) {
                        Write-Info "Received task: $taskId"

                        $success = Invoke-Task -EngineCmd $eng -TaskDesc $taskDesc -TaskId $taskId -TaskBranch $taskBranch

                        $status = if ($success) { "completed" } else { "failed" }
                        $outputFile = Join-Path $env:TEMP "cortex-task-output-$taskId.txt"
                        $summary = if (Test-Path $outputFile) {
                            Get-Content $outputFile | Select-Object -Last 50 | Out-String
                        } else { "Task $status" }

                        Send-Completion -TaskId $taskId -Status $status -Summary $summary -AgentName $agentName
                        Invoke-LogRotation
                    } else {
                        Write-Warn "Received malformed task, skipping"
                    }
                } catch {
                    Write-Warn "Failed to parse task: $_"
                }
            }

            Start-Sleep -Seconds 2
        }
    } finally {
        # Cleanup
        Write-Info "Shutting down agent..."
        if (-not $wsProcess.HasExited) {
            Stop-Process -Id $wsProcess.Id -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Remove-Item $WsPidFile -Force -ErrorAction SilentlyContinue
        Remove-Item $taskFile -Force -ErrorAction SilentlyContinue
        Write-Info "Agent stopped"
    }
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

function Start-Agent {
    Initialize-CortexDir

    # Check if already running
    if (Test-Path $PidFile) {
        $existingPid = Get-Content $PidFile
        try {
            Get-Process -Id $existingPid -ErrorAction Stop | Out-Null
            Write-Err "Agent already running (PID $existingPid). Use 'cortex-agent stop' first."
            exit 1
        } catch {
            Write-Warn "Stale PID file found, cleaning up"
            Remove-Item $PidFile -Force
        }
    }

    if ($Foreground) {
        Start-AgentLoop
    } else {
        Write-Info "Starting agent as background job..."
        $argList = @("start", "-Foreground")
        if ($Name) { $argList += @("-Name", $Name) }
        if ($Engine) { $argList += @("-Engine", $Engine) }
        if ($Url -ne "ws://cortex-api:4000/ws/conductor") { $argList += @("-Url", $Url) }
        if ($ApiKey) { $argList += @("-ApiKey", $ApiKey) }

        $proc = Start-Process -FilePath "pwsh" -ArgumentList (@("-File", $MyInvocation.MyCommand.Path) + $argList) -PassThru -NoNewWindow -RedirectStandardOutput $LogFile -RedirectStandardError (Join-Path $CortexDir "agent-error.log")
        $proc.Id | Out-File -FilePath $PidFile -NoNewline
        Write-Ok "Agent started (PID $($proc.Id))"
        Write-Ok "Logs: Get-Content -Wait $LogFile"
    }
}

function Stop-Agent {
    if (-not (Test-Path $PidFile)) {
        Write-Warn "No agent PID file found. Agent may not be running."
        return
    }

    $pid = [int](Get-Content $PidFile)
    try {
        $proc = Get-Process -Id $pid -ErrorAction Stop
        Write-Info "Stopping agent (PID $pid)..."
        Stop-Process -Id $pid -Force
        $proc.WaitForExit(5000)
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Remove-Item $WsPidFile -Force -ErrorAction SilentlyContinue
        Write-Ok "Agent stopped"
    } catch {
        Write-Warn "Agent process $pid not found (stale PID file)"
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Remove-Item $WsPidFile -Force -ErrorAction SilentlyContinue
    }
}

function Show-Status {
    Initialize-CortexDir

    Write-Host "=== Cortex Agent Status ===" -ForegroundColor Blue

    # Agent process
    if (Test-Path $PidFile) {
        $pid = [int](Get-Content $PidFile)
        try {
            Get-Process -Id $pid -ErrorAction Stop | Out-Null
            Write-Host "  Agent:     running (PID $pid)" -ForegroundColor Green
        } catch {
            Write-Host "  Agent:     dead (stale PID $pid)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Agent:     stopped" -ForegroundColor Yellow
    }

    # WebSocket client
    if (Test-Path $WsPidFile) {
        $wsPid = [int](Get-Content $WsPidFile)
        try {
            Get-Process -Id $wsPid -ErrorAction Stop | Out-Null
            Write-Host "  WebSocket: connected (PID $wsPid)" -ForegroundColor Green
        } catch {
            Write-Host "  WebSocket: disconnected" -ForegroundColor Red
        }
    } else {
        Write-Host "  WebSocket: not started" -ForegroundColor Yellow
    }

    # Engine
    $eng = try { Get-Engine } catch { "none" }
    Write-Host "  Engine:    $eng"

    # Name
    $agentName = try { Get-AgentName } catch { "unknown" }
    Write-Host "  Name:      $agentName"

    # URL
    Write-Host "  WS URL:    $Url"

    # Log
    if (Test-Path $LogFile) {
        $logLines = (Get-Content $LogFile).Count
        Write-Host "  Log:       $LogFile ($logLines lines)"
        Write-Host ""
        Write-Host "--- Last 5 log entries ---" -ForegroundColor Blue
        Get-Content $LogFile | Select-Object -Last 5
    }
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

switch ($Command) {
    "start"  { Start-Agent }
    "stop"   { Stop-Agent }
    "status" { Show-Status }
    "help" {
        Write-Host "Cortex Agent - Universal task executor with WebSocket connection"
        Write-Host ""
        Write-Host "Usage:"
        Write-Host "  .\cortex-agent.ps1 start   [options]   Start the agent daemon"
        Write-Host "  .\cortex-agent.ps1 stop                Stop the agent daemon"
        Write-Host "  .\cortex-agent.ps1 status              Show agent status"
        Write-Host ""
        Write-Host "Options:"
        Write-Host "  -Name <name>        Agent name (default: auto-detect)"
        Write-Host "  -Engine <engine>    Engine: claude, codex, gemini (default: auto-detect)"
        Write-Host "  -Url <ws-url>       WebSocket URL (default: ws://cortex-api:4000/ws/conductor)"
        Write-Host "  -ApiKey <key>       Hub API key (or set HUB_API_KEY env var)"
        Write-Host "  -MaxTurns <n>       Max turns for claude engine (default: 30)"
        Write-Host "  -Foreground         Run in foreground (don't daemonize)"
    }
}
