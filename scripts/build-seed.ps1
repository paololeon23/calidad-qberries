$ErrorActionPreference = "Stop"
$root = "c:\Users\TatianaLeón\Desktop\CALIDAD"
if ($PSScriptRoot) {
  $candidate = Split-Path $PSScriptRoot -Parent
  if (Test-Path (Join-Path $candidate "data\evaluadores.json")) { $root = $candidate }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js requerido para build-seed" }

& node --input-type=module -e @"
import fs from 'fs';
import path from 'path';
const root = process.argv[1];
const evalJ = JSON.parse(fs.readFileSync(path.join(root, 'data/evaluadores.json'), 'utf8')).byDni;
const supJ = JSON.parse(fs.readFileSync(path.join(root, 'data/supervisores-cosecha.json'), 'utf8')).byDni;
const trabJ = JSON.parse(fs.readFileSync(path.join(root, 'data/trabajadores.json'), 'utf8')).byDni;
const lotes = JSON.parse(fs.readFileSync(path.join(root, 'data/lotes-licapa.json'), 'utf8'));
const supervisores = {};
for (const [dni, p] of Object.entries(supJ || {})) {
  supervisores[dni] = { nombre: String(p.nombre || ''), cargo: String(p.cargo || '') };
}
const trabajadoresPreview = {};
let n = 0;
const sorted = Object.entries(trabJ || {}).sort((a, b) =>
  String(a[1].nombre || '').localeCompare(String(b[1].nombre || ''))
);
for (const [dni, p] of sorted) {
  trabajadoresPreview[dni] = { nombre: String(p.nombre || ''), cargo: 'COSECHA' };
  if (++n >= 80) break;
}
const seed = { evaluadores: evalJ, supervisores, trabajadoresPreview, lotes };
const out = path.join(root, 'js/catalog-seed.js');
fs.writeFileSync(out, 'window.QB = window.QB || {};\nQB.SEED = ' + JSON.stringify(seed) + ';\n', 'utf8');
console.log('ok bytes=' + fs.statSync(out).size + ' evaluadores=' + Object.keys(evalJ).length + ' lotes=' + lotes.length);
"@ $root
