$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'ReceiptRenderer.cs') -ReferencedAssemblies System.Drawing
$content = @"
+----------------------------------------------+
| رستوران منوپیک                               |
| سفارش ۱۰۲۴ · میز ۳                           |
+----------------------------------------------+
| شرح کالا               | تعداد | تومان        |
+----------------------------------------------+
| چیزبرگر دوبل           | ۲    | ۲۲۲٬۲۰۰      |
| انتخاب: پنیر اضافه     |      |              |
+----------------------------------------------+
| مبلغ نهایی: ۲۲۲٬۲۰۰ تومان                    |
+----------------------------------------------+
| از خرید شما سپاسگزاریم                       |
+----------------------------------------------+
"@
foreach ($width in @(384, 576)) {
    $breaks = $null
    $bitmap = [MenuPeakReceiptRenderer]::Render($content, $width, [ref]$breaks)
    try {
        if ($bitmap.Width -ne $width -or $bitmap.Height -lt 100) { throw 'Invalid render bounds' }
        if ($bitmap.GetPixel(20, 9).R -gt 160) { throw 'Header border was not drawn' }
        if ($breaks.Count -ne ($content -split "`n").Count) { throw 'Missing pagination boundaries' }
        $bitmap.Save((Join-Path $PSScriptRoot "receipt-preview-$width.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
}
$bytes = [MenuPeakReceiptRenderer]::Raster($content)
$offset = 5
while ($offset -lt $bytes.Length - 7) {
    if ($bytes[$offset] -ne 29 -or $bytes[$offset+1] -ne 118) { throw 'Invalid raster block' }
    $rowBytes = [int]$bytes[$offset+4] + 256 * [int]$bytes[$offset+5]
    $height = [int]$bytes[$offset+6] + 256 * [int]$bytes[$offset+7]
    if ($rowBytes -ne 48 -or $height -lt 1 -or $height -gt 64) { throw 'Invalid raster geometry' }
    $offset += 8 + $rowBytes * $height
}
if ($offset -ne $bytes.Length - 7) { throw 'Truncated raster stream' }
Write-Output 'Receipt renderer: graphical borders, widths, pagination and raster framing passed.'
