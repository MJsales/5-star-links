Add-Type -AssemblyName System.Drawing
$exe = "D:\0ne\app\5star-splicer.exe"
try {
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($exe)
    $bmp = $icon.ToBitmap()
    $bmp.Save("D:\0ne\pics\logo\exe-icon.png")
    Write-Host "Icon extracted successfully"
} catch {
    Write-Host "Failed to extract icon: $_"
}
