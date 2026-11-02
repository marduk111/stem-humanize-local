# Generates build/app.ico (multi-size, PNG-compressed) used by the launcher,
# the installer and the web favicon.

param(
    [string]$OutPath = (Join-Path $PSScriptRoot "app.ico")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngData = New-Object 'System.Collections.Generic.List[byte[]]'

foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $pad = [Math]::Max(0.5, $s * 0.02)
    $rect = New-Object System.Drawing.RectangleF($pad, $pad, ($s - 2 * $pad), ($s - 2 * $pad))
    $r = [Math]::Max(2.0, $s * 0.22)
    $d = $r * 2

    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 30, 34, 42),
        [System.Drawing.Color]::FromArgb(255, 12, 14, 18),
        55.0)
    $g.FillPath($bg, $path)

    $border = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), [float]([Math]::Max(0.6, $s * 0.012)))
    $g.DrawPath($border, $path)

    # Waveform bars
    $heights = @(0.34, 0.62, 0.92, 0.58, 0.30)
    $innerW = $s * 0.66
    $barW = $innerW / 9.5
    $gap = ($innerW - ($barW * $heights.Count)) / ($heights.Count - 1)
    $startX = ($s - $innerW) / 2
    $maxH = $s * 0.52
    $barBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.RectangleF(0, ($s * 0.24), $s, ($s * 0.52))),
        [System.Drawing.Color]::FromArgb(255, 120, 190, 255),
        [System.Drawing.Color]::FromArgb(255, 65, 140, 255),
        90.0)

    for ($i = 0; $i -lt $heights.Count; $i++) {
        $h = [Math]::Max($s * 0.06, $maxH * $heights[$i])
        $x = $startX + $i * ($barW + $gap)
        $y = ($s - $h) / 2
        $barRect = New-Object System.Drawing.RectangleF($x, $y, $barW, $h)
        $g.FillRectangle($barBrush, $barRect)
    }

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngData.Add($ms.ToArray())

    $ms.Dispose()
    $barBrush.Dispose()
    $border.Dispose()
    $bg.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$dir = Split-Path -Parent $OutPath
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

$fs = [System.IO.File]::Create($OutPath)
$bw = New-Object System.IO.BinaryWriter($fs)

$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # type: icon
$bw.Write([UInt16]$sizes.Count)      # image count

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $data = $pngData[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }

    $bw.Write([Byte]$dim)
    $bw.Write([Byte]$dim)
    $bw.Write([Byte]0)               # palette
    $bw.Write([Byte]0)               # reserved
    $bw.Write([UInt16]1)             # color planes
    $bw.Write([UInt16]32)            # bits per pixel
    $bw.Write([UInt32]$data.Length)  # size
    $bw.Write([UInt32]$offset)       # offset
    $offset += $data.Length
}

foreach ($data in $pngData) { $bw.Write($data) }

$bw.Flush()
$bw.Close()
$fs.Close()

Write-Output ("Icon written: {0} ({1:N0} bytes)" -f $OutPath, (Get-Item $OutPath).Length)
