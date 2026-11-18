param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$exe = Join-Path $ProjectRoot 'build\Getmeair.exe'
$modules = Join-Path $ProjectRoot 'build\modules'
$stage = Join-Path $ProjectRoot 'build\_portable_stage'
$zip = Join-Path $ProjectRoot 'build\Getmeair-Portable.zip'

if (-not (Test-Path -LiteralPath $exe)) { throw "Missing build output: $exe" }
if (-not (Test-Path -LiteralPath $modules)) { throw "Missing modules folder: $modules" }

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item -LiteralPath $exe -Destination $stage -Force
Copy-Item -LiteralPath $modules -Destination $stage -Recurse -Force
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'TelegramForcePortable') | Out-Null
Set-Content -LiteralPath (Join-Path $stage 'PORTABLE.txt') `
    -Value 'Getmeair portable edition. User data is stored in the TelegramForcePortable folder.' `
    -Encoding ASCII

if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
& tar.exe -a -cf $zip -C $stage .
if ($LASTEXITCODE -ne 0) { throw 'Failed to create portable archive.' }

Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
$item = Get-Item -LiteralPath $zip
Write-Output "Portable package: $($item.FullName)"
Write-Output ("Size: {0:N1} MB" -f ($item.Length / 1MB))
