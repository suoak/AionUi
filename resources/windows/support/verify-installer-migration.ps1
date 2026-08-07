param(
  [Parameter(Mandatory = $true)]
  [string]$CurrentInstaller,

  [string]$LegacyInstaller,

  [Parameter(Mandatory = $true)]
  [ValidateSet('x64', 'arm64')]
  [string]$Arch,

  [Parameter(Mandatory = $true)]
  [string]$DiagnosticsDirectory,

  [Parameter(Mandatory = $true)]
  [ValidateSet('fresh', 'migration')]
  [string]$Mode,

  [string]$TemporaryDirectory = $env:RUNNER_TEMP
)

$ErrorActionPreference = 'Stop'
$freshInstallDirectory = Join-Path $TemporaryDirectory "csbu-workmate-fresh-smoke-$Arch"
$migrationInstallDirectory = Join-Path $TemporaryDirectory "csbu-workmate-migration-smoke-$Arch"
$installStatePath = Join-Path $env:LOCALAPPDATA 'CSBU WorkMate\installer-state.ini'
$installRegistryPath = 'HKCU:\Software\d1c5b48c-1cbe-5096-9ab3-71e40b612193'
$uninstallRegistryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\d1c5b48c-1cbe-5096-9ab3-71e40b612193'
$registryPaths = @($installRegistryPath, $uninstallRegistryPath)

New-Item -ItemType Directory -Path $DiagnosticsDirectory -Force | Out-Null
Set-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "Started at $(Get-Date -Format o)"
Add-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "Mode: $Mode"

function Invoke-BoundedProcess {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Phase,
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList,
    [int]$TimeoutSeconds = 600
  )

  Write-Host "::group::Installer smoke phase: $Phase"
  $startedAt = Get-Date
  $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -PassThru -NoNewWindow
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    & taskkill.exe /PID $process.Id /T /F 2>&1 |
      Out-File -LiteralPath (Join-Path $DiagnosticsDirectory "$Phase-taskkill.txt")
    Write-Host '::endgroup::'
    throw "$Phase timed out after ${TimeoutSeconds}s"
  }
  $duration = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
  Write-Host "$Phase finished with exit code $($process.ExitCode) after ${duration}s"
  Write-Host '::endgroup::'
  if ($process.ExitCode -ne 0) {
    throw "$Phase failed with exit code $($process.ExitCode)"
  }
}

function Wait-ForUninstallCompletion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Phase,
    [Parameter(Mandatory = $true)]
    [string]$InstallDirectory,
    [int]$TimeoutSeconds = 600
  )

  Write-Host "Waiting for the detached NSIS uninstaller during $Phase"
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastProgressAt = Get-Date
  while ((Get-Date) -lt $deadline) {
    $directoryExists = Test-Path -LiteralPath $InstallDirectory
    $registrationExists = $registryPaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $directoryExists -and -not $registrationExists) {
      Write-Host "$Phase completed and removed its directory and registration"
      return
    }
    if (((Get-Date) - $lastProgressAt).TotalSeconds -ge 15) {
      Write-Host "$Phase still running: directoryExists=$directoryExists registrationExists=$([bool]$registrationExists)"
      $lastProgressAt = Get-Date
    }
    Start-Sleep -Seconds 1
  }

  $stuckProcesses = @(Get-CimInstance Win32_Process | Where-Object {
      $_.Name -match '^Un_' -or
      ([string]$_.CommandLine).Contains($InstallDirectory, [StringComparison]::OrdinalIgnoreCase)
    })
  ConvertTo-Json -InputObject $stuckProcesses -Depth 4 -AsArray |
    Set-Content -LiteralPath (Join-Path $DiagnosticsDirectory "$Phase-stuck-processes.json")
  foreach ($stuckProcess in $stuckProcesses) {
    & taskkill.exe /PID $stuckProcess.ProcessId /T /F 2>&1 |
      Out-File -LiteralPath (Join-Path $DiagnosticsDirectory "$Phase-taskkill.txt") -Append
  }
  throw "$Phase did not finish cleanup within ${TimeoutSeconds}s"
}

function Assert-Registration {
  param([Parameter(Mandatory = $true)][string]$ExpectedInstallDirectory)

  foreach ($registryPath in $registryPaths) {
    if (-not (Test-Path -LiteralPath $registryPath)) {
      throw "Standard Windows installation registration is missing: $registryPath"
    }
  }
  $actualInstallLocation = (Get-ItemProperty -LiteralPath $installRegistryPath).InstallLocation
  if ([IO.Path]::GetFullPath($actualInstallLocation) -ne [IO.Path]::GetFullPath($ExpectedInstallDirectory)) {
    throw "Installation directory registration mismatch: $actualInstallLocation"
  }
}

function Get-InstalledTargets {
  param([Parameter(Mandatory = $true)][string]$InstallDirectory)

  $application = Get-Item -LiteralPath (Join-Path $InstallDirectory 'CSBU WorkMate.exe')
  $uninstaller = Get-ChildItem -LiteralPath $InstallDirectory -Recurse -File -Filter 'Uninstall*.exe' |
    Select-Object -First 1
  if (-not $uninstaller) {
    throw "Installed uninstaller was not found under $InstallDirectory"
  }
  return @($application, $uninstaller)
}

function Assert-Metadata {
  param([Parameter(Mandatory = $true)][object[]]$Targets)

  foreach ($target in $Targets) {
    $info = $target.VersionInfo
    foreach ($propertyName in @('CompanyName', 'FileVersion', 'LegalCopyright', 'ProductName', 'ProductVersion')) {
      if ([string]::IsNullOrWhiteSpace([string]$info.$propertyName)) {
        throw "Required installed VERSIONINFO is missing from $($target.FullName): $propertyName"
      }
    }
    if ($info.CompanyName -ne 'CSBU' -or $info.ProductName -ne 'CSBU WorkMate') {
      throw "Unexpected installed product metadata in $($target.FullName)"
    }
    if ($info.LegalCopyright -ne 'Copyright © 2026 CSBU') {
      throw "Unexpected installed LegalCopyright in $($target.FullName): $($info.LegalCopyright)"
    }
  }
}

function Clear-SmokeState {
  foreach ($directory in @($freshInstallDirectory, $migrationInstallDirectory)) {
    if (Test-Path -LiteralPath $directory) {
      Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction Continue
    }
  }
  if (Test-Path -LiteralPath $installStatePath) {
    Remove-Item -LiteralPath $installStatePath -Force -ErrorAction Continue
  }
  foreach ($registryPath in $registryPaths) {
    if (Test-Path -LiteralPath $registryPath) {
      Remove-Item -LiteralPath $registryPath -Recurse -Force -ErrorAction Continue
    }
  }
}

Clear-SmokeState
try {
  if ($Mode -eq 'fresh') {
    $freshLog = Join-Path $DiagnosticsDirectory 'fresh-install.jsonl'
    Invoke-BoundedProcess -Phase 'fresh-install' -FilePath $CurrentInstaller -ArgumentList @('/S', "--installer-log=$freshLog", "/D=$freshInstallDirectory")
    $freshTargets = Get-InstalledTargets -InstallDirectory $freshInstallDirectory
    Assert-Registration -ExpectedInstallDirectory $freshInstallDirectory
    Assert-Metadata -Targets $freshTargets
    Invoke-BoundedProcess -Phase 'fresh-uninstall' -FilePath $freshTargets[1].FullName -ArgumentList @('/S', "--installer-log=$freshLog")
    Wait-ForUninstallCompletion -Phase 'fresh-uninstall' -InstallDirectory $freshInstallDirectory
  } else {
    if ([string]::IsNullOrWhiteSpace($LegacyInstaller) -or -not (Test-Path -LiteralPath $LegacyInstaller -PathType Leaf)) {
      throw 'Legacy installer is required for migration smoke tests'
    }

    $legacyLog = Join-Path $DiagnosticsDirectory 'legacy-install.jsonl'
    Invoke-BoundedProcess -Phase 'legacy-install' -FilePath $LegacyInstaller -ArgumentList @('/S', "--installer-log=$legacyLog", "/D=$migrationInstallDirectory")
    $null = Get-InstalledTargets -InstallDirectory $migrationInstallDirectory
    if (-not (Test-Path -LiteralPath $installStatePath)) {
      throw "Legacy registry-free installer did not create migration state: $installStatePath"
    }
    foreach ($registryPath in $registryPaths) {
      if (Test-Path -LiteralPath $registryPath) {
        throw "Legacy registry-free installer unexpectedly registered: $registryPath"
      }
    }

    $migrationLog = Join-Path $DiagnosticsDirectory 'migration-install.jsonl'
    Invoke-BoundedProcess -Phase 'registry-free-migration' -FilePath $CurrentInstaller -ArgumentList @('/S', "--installer-log=$migrationLog")
    if (Test-Path -LiteralPath $installStatePath) {
      throw "Legacy registry-free installer state remains after installation: $installStatePath"
    }
    Assert-Registration -ExpectedInstallDirectory $migrationInstallDirectory
    $migratedTargets = Get-InstalledTargets -InstallDirectory $migrationInstallDirectory
    Assert-Metadata -Targets $migratedTargets
    Invoke-BoundedProcess -Phase 'migrated-uninstall' -FilePath $migratedTargets[1].FullName -ArgumentList @('/S', "--installer-log=$migrationLog")
    Wait-ForUninstallCompletion -Phase 'migrated-uninstall' -InstallDirectory $migrationInstallDirectory
  }
} finally {
  $processSnapshot = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'CSBU|Uninstall|nsis|^Un_' } |
      Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine)
  ConvertTo-Json -InputObject $processSnapshot -Depth 4 -AsArray |
    Set-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'processes.json')
  Add-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'smoke-status.txt') -Value "Finished at $(Get-Date -Format o)"
  Clear-SmokeState
}
