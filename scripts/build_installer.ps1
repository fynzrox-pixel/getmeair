param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$exe = Join-Path $ProjectRoot 'build\Getmeair.exe'
$modules = Join-Path $ProjectRoot 'build\modules'
$icon = Join-Path $ProjectRoot 'assets\branding\app_icon.ico'
$installerDir = Join-Path $ProjectRoot 'installer'
$payloadDir = Join-Path $installerDir '_payload'
$payloadZip = Join-Path $installerDir 'payload.zip'
$output = Join-Path $installerDir 'Getmeair Setup.exe'
$source = Join-Path $installerDir 'GetmeairInstaller.cs'
$log = Join-Path $installerDir 'build_installer.log'

if (-not (Test-Path -LiteralPath $exe)) { throw "Missing build output: $exe" }
if (-not (Test-Path -LiteralPath $icon)) { throw "Missing icon: $icon" }
if (-not (Test-Path -LiteralPath $source)) { throw "Missing installer source: $source" }

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) { throw "C# compiler not found: $csc" }

Remove-Item -LiteralPath $payloadDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null
Copy-Item -LiteralPath $exe -Destination (Join-Path $payloadDir 'Getmeair.exe') -Force
Copy-Item -LiteralPath $modules -Destination (Join-Path $payloadDir 'modules') -Recurse -Force

if (Test-Path -LiteralPath $payloadZip) { Remove-Item -LiteralPath $payloadZip -Force }
& tar.exe -a -cf $payloadZip -C $payloadDir .
if ($LASTEXITCODE -ne 0) { throw "Failed to create payload archive." }

if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
$args = @(
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    '/debug-',
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:Microsoft.CSharp.dll',
    ('/resource:"' + $payloadZip + '",GetmeairPayload'),
    ('/win32icon:"' + $icon + '"'),
    ('/out:"' + $output + '"'),
    ('"' + $source + '"')
)
$result = & $csc @args 2>&1
$result | Tee-Object -FilePath $log
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
    throw "Installer compilation failed. See $log"
}

Remove-Item -LiteralPath $payloadDir -Recurse -Force -ErrorAction SilentlyContinue
$item = Get-Item -LiteralPath $output
Write-Output "Built installer: $($item.FullName)"
Write-Output ("Size: {0:N1} MB" -f ($item.Length / 1MB))
