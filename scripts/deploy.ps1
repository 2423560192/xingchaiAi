<#
.SYNOPSIS
    One-click production deploy for new-api.

.DESCRIPTION
    Local steps : check git state -> build web frontend -> pack web/dist -> upload
    Remote steps: git fast-forward pull -> replace web/dist -> go build
                  -> backup old binary -> swap -> restart -> health check (auto rollback)

    Requires: Go on the server (/usr/local/go/bin/go), node_modules in web/,
              ssh key auth to the server.

.EXAMPLE
    pwsh -File scripts\deploy.ps1
    pwsh -File scripts\deploy.ps1 -SkipWebBuild
    pwsh -File scripts\deploy.ps1 -Server root@1.2.3.4 -Version v1.0.0-rc.41
#>
param(
    [string]$Server = 'root@1.2.3.4',  # override with -Server root@your-host
    [string]$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$ProdBranch = 'test',
    [string]$Version = '',
    [switch]$SkipWebBuild,
    [switch]$AllowDirty
)

# Native tools (git/npm/tar/scp/ssh) write progress to stderr; keep going and
# check exit codes explicitly instead of turning every warning into an error.
$ErrorActionPreference = 'Continue'
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Log([string]$Message) {
    Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Fail([string]$Message) {
    throw $Message
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

if (-not (Test-Path (Join-Path $Repo '.git'))) { Fail "Not a git repo: $Repo" }
if (-not (Test-Path (Join-Path $Repo 'scripts\deploy-remote.sh'))) {
    Fail "Missing scripts/deploy-remote.sh"
}

# ---------------------------------------------------------------- git state
$branch = (& git -C $Repo rev-parse --abbrev-ref HEAD 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0) { Fail "git rev-parse failed" }
Log "Local branch: $branch"
if ($branch -ne $ProdBranch) {
    Fail "Deploy is only allowed from the production branch '$ProdBranch' (current: '$branch'). Run: git checkout $ProdBranch"
}

$dirtyLines = @(& git -C $Repo status --porcelain --untracked-files=no 2>$null)
if ($LASTEXITCODE -ne 0) { Fail "git status failed" }
if ($dirtyLines.Count -gt 0 -and -not $AllowDirty) {
    Write-Host ($dirtyLines -join "`n")
    Fail "Working tree has uncommitted changes. Commit & push first, or pass -AllowDirty (the server only pulls committed code, so the deployment would NOT match your local changes)."
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $versionFile = Join-Path $Repo 'VERSION'
    if (Test-Path $versionFile) {
        $Version = (Get-Content $versionFile -Raw -ErrorAction SilentlyContinue)
        if ($Version) { $Version = $Version.Trim() }
    }
}
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = 'v1.0.0-rc.41' }
Log "Version: $Version"

# ---------------------------------------------------------------- work dir
$tmp = Join-Path $env:TEMP ("newapi-deploy-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$webTgz = Join-Path $tmp 'web_dist.tgz'
$remoteSh = Join-Path $tmp 'deploy-remote.sh'

try {
    # ------------------------------------------------------------ frontend
    if (-not $SkipWebBuild) {
        $web = Join-Path $Repo 'web'
        if (-not (Test-Path (Join-Path $web 'node_modules'))) {
            Fail "Missing web/node_modules, run npm install first"
        }
        Log "Building frontend ..."
        $npmLog = Join-Path $tmp 'npm-build.log'
        Push-Location $web
        try {
            $env:DISABLE_ESLINT_PLUGIN = 'true'
            $env:VITE_REACT_APP_VERSION = $Version
            & npm run build *> $npmLog
            if ($LASTEXITCODE -ne 0) {
                Get-Content $npmLog -Tail 40 -ErrorAction SilentlyContinue | Write-Host
                Fail "Frontend build failed (full log: $npmLog)"
            }
            Log "Frontend build OK"
        }
        finally { Pop-Location }

        Log "Packing web/dist ..."
        & tar -czf $webTgz -C (Join-Path $Repo 'web\dist') .
        if ($LASTEXITCODE -ne 0) { Fail "Pack web/dist failed" }
    }
    else {
        Log "Skip frontend build (-SkipWebBuild)"
    }

    # ------------------------------------------- upload remote script (LF)
    # Read as UTF-8 explicitly (Windows PowerShell 5.1 defaults to ANSI for
    # BOM-less files), then normalize line endings before uploading.
    $remoteShSrc = Join-Path $Repo 'scripts\deploy-remote.sh'
    $shContent = [System.IO.File]::ReadAllText($remoteShSrc, [System.Text.Encoding]::UTF8)
    $shContent = $shContent -replace "`r`n", "`n"
    Write-Utf8NoBom $remoteSh $shContent

    Log "Uploading deploy files to $Server ..."
    if (-not $SkipWebBuild) {
        & scp -q $webTgz "${Server}:/tmp/web_dist_deploy.tgz"
        if ($LASTEXITCODE -ne 0) { Fail "scp web_dist.tgz failed" }
    }
    & scp -q $remoteSh "${Server}:/tmp/deploy-remote.sh"
    if ($LASTEXITCODE -ne 0) { Fail "scp deploy-remote.sh failed" }

    # ------------------------------------------------------------ remote run
    $webArg = if ($SkipWebBuild) { '' } else { '/tmp/web_dist_deploy.tgz' }
    Log "Running remote deploy ..."
    $remoteOutput = (& ssh -o BatchMode=yes $Server "chmod +x /tmp/deploy-remote.sh && bash /tmp/deploy-remote.sh $webArg" 2>&1 | Out-String)
    $remoteCode = $LASTEXITCODE
    Write-Host $remoteOutput
    if ($remoteCode -ne 0) { Fail "Remote deploy failed (see log above)" }
    if ($remoteOutput -notmatch 'DEPLOY_OK') { Fail "Remote deploy did not report DEPLOY_OK" }

    Log "Deploy finished OK."
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
