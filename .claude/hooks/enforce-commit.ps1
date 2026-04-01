$ProjectDir = if ($env:CLAUDE_PROJECT_DIR) { $env:CLAUDE_PROJECT_DIR } else { "." }
$StateDir = Join-Path $ProjectDir ".cortex\.session-state"

$InputData = [Console]::In.ReadToEnd()
if (-not [string]::IsNullOrWhiteSpace($InputData)) {
    try {
        $json = $InputData | ConvertFrom-Json
        $Command = $json.tool_input.command

        if ($Command -notmatch "^git (commit|push)") {
            exit 0
        }

        if ($Command -match "^git commit") {
            $missing = @()
            if (-not (Test-Path (Join-Path $StateDir "session-started")))       { $missing += "  - cortex_session_start (not called)" }
            if (-not (Test-Path (Join-Path $StateDir "discovery-used")))        { $missing += "  - cortex discovery tools (0 calls - must search before editing)" }
            if (-not (Test-Path (Join-Path $StateDir "quality-gates-passed")))  { $missing += "  - Quality gates: run build/typecheck/lint then call cortex_quality_report" }

            if ($missing.Count -gt 0) {
                [Console]::Error.WriteLine("BLOCKED: Cannot commit - missing Cortex workflow steps:")
                foreach ($m in $missing) { [Console]::Error.WriteLine($m) }
                [Console]::Error.WriteLine("")
                [Console]::Error.WriteLine("Run /cs to complete session init, then /ce before committing.")
                exit 2
            }
        }

        if ($Command -match "^git push") {
            [Console]::Error.WriteLine("REMINDER: After push, call cortex_code_reindex to update code intelligence.")
        }
    } catch {}
}
exit 0
