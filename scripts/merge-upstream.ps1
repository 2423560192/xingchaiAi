<#
.SYNOPSIS
    Merge upstream new-api into the dev branch (standard upstream sync).

.DESCRIPTION
    Standard release flow (upstream main -> dev -> verify -> test -> deploy):
      1. scripts\merge-upstream.ps1          # merge upstream into dev, auto-resolve i18n conflicts
      2. verify (server go build / production-DB-copy smoke test / local web build)
      3. git checkout test; git merge --ff-only dev; git push origin test
      4. scripts\deploy.ps1 -Version vX.Y.Z  # deploy from test (production branch)

.PARAMETER Upstream
    Upstream ref, default origin/main (gitea's main mirrors the GitHub upstream).

.PARAMETER Target
    Merge target branch, default dev.

.PARAMETER NoPush
    Merge locally only, do not push.

.EXAMPLE
    pwsh -File scripts\merge-upstream.ps1
#>
param(
    [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$Upstream = 'origin/main',
    [string]$Target = 'dev',
    [switch]$NoPush
)

$ErrorActionPreference = 'Continue'
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Log([string]$Message) {
    Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}
function Fail([string]$Message) { throw $Message }

if (-not (Test-Path (Join-Path $Repo '.git'))) { Fail "Not a git repo: $Repo" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "node is required to auto-resolve i18n JSON conflicts"
}
$resolver = Join-Path $Repo 'scripts\merge-i18n-json.js'
if (-not (Test-Path $resolver)) { Fail "Missing scripts/merge-i18n-json.js" }

# ---------------------------------------------------------------- clean tree
$dirty = @(& git -C $Repo status --porcelain)
if ($LASTEXITCODE -ne 0) { Fail "git status failed" }
if ($dirty.Count -gt 0) {
    Write-Host ($dirty -join "`n")
    Fail "Working tree has uncommitted changes, commit or stash them first"
}

# ---------------------------------------------------------------- fetch
Log "fetching origin ..."
& git -C $Repo fetch origin
if ($LASTEXITCODE -ne 0) { Fail "git fetch failed" }

# ---------------------------------------------------------------- checkout target
$current = (& git -C $Repo rev-parse --abbrev-ref HEAD | Out-String).Trim()
if ($current -ne $Target) {
    Log "switching branch: $current -> $Target"
    & git -C $Repo checkout $Target
    if ($LASTEXITCODE -ne 0) { Fail "checkout $Target failed" }
}

$before = (& git -C $Repo rev-parse --short HEAD | Out-String).Trim()
Log "merging $Upstream -> $Target ..."
& git -C $Repo merge --no-edit $Upstream
$mergeExit = $LASTEXITCODE

if ($mergeExit -ne 0) {
    $unmerged = @(& git -C $Repo diff --name-only --diff-filter=U)
    if ($unmerged.Count -eq 0) { Fail "merge failed with no conflicting files, check git output" }

    $i18n = @($unmerged | Where-Object { $_ -match '^web/src/i18n/locales/.+\.json$' })
    $others = @($unmerged | Where-Object { $_ -notmatch '^web/src/i18n/locales/.+\.json$' })
    if ($others.Count -gt 0) {
        Write-Host ("非 i18n 冲突: " + ($others -join ', '))
        Fail "Non-i18n conflicts need manual resolution"
    }
    if ($i18n.Count -eq 0) { Fail "no resolvable conflicts found" }

    Log ("auto-merging i18n conflicts: " + ($i18n -join ', '))
    foreach ($file in $i18n) {
        $path = Join-Path $Repo $file
        $tmpOurs = Join-Path $env:TEMP ("i18n-ours-" + [guid]::NewGuid().ToString('N') + '.json')
        $tmpTheirs = Join-Path $env:TEMP ("i18n-theirs-" + [guid]::NewGuid().ToString('N') + '.json')

        & git -C $Repo checkout --ours -- $file
        if ($LASTEXITCODE -ne 0) { Fail "checkout --ours failed: $file" }
        Copy-Item $path $tmpOurs -Force

        & git -C $Repo checkout --theirs -- $file
        if ($LASTEXITCODE -ne 0) { Fail "checkout --theirs failed: $file" }
        Copy-Item $path $tmpTheirs -Force

        & node $resolver $tmpOurs $tmpTheirs $path
        if ($LASTEXITCODE -ne 0) { Fail "i18n JSON merge failed: $file" }
        Remove-Item $tmpOurs, $tmpTheirs -Force -ErrorAction SilentlyContinue

        & git -C $Repo add -- $file
        if ($LASTEXITCODE -ne 0) { Fail "git add failed: $file" }
    }
    & git -C $Repo commit --no-edit
    if ($LASTEXITCODE -ne 0) { Fail "committing merge result failed" }
}

$after = (& git -C $Repo rev-parse --short HEAD | Out-String).Trim()
$brought = (& git -C $Repo rev-list --count "$before..$after" | Out-String).Trim()
Log "merge done: $before -> $after ($brought commits)"
& git -C $Repo log -1 --format='%h %s'

if (-not $NoPush) {
    Log "pushing $Target ..."
    & git -C $Repo push origin $Target
    if ($LASTEXITCODE -ne 0) { Fail "git push failed" }
}

Write-Host ""
Write-Host "Next steps (standard flow):" -ForegroundColor Cyan
Write-Host "  1) verify: go build on server / production-DB-copy smoke test / local web build"
Write-Host "  2) promote : git checkout test; git merge --ff-only dev; git push origin test"
Write-Host "  3) deploy  : scripts\deploy.ps1 -Version vX.Y.Z"
