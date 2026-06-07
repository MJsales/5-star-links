Add-Type -AssemblyName System.Drawing

$pngPath = "D:\0ne\pics\logo\logo.png.png"
$faviconPath = "D:\0ne\pics\logo\favicon.png"

# Load original
$src = [System.Drawing.Image]::FromFile($pngPath)

# Create 128x128 favicon (clearer than 32x32)
$bmp = New-Object System.Drawing.Bitmap(128, 128)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, 128, 128)
$bmp.Save($faviconPath, [System.Drawing.Imaging.ImageFormat]::Png)

Write-Host "Favicon created: 128x128"
Write-Host "Size: $((Get-Item $faviconPath).Length) bytes"

$g.Dispose()
$bmp.Dispose()
$src.Dispose()
