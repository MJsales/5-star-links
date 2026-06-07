Add-Type -AssemblyName System.Drawing

$pngPath = "D:\0ne\pics\logo\logo.png.png"
$icoPath = "D:\0ne\pics\logo\logo.ico"

# Load the source image
$srcImg = [System.Drawing.Image]::FromFile($pngPath)

# Create a 256x256 bitmap (required for proper ICO)
$bmp = New-Object System.Drawing.Bitmap(256, 256)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($srcImg, 0, 0, 256, 256)

# Save as PNG first
$tempPng = "D:\0ne\pics\logo\logo_temp.png"
$bmp.Save($tempPng, [System.Drawing.Imaging.ImageFormat]::Png)

# Convert PNG to ICO using proper method
$pngBytes = [System.IO.File]::ReadAllBytes($tempPng)

# ICO file format: header + directory entry + PNG data
$icoHeader = New-Object byte[] 6
$icoHeader[0] = 0  # Reserved
$icoHeader[1] = 0  # Type: icon
$icoHeader[2] = 1   # Count: 1 image
$icoHeader[3] = 0

# Directory entry (16 bytes)
$dirEntry = New-Object byte[] 16
$dirEntry[0] = 0    # Width (0 = 256)
$dirEntry[1] = 0    # Height (0 = 256)
$dirEntry[2] = 0    # Color palette
$dirEntry[3] = 0    # Reserved
$dirEntry[4] = 1    # Color planes
$dirEntry[5] = 0
$dirEntry[6] = 32   # Bits per pixel
$dirEntry[7] = 0

$imgSize = $pngBytes.Length
$dirEntry[8] = [byte]($imgSize -band 0xFF)
$dirEntry[9] = [byte](($imgSize -shr 8) -band 0xFF)
$dirEntry[10] = [byte](($imgSize -shr 16) -band 0xFF)
$dirEntry[11] = [byte](($imgSize -shr 24) -band 0xFF)

$offset = 6 + 16  # Header + 1 directory entry
$dirEntry[12] = [byte]($offset -band 0xFF)
$dirEntry[13] = [byte](($offset -shr 8) -band 0xFF)
$dirEntry[14] = [byte](($offset -shr 16) -band 0xFF)
$dirEntry[15] = [byte](($offset -shr 24) -band 0xFF)

# Write ICO file
$fs = [System.IO.File]::Create($icoPath)
$fs.Write($icoHeader, 0, 6)
$fs.Write($dirEntry, 0, 16)
$fs.Write($pngBytes, 0, $pngBytes.Length)
$fs.Close()

# Cleanup
Remove-Item $tempPng -Force
$bmp.Dispose()
$g.Dispose()
$srcImg.Dispose()

$size = (Get-Item $icoPath).Length
Write-Host "ICO created: $size bytes"
