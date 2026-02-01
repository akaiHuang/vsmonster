param(
  [string]$VsixPath
)

$ErrorActionPreference = "Stop"

# Ensure TLS 1.2 for GitHub API on older PowerShell
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  # Ignore if not supported
}

$rootDir = Split-Path -Parent $PSScriptRoot
$extDir = Join-Path $rootDir "packages/vscode-extension"

function Get-CodeCommand {
  if (Get-Command code -ErrorAction SilentlyContinue) { return "code" }
  if (Get-Command code-insiders -ErrorAction SilentlyContinue) { return "code-insiders" }
  return $null
}

if (-not $VsixPath) {
  $localVsix = Get-ChildItem -Path $extDir -Filter *.vsix -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($localVsix) {
    $VsixPath = $localVsix.FullName
  }
}

if (-not $VsixPath) {
  $repo = "akaiHuang/vsmonster"
  $api = "https://api.github.com/repos/$repo/releases/latest"
  Write-Host "Downloading latest VSIX from GitHub Releases..."
  $release = Invoke-RestMethod -Uri $api -Headers @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "vsmonster-installer"
  }
  $asset = $release.assets | Where-Object { $_.name -like "*.vsix" } | Select-Object -First 1
  if (-not $asset) {
    throw "No VSIX asset found in the latest GitHub release."
  }
  $tempPath = Join-Path $env:TEMP $asset.name
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tempPath
  $VsixPath = $tempPath
}

if (-not (Test-Path $VsixPath)) {
  throw "VSIX not found: $VsixPath"
}

$codeCmd = Get-CodeCommand
if (-not $codeCmd) {
  Write-Error "VS Code CLI not found (code / code-insiders). In VS Code, run: Shell Command: Install 'code' command in PATH"
  exit 1
}

Write-Host "Installing VSIX: $VsixPath"
& $codeCmd --install-extension $VsixPath

Write-Host "Done. Reload VS Code if the extension does not activate."
