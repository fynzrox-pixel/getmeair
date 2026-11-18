# Prepare release 0.1.1 folder from a successful build.
# Assumes Getmeair.exe has been built and placed in D:\Getmeair-dev\build\

$ErrorActionPreference = 'Stop'
$root = 'D:\Getmeair-dev'
$rel  = Join-Path $root 'release\0.1.1'
New-Item -ItemType Directory -Path $rel -Force | Out-Null

$exe = Join-Path $root 'build\Getmeair.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    Write-Error "Build output not found: $exe. Build the C++ project first."
    exit 1
}

Copy-Item -LiteralPath $exe -Destination (Join-Path $rel 'Getmeair.exe') -Force

# Portable zip
& (Join-Path $root 'scripts\package_portable.ps1')

# Installer (if Inno Setup / .NET installer exists)
$installer = Join-Path $root 'installer\Getmeair Setup.exe'
if (Test-Path -LiteralPath $installer) {
    Copy-Item -LiteralPath $installer -Destination (Join-Path $rel 'Getmeair-Setup-0.1.1.exe') -Force
}

# README / CHANGELOG already in $rel

# Compute SHA-256
$hashes = @()
Get-ChildItem -LiteralPath $rel -File | ForEach-Object {
    $h = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    $hashes += "$h  $($_.Name)"
}
$hashes | Set-Content -LiteralPath (Join-Path $rel 'SHA256.txt') -Encoding UTF8
Write-Output "Release prepared in $rel"
