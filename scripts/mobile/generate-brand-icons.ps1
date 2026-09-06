Add-Type -AssemblyName System.Drawing

function Save-Png([System.Drawing.Bitmap]$bmp, [string]$path) {
  $dir = Split-Path $path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $full = Join-Path (Resolve-Path $dir) (Split-Path $path -Leaf)
  $bmp.Save($full, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-BrandIcon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 24, 24, 27))

  $scale = $size / 64.0
  $S = { param([double]$v) [int][Math]::Round($v * $scale) }

  $rx = & $S 12; $ry = & $S 14; $rw = & $S 40; $rh = & $S 38; $rad = & $S 6
  $d = $rad * 2

  $body = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 39, 39, 42))
  $stroke = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 63, 63, 70), [Math]::Max(1.0, $scale * 2))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($rx, $ry, $d, $d, 180, 90)
  $path.AddArc($rx + $rw - $d, $ry, $d, $d, 270, 90)
  $path.AddArc($rx + $rw - $d, $ry + $rh - $d, $d, $d, 0, 90)
  $path.AddArc($rx, $ry + $rh - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($body, $path)
  $g.DrawPath($stroke, $path)

  $header = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 59, 130, 246))
  $hp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $hp.AddArc($rx, $ry, $d, $d, 180, 90)
  $hp.AddArc($rx + $rw - $d, $ry, $d, $d, 270, 90)
  $y26 = & $S 26
  $hp.AddLine($rx + $rw, $y26, $rx, $y26)
  $hp.CloseFigure()
  $g.FillPath($header, $hp)

  $pin = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillRectangle($pin, (& $S 20), (& $S 10), (& $S 4), (& $S 8))
  $g.FillRectangle($pin, (& $S 40), (& $S 10), (& $S 4), (& $S 8))

  $bolt = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
  $pts = @(
    [System.Drawing.Point]::new((& $S 35), (& $S 28)),
    [System.Drawing.Point]::new((& $S 25), (& $S 40)),
    [System.Drawing.Point]::new((& $S 33), (& $S 40)),
    [System.Drawing.Point]::new((& $S 30), (& $S 52)),
    [System.Drawing.Point]::new((& $S 45), (& $S 38)),
    [System.Drawing.Point]::new((& $S 36), (& $S 38))
  )
  $g.FillPolygon($bolt, $pts)

  foreach ($o in @($body, $stroke, $path, $header, $hp, $pin, $bolt, $g)) { $o.Dispose() }
  return $bmp
}

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

$icon = New-BrandIcon 1024
Save-Png $icon (Join-Path $Root "mobile\assets\icon.png")
$icon.Dispose()

$adaptive = New-BrandIcon 1024
Save-Png $adaptive (Join-Path $Root "mobile\assets\adaptive-icon.png")
$adaptive.Dispose()

$splash = New-BrandIcon 1284
Save-Png $splash (Join-Path $Root "mobile\assets\splash-icon.png")
$splash.Dispose()

foreach ($pair in @(
  @{ dir = "drawable-mdpi"; size = 288 },
  @{ dir = "drawable-hdpi"; size = 432 },
  @{ dir = "drawable-xhdpi"; size = 576 },
  @{ dir = "drawable-xxhdpi"; size = 864 },
  @{ dir = "drawable-xxxhdpi"; size = 1152 }
)) {
  $b = New-BrandIcon $pair.size
  Save-Png $b (Join-Path $Root "mobile\android\app\src\main\res\$($pair.dir)\splashscreen_logo.png")
  $b.Dispose()
}

$densities = @{
  "mipmap-mdpi" = 48
  "mipmap-hdpi" = 72
  "mipmap-xhdpi" = 96
  "mipmap-xxhdpi" = 144
  "mipmap-xxxhdpi" = 192
}
$fgDensities = @{
  "mipmap-mdpi" = 108
  "mipmap-hdpi" = 162
  "mipmap-xhdpi" = 216
  "mipmap-xxhdpi" = 324
  "mipmap-xxxhdpi" = 432
}

foreach ($dir in $densities.Keys) {
  $bmp = New-BrandIcon $densities[$dir]
  Save-Png $bmp (Join-Path $Root "mobile\android\app\src\main\res\$dir\ic_launcher.png")
  Save-Png $bmp (Join-Path $Root "mobile\android\app\src\main\res\$dir\ic_launcher_round.png")
  $bmp.Dispose()
  $fg = New-BrandIcon $fgDensities[$dir]
  Save-Png $fg (Join-Path $Root "mobile\android\app\src\main\res\$dir\ic_launcher_foreground.png")
  $fg.Dispose()
}

Write-Host "Brand icons written"
