# Apply Getmeair overlay onto a freshly cloned tdesktop tree.
# Usage: apply_overlay.ps1 -TdesktopRoot C:\path\to\tdesktop

param(
    [Parameter(Mandatory=$true)]
    [string]$TdesktopRoot
)

$ErrorActionPreference = 'Stop'
$overlay = Join-Path $PSScriptRoot '..\patches\overlay'
$overlay = (Resolve-Path $overlay).Path
$td = (Resolve-Path $TdesktopRoot).Path

$files = Get-ChildItem -LiteralPath $overlay -Recurse -File
foreach ($f in $files) {
    $rel = $f.FullName.Substring($overlay.Length + 1)
    $dst = Join-Path $td $rel
    $dd  = Split-Path -Parent $dst
    if (-not (Test-Path -LiteralPath $dd)) {
        New-Item -ItemType Directory -Path $dd -Force | Out-Null
    }
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
    Write-Output "applied $rel"
}
Write-Output "Overlay applied: $($files.Count) files"