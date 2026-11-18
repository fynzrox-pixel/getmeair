param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$assets = Join-Path $ProjectRoot 'assets'
$art = Join-Path $ProjectRoot 'source\Telegram\Resources\art'
$backup = Join-Path $ProjectRoot 'patches\originals\art'
New-Item -ItemType Directory -Force -Path $art, $backup | Out-Null

$map = @(
    @('icons\app_icon.ico', 'icon256.ico'),
    @('branding\logo_16.png', 'icon16.png'),
    @('branding\logo_32.png', 'icon32.png'),
    @('branding\logo_48.png', 'icon48.png'),
    @('branding\logo_64.png', 'icon64.png'),
    @('branding\logo_128.png', 'icon128.png'),
    @('branding\logo_256.png', 'icon256.png'),
    @('branding\logo_512.png', 'icon512.png'),
    @('branding\logo_32.png', 'icon16@2x.png'),
    @('branding\logo_64.png', 'icon32@2x.png'),
    @('branding\logo_96.png', 'icon48@2x.png'),
    @('branding\logo_128.png', 'icon64@2x.png'),
    @('branding\logo_256.png', 'icon128@2x.png'),
    @('branding\logo_512.png', 'icon256@2x.png'),
    @('branding\logo_1024.png', 'icon512@2x.png'),
    @('branding\logo_256.png', 'logo_256.png'),
    @('branding\logo_256.png', 'logo_256_no_margin.png'),
    @('branding\logo_256.png', 'icon_green.png'),
    @('branding\logo_512.png', 'iconbig_green.png'),
    @('branding\logo_1024.png', 'icon_round512@2x.png')
)

foreach ($entry in $map) {
    $source = Join-Path $assets $entry[0]
    $name = $entry[1]
    $target = Join-Path $art $name
    $original = Join-Path $backup $name
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Missing branding source: $source"
    }
    if ((Test-Path -LiteralPath $target) -and -not (Test-Path -LiteralPath $original)) {
        Copy-Item -LiteralPath $target -Destination $original -Force
    }
    Copy-Item -LiteralPath $source -Destination $target -Force
}

Write-Output "Installed $($map.Count) branding resources into $art"
Write-Output "Originals preserved in $backup"
