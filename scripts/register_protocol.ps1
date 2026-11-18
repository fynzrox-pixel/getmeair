param(
    [string]$Executable = (Join-Path (Split-Path -Parent $PSScriptRoot) 'build\Getmeair.exe'),
    [switch]$Unregister
)

$ErrorActionPreference = 'Stop'

$root = 'HKCU:\Software\Classes\getmeair'
$command = Join-Path $root 'shell\open\command'

if ($Unregister) {
    Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    Write-Output 'getmeair:// registration removed.'
    exit 0
}

if (-not (Test-Path -LiteralPath $Executable)) {
    throw "Executable not found: $Executable"
}

New-Item -Path $root -Force | Out-Null
Set-ItemProperty -Path $root -Name '(default)' -Value 'URL:Getmeair Protocol'
New-ItemProperty -Path $root -Name 'URL Protocol' -PropertyType String -Value '' -Force | Out-Null
New-Item -Path $command -Force | Out-Null
Set-ItemProperty -Path $command -Name '(default)' -Value ('"' + $Executable + '" "%1"')

Write-Output "Registered getmeair:// -> $Executable"
