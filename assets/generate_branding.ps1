param(
    [string]$AssetsRoot = $PSScriptRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-Graphics([System.Drawing.Bitmap]$Bitmap) {
    $graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    return $graphics
}

function New-RoundedPath([int]$Size) {
    $diameter = [int][math]::Round($Size * 0.24)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($Size - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($Size - $diameter, $Size - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $Size - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Tile([int]$Size) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = New-Graphics $bitmap
    $rectangle = [System.Drawing.Rectangle]::new(0, 0, $Size, $Size)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $rectangle,
        [System.Drawing.Color]::FromArgb(255, 11, 110, 253),
        [System.Drawing.Color]::FromArgb(255, 34, 211, 238),
        [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $path = New-RoundedPath $Size
    $graphics.FillPath($gradient, $path)

    $center = [single]$Size / 2
    $radius = [single]$Size * 0.22
    $pen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [single]$Size * 0.075)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $arc = [System.Drawing.RectangleF]::new($center - $radius, $center - $radius, $radius * 2, $radius * 2)
    $graphics.DrawArc($pen, $arc, 35, 290)
    $barEnd = $center + $radius * 0.95
    $graphics.DrawLine($pen, $center, $center, $barEnd, $center)
    $graphics.DrawLine($pen, $barEnd, $center, $barEnd, $center + $radius * 0.42)

    $graphics.Dispose()
    $gradient.Dispose()
    $path.Dispose()
    $pen.Dispose()
    return $bitmap
}

function Save-Png([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
    $full = Join-Path (Join-Path $AssetsRoot 'branding') $Path
    $Bitmap.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Write-Icon([int[]]$Sizes, [string]$Path) {
    $images = @()
    foreach ($size in $Sizes) {
        $tile = New-Tile $size
        $stream = [System.IO.MemoryStream]::new()
        $tile.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $images += [pscustomobject]@{ Size = $size; Bytes = $stream.ToArray() }
        $tile.Dispose()
        $stream.Dispose()
    }

    $total = 6 + ($images.Count * 16)
    foreach ($image in $images) { $total += $image.Bytes.Length }
    $buffer = [byte[]]::new($total)
    $writer = [System.IO.BinaryWriter]::new([System.IO.MemoryStream]::new($buffer))
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$images.Count)
    $offset = 6 + ($images.Count * 16)
    foreach ($image in $images) {
        $writer.Write([byte]$(if ($image.Size -ge 256) { 0 } else { $image.Size }))
        $writer.Write([byte]$(if ($image.Size -ge 256) { 0 } else { $image.Size }))
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$image.Bytes.Length)
        $writer.Write([uint32]$offset)
        $offset += $image.Bytes.Length
    }
    foreach ($image in $images) { $writer.Write($image.Bytes) }
    $writer.Flush()
    [System.IO.File]::WriteAllBytes((Join-Path (Join-Path $AssetsRoot 'branding') $Path), $buffer)
    $writer.Dispose()
}

function New-Splash {
    $bitmap = [System.Drawing.Bitmap]::new(1200, 600, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = New-Graphics $bitmap
    $rectangle = [System.Drawing.Rectangle]::new(0, 0, 1200, 600)
    $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $rectangle,
        [System.Drawing.Color]::FromArgb(255, 7, 22, 48),
        [System.Drawing.Color]::FromArgb(255, 12, 74, 110),
        [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal)
    $graphics.FillRectangle($gradient, $rectangle)

    $tile = New-Tile 320
    $graphics.DrawImage($tile, 440, 92, 320, 320)

    $font = [System.Drawing.Font]::new('Segoe UI Semibold', 68, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $format = [System.Drawing.StringFormat]::new()
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString('Getmeair', $font, $brush, [System.Drawing.RectangleF]::new(0, 420, 1200, 100), $format)

    $subFont = [System.Drawing.Font]::new('Segoe UI', 24, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $subBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 186, 230, 253))
    $graphics.DrawString('Private. Fast. Yours.', $subFont, $subBrush, [System.Drawing.RectangleF]::new(0, 520, 1200, 50), $format)

    $bitmap.Save((Join-Path (Join-Path $AssetsRoot 'branding') 'splash.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Save((Join-Path $AssetsRoot 'backgrounds\splash_background.png'), [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $gradient.Dispose()
    $tile.Dispose()
    $font.Dispose()
    $brush.Dispose()
    $subFont.Dispose()
    $subBrush.Dispose()
    $format.Dispose()
    $bitmap.Dispose()
}

$branding = Join-Path $AssetsRoot 'branding'
$icons = Join-Path $AssetsRoot 'icons'
$backgrounds = Join-Path $AssetsRoot 'backgrounds'
New-Item -ItemType Directory -Force -Path $branding, $icons, $backgrounds | Out-Null

foreach ($size in @(16, 32, 48, 64, 96, 128, 256, 512, 1024)) {
    $tile = New-Tile $size
    Save-Png $tile "logo_$size.png"
    Copy-Item -LiteralPath (Join-Path $branding "logo_$size.png") -Destination (Join-Path $icons "app_icon_$size.png") -Force
    $tile.Dispose()
}

$tile = New-Tile 512
$tile.Save((Join-Path $branding 'logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$tile.Dispose()

Write-Icon @(16, 32, 48, 64, 128, 256) 'app_icon.ico'
Copy-Item -LiteralPath (Join-Path $branding 'app_icon.ico') -Destination (Join-Path $icons 'app_icon.ico') -Force
New-Splash

Write-Output "Branding assets generated in $AssetsRoot"
