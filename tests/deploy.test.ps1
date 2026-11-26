$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $projectRoot "deploy test $([guid]::NewGuid())"
$deploy = Join-Path $fixture 'scripts\deploy.ps1'
$target = @{ SshTarget = 'deploy@example.com'; RemoteDirectory = '/var/www/live-jigsaw/' }
$buildExit = 0
$syncExit = 0
$sync = @{ Calls = 0; Arguments = @() }

function pnpm {
    if ($args.Count -ne 1 -or $args[0] -ne 'build' -or (Get-Location).Path -ne $fixture) {
        throw 'Expected a build from the project root.'
    }
    $global:LASTEXITCODE = $buildExit
}

function wsl.exe {
    $sync.Calls++
    $sync.Arguments = $args
    $global:LASTEXITCODE = $syncExit
}

function Assert-Failure($message, [scriptblock] $action) {
    try {
        & $action
    } catch {
        if ($_.Exception.Message -like "*$message*") { return }
        throw
    }
    throw "Expected failure: $message"
}

try {
    $null = New-Item -ItemType Directory -Path (Join-Path $fixture 'scripts'), (Join-Path $fixture 'dist')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\deploy.ps1') -Destination $deploy

    Assert-Failure 'Cannot validate argument' { & $deploy -SshTarget $target.SshTarget -RemoteDirectory '/' -Apply }
    Assert-Failure 'Cannot validate argument' { & $deploy -SshTarget $target.SshTarget -RemoteDirectory '/var/www/..' -Apply }
    Assert-Failure 'did not produce' { & $deploy @target -Apply }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures\puzzle-picker.html') -Destination (Join-Path $fixture 'dist\index.html')
    $buildExit = 1
    Assert-Failure 'Build failed' { & $deploy @target -Apply }
    if ($sync.Calls -ne 0) { throw 'Unsafe invocations must not reach rsync.' }

    $buildExit = 0
    & $deploy -SshTarget 'example.com' -Distribution Ubuntu
    if ($sync.Arguments -notcontains '--dry-run' -or ($sync.Arguments[0..3] -join ' ') -ne '--distribution Ubuntu --exec rsync') {
        throw "Expected a preview in the requested WSL distribution, got: $($sync.Arguments -join ' ')"
    }
    if ($sync.Arguments[-1] -ne 'paperriver@example.com:/home/www/livejigsaw/') {
        throw 'Expected a bare hostname to use the default account and directory.'
    }
    $sshTransport = $sync.Arguments | Where-Object { $_ -like '--rsh=*' }
    if ($sshTransport -notmatch 'BatchMode=no' -or
        $sshTransport -notmatch 'PreferredAuthentications=keyboard-interactive,password' -or
        $sshTransport -notmatch 'StrictHostKeyChecking=yes') {
        throw 'Expected SSH to prompt for authentication and verify the host key.'
    }

    & $deploy @target -Apply
    if ($sync.Arguments -contains '--dry-run' -or $sync.Arguments -notcontains '--delete-delay' -or $sync.Arguments -notcontains '--checksum') {
        throw 'Expected apply to sync by content and remove stale files.'
    }
    if (($sync.Arguments[-3..-1] -join ' ') -ne '-- ./dist/ deploy@example.com:/var/www/live-jigsaw/') {
        throw 'Expected to sync the contents of dist to the dedicated destination.'
    }

    $before = (Get-Location).Path
    $syncExit = 23
    Assert-Failure 'Sync failed (exit 23)' { & $deploy @target -Apply }
    if ((Get-Location).Path -ne $before) { throw 'Expected the working directory to be restored.' }
    Write-Host 'Deployment script checks passed.'
} finally {
    if (Test-Path -LiteralPath $fixture) {
        Remove-Item -LiteralPath $fixture -Recurse -Force
    }
}