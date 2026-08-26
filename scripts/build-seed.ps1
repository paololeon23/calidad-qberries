$ErrorActionPreference = "Stop"
$root = "c:\Users\TatianaLeón\Desktop\CALIDAD"
if ($PSScriptRoot) {
  $candidate = Split-Path $PSScriptRoot -Parent
  if (Test-Path (Join-Path $candidate "data\evaluadores.json")) { $root = $candidate }
}

$eval = (Get-Content -Raw (Join-Path $root "data\evaluadores.json") | ConvertFrom-Json).byDni
$supRaw = (Get-Content -Raw (Join-Path $root "data\supervisores-cosecha.json") | ConvertFrom-Json).byDni
$trabRaw = (Get-Content -Raw (Join-Path $root "data\trabajadores.json") | ConvertFrom-Json).byDni

$supHash = @{}
foreach ($p in $supRaw.PSObject.Properties) {
  $supHash[$p.Name] = @{
    nombre = [string]$p.Value.nombre
    cargo  = [string]$p.Value.cargo
  }
}

$preview = [ordered]@{}
$n = 0
foreach ($p in ($trabRaw.PSObject.Properties | Sort-Object { $_.Value.nombre })) {
  $preview[$p.Name] = @{
    nombre = [string]$p.Value.nombre
    cargo  = "COSECHA"
  }
  $n++
  if ($n -ge 80) { break }
}

$seed = [pscustomobject]@{
  evaluadores          = $eval
  supervisores         = $supHash
  trabajadoresPreview  = $preview
}

$json = $seed | ConvertTo-Json -Depth 8 -Compress
$js = "window.QB = window.QB || {};`nQB.SEED = $json;`n"
$out = Join-Path $root "js\catalog-seed.js"
[System.IO.File]::WriteAllText($out, $js, [Text.UTF8Encoding]::new($false))
Write-Output ("ok bytes=" + (Get-Item $out).Length)
