/**
 * Repara data/trabajadores.json (bloque anónimo inválido + duplicados).
 * Extrae TODAS las apariciones por regex (orden = prioridad de aparición),
 * unifica por DNI prefiriendo COSECHA + nombre real, excluye supervisores.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "data", "trabajadores.json");
const supFile = path.join(root, "data", "supervisores-cosecha.json");

const text = fs.readFileSync(file, "utf8");

const supervisors = new Set();
try {
  const sup = JSON.parse(fs.readFileSync(supFile, "utf8"));
  Object.keys(sup.byDni || {}).forEach((d) => supervisors.add(String(d).padStart(8, "0")));
} catch (_) {}

function unescapeJsonString(s) {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function isCosecha(cargo) {
  const c = String(cargo || "")
    .trim()
    .toUpperCase();
  if (!c) return true;
  if (c.includes("SUPERVISOR")) return false;
  return c === "COSECHA" || c.startsWith("COSECHA");
}

function hasRealName(dni, nombre) {
  const nom = String(nombre || "").trim();
  if (!nom) return false;
  if (nom === dni) return false;
  if (/^\d+$/.test(nom)) return false;
  return nom.length >= 3;
}

function score(dni, nombre, cargo) {
  let s = 0;
  if (hasRealName(dni, nombre)) s += 20;
  if (isCosecha(cargo)) s += 10;
  if (String(cargo || "").toUpperCase() === "COSECHA") s += 3;
  s += Math.min(String(nombre || "").length, 40) / 40;
  return s;
}

function normName(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Extraer cada aparición (puede haber DNI repetido en el archivo roto)
const re =
  /"(\d{7,8})"\s*:\s*\{\s*"nombre"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"cargo"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g;

const appearances = [];
let m;
while ((m = re.exec(text))) {
  const dni = String(m[1]).padStart(8, "0");
  const nombre = unescapeJsonString(m[2]).trim().replace(/\s+/g, " ");
  const cargo = unescapeJsonString(m[3]).trim();
  appearances.push({ dni, nombre, cargo });
}

console.log("appearances", appearances.length);

const byDni = new Map();
let dniConflicts = 0;

for (const row of appearances) {
  const sc = score(row.dni, row.nombre, row.cargo);
  if (!byDni.has(row.dni)) {
    byDni.set(row.dni, { ...row, _score: sc });
    continue;
  }
  dniConflicts++;
  const prev = byDni.get(row.dni);
  if (sc > prev._score) {
    byDni.set(row.dni, { ...row, _score: sc });
  } else if (sc === prev._score) {
    const nombre = hasRealName(row.dni, row.nombre)
      ? row.nombre.length >= prev.nombre.length
        ? row.nombre
        : prev.nombre
      : prev.nombre;
    const cargo = isCosecha(prev.cargo)
      ? prev.cargo
      : isCosecha(row.cargo)
        ? row.cargo
        : prev.cargo || row.cargo;
    byDni.set(row.dni, {
      dni: row.dni,
      nombre,
      cargo,
      _score: score(row.dni, nombre, cargo),
    });
  }
}

// Filtrar a catálogo de cosecha
const keep = {};
let skippedSup = 0;
let skippedCargo = 0;
let skippedBadName = 0;

for (const [dni, p] of byDni) {
  if (supervisors.has(dni)) {
    skippedSup++;
    continue;
  }
  // Si alguna aparición fue COSECHA, ya ganó por score; si no, descartar
  if (!isCosecha(p.cargo)) {
    skippedCargo++;
    continue;
  }
  if (!hasRealName(dni, p.nombre)) {
    skippedBadName++;
    continue;
  }
  keep[dni] = { nombre: p.nombre, cargo: "COSECHA" };
}

// No unificar por nombre: en campo hay homónimos con DNI distinto.
const nameDupExamples = [];
const byName = new Map();
for (const [dni, p] of Object.entries(keep)) {
  const key = normName(p.nombre);
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(dni);
}
for (const [name, dnis] of byName) {
  if (dnis.length > 1) nameDupExamples.push({ name, dnis: [...dnis] });
}

const sorted = {};
Object.keys(keep)
  .sort((a, b) => a.localeCompare(b))
  .forEach((d) => {
    sorted[d] = keep[d];
  });

const out = {
  tipo: "trabajadores",
  uso: "Solo cosecha. Se buscan por DNI en Agregar trabajador. NO poner supervisores aqui.",
  comoAgregar: "Pegar en byDni un DNI de 8 digitos con nombre y cargo COSECHA.",
  source: "reporte-horas.xlsx + trabajadores.xlsx + altas manuales (reparado/unificado)",
  filtro: {
    actividad: "COSECHA",
    excluye: "SUPERVISOR DE COSECHA",
  },
  count: Object.keys(sorted).length,
  updatedAt: new Date().toISOString(),
  byDni: sorted,
};

fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");

// Validar parse
JSON.parse(fs.readFileSync(file, "utf8"));

console.log(
  JSON.stringify(
    {
      ok: true,
      appearances: appearances.length,
      uniqueDniBeforeFilter: byDni.size,
      dniConflicts,
      skippedSup,
      skippedCargo,
      skippedBadName,
      finalCount: out.count,
      becerra: sorted["10147317"],
      sameNameDifferentDni: nameDupExamples.length,
      nameDupExamples: nameDupExamples.slice(0, 15),
    },
    null,
    2
  )
);
