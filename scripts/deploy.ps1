[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9][A-Za-z0-9.-]*\z')]
    [string] $SshTarget,

    [ValidatePattern('^(/[A-Za-z0-9_-][A-Za-z0-9._-]*){2,}/?\z')]
    [string] $RemoteDirectory = '/home/www/livejigsaw',

    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*\z')]
    [string] $Distribution,

    [switch] $Apply
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if ($SshTarget -notlike '*@*') {
    $SshTarget = "paperriver@$SshTarget"
}
$destination = '{0}:{1}/' -f $SshTarget, $RemoteDirectory.TrimEnd('/')

$wslArguments = @()
if ($Distribution) {
    $wslArguments += @('--distribution', $Distribution)
}
$wslArguments += @(
    '--exec', 'rsync',
    '--recursive', '--checksum', '--itemize-changes',
    '--delete-delay', '--delay-updates',
    '--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r',
    '--rsh=ssh -o BatchMode=no -o PreferredAuthentications=keyboard-interactive,password -o StrictHostKeyChecking=yes -o ControlPath=none'
)
if (-not $Apply) {
    $wslArguments += '--dry-run'
}

Push-Location -LiteralPath $projectRoot
try {
    & pnpm 'build'
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed (exit $LASTEXITCODE); deployment did not start."
    }
    if (-not (Test-Path -LiteralPath 'dist\index.html' -PathType Leaf)) {
        throw 'Build did not produce dist\index.html; deployment did not start.'
    }

    if ($Apply) {
        Write-Host "Syncing dist to $destination (including deletions)."
    } else {
        Write-Host "Previewing sync to $destination. No remote files will change."
    }
    & wsl.exe @wslArguments '--' './dist/' $destination
    if ($LASTEXITCODE -ne 0) {
        throw "Sync failed (exit $LASTEXITCODE). Check the rsync output above."
    }
} finally {
    Pop-Location
}