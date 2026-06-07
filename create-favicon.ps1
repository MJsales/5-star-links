Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(256,256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

# Dark background
$g.Clear([System.Drawing.Color]::FromArgb(5,2,8))

# Purple border rectangle
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(168,85,247), 4)
$g.DrawRectangle($pen, 20, 20, 216, 216)

# File icon shape (white rectangle with folded corner)
$fileBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200,200,200))
$points = @(
    (New-Object System.Drawing.Point(70, 50)),
    (New-Object System.Drawing.Point(170, 50)),
    (New-Object System.Drawing.Point(195, 75)),
    (New-Object System.Drawing.Point(195, 200)),
    (New-Object System.Drawing.Point(70, 200))
)
$g.FillPolygon($fileBrush, $points)

# Folded corner
$foldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(130,130,130))
$foldPoints = @(
    (New-Object System.Drawing.Point(170, 50)),
    (New-Object System.Drawing.Point(170, 75)),
    (New-Object System.Drawing.Point(195, 75))
)
$g.FillPolygon($foldBrush, $foldPoints)

# "EXE" text
$font = New-Object System.Drawing.Font('Arial', 36, [System.Drawing.FontStyle]::Bold)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(168,85,247))
$g.DrawString('EXE', $font, $textBrush, 75, 110)

# Download arrow
$arrowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(168,85,247), 6)
$g.DrawLine($arrowPen, 133, 210, 133, 240)
$g.DrawLine($arrowPen, 110, 225, 133, 245)
$g.DrawLine($arrowPen, 156, 225, 133, 245)

$bmp.Save("D:\0ne\pics\logo\favicon.png")
Write-Host "Favicon created"
