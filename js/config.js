/** Catálogos, umbrales y definición de evaluaciones — Q Berries */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno) */
  _ep: "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4cnI3NGV4a2RnNUtQLURkR3FXWEpWMFNYUFdGOFlac3BDUXdIam4zX2NCQjJGTWk0eURPNTR6Ykk4bElmWS1qajkvZXhlYw==",
  APP_NAME: "Q Berries · Calidad",
  VERSION: "1.1.80",
  /** URL pública HTTPS para QR / instalación Android */
  PUBLIC_URL: "https://calidad-qberries.netlify.app/install.html",
};

QB.CATALOG = {
  variedades: [
    { id: "S. Pop", label: "S. Pop", meta: "Variedad" },
    { id: "Mágica", label: "Mágica", meta: "Variedad" },
  ],
  modulos: Array.from({ length: 10 }, (_, i) => ({
    id: `Módulo ${i + 1}`,
    label: `Módulo ${i + 1}`,
    meta: `M${i + 1}`,
  })),
  turnos: [
    { id: "Mañana", label: "Mañana", meta: "Turno" },
    { id: "Tarde", label: "Tarde", meta: "Turno" },
    { id: "Noche", label: "Noche", meta: "Turno" },
  ],
  evaluacionCaida: [
    { id: "Después de cosecha", label: "Después de cosecha", meta: "Momento" },
  ],
};

/** Defectos por formulario (conteos → %). Clave = id campo */
QB.DEFECTS = {
  calidad: [
    /* ——— Calidad (CAL) ——— */
    { id: "rojizo", label: "Falta de color", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "pedicelo", label: "Pedúnculo adherido", grupo: "CAL", thresholdKey: "pedicelo" },
    { id: "resto_floral", label: "Restos florales", grupo: "CAL", thresholdKey: "resto_floral" },
    { id: "cicatriz", label: "Cicatrices", grupo: "CAL", thresholdKey: "cicatriz" },
    { id: "polen", label: "Polen", grupo: "CAL", thresholdKey: "polen" },
    { id: "sin_bloom", label: "Ausencia de bloom", grupo: "CAL", thresholdKey: "sin_bloom" },
    { id: "russet", label: "Russet", grupo: "CAL", thresholdKey: "russet" },
    { id: "plagas_insectos", label: "Plagas e insectos (Cochinilla, Larva)", grupo: "CAL", thresholdKey: "plagas" },
    { id: "pre_calibre", label: "Pre calibre", grupo: "CAL", thresholdKey: "pre_calibre" },
    { id: "polvo", label: "Polvo", grupo: "CAL", thresholdKey: "polvo" },
    /* ——— Condición (CON) ——— */
    { id: "pudricion", label: "Pudrición o hongo", grupo: "CON", thresholdKey: "pudricion" },
    { id: "picadura_ave", label: "Daño por ave", grupo: "CON", thresholdKey: "picadura_ave" },
    { id: "insercion_pedicelar", label: "Inserción pedicelar", grupo: "CON", thresholdKey: "insercion_pedicelar" },
    { id: "quemadura", label: "Quemadura", grupo: "CON", thresholdKey: "quemadura" },
    { id: "blando", label: "Blando", grupo: "CON", thresholdKey: "blando" },
    { id: "deshidratado", label: "Deshidratación", grupo: "CON", thresholdKey: "deshidratado" },
    { id: "desgarro", label: "Desgarro", grupo: "CON", thresholdKey: "desgarro" },
    { id: "herida_abierta", label: "Herida abierta", grupo: "CON", thresholdKey: "herida_abierta" },
    { id: "dano_sol", label: "Quemadura de sol", grupo: "CON", thresholdKey: "dano_sol" },
    { id: "deshidratado_rojizo", label: "Rojo deshidratado", grupo: "CON", thresholdKey: "deshidratado_rojizo" },
  ],
  descarte: [
    /* Misma matriz 20 defectos — en descarte TODO suma a % calidad (nada a condición) */
    { id: "rojizo", label: "Falta de color", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "pedicelo", label: "Pedúnculo adherido", grupo: "CAL", thresholdKey: "pedicelo" },
    { id: "resto_floral", label: "Restos florales", grupo: "CAL", thresholdKey: "resto_floral" },
    { id: "cicatriz", label: "Cicatrices", grupo: "CAL", thresholdKey: "cicatriz" },
    { id: "polen", label: "Polen", grupo: "CAL", thresholdKey: "polen" },
    { id: "sin_bloom", label: "Ausencia de bloom", grupo: "CAL", thresholdKey: "sin_bloom" },
    { id: "russet", label: "Russet", grupo: "CAL", thresholdKey: "russet" },
    { id: "plagas_insectos", label: "Plagas e insectos (Cochinilla, Larva)", grupo: "CAL", thresholdKey: "plagas" },
    { id: "pre_calibre", label: "Pre calibre", grupo: "CAL", thresholdKey: "pre_calibre" },
    { id: "polvo", label: "Polvo", grupo: "CAL", thresholdKey: "polvo" },
    { id: "pudricion", label: "Pudrición o hongo", grupo: "CAL", thresholdKey: "pudricion" },
    { id: "picadura_ave", label: "Daño por ave", grupo: "CAL", thresholdKey: "picadura_ave" },
    { id: "insercion_pedicelar", label: "Inserción pedicelar", grupo: "CAL", thresholdKey: "insercion_pedicelar" },
    { id: "quemadura", label: "Quemadura", grupo: "CAL", thresholdKey: "quemadura" },
    { id: "blando", label: "Blando", grupo: "CAL", thresholdKey: "blando" },
    { id: "deshidratado", label: "Deshidratación", grupo: "CAL", thresholdKey: "deshidratado" },
    { id: "desgarro", label: "Desgarro", grupo: "CAL", thresholdKey: "desgarro" },
    { id: "herida_abierta", label: "Herida abierta", grupo: "CAL", thresholdKey: "herida_abierta" },
    { id: "dano_sol", label: "Quemadura de sol", grupo: "CAL", thresholdKey: "dano_sol" },
    { id: "deshidratado_rojizo", label: "Rojo deshidratado", grupo: "CAL", thresholdKey: "deshidratado_rojizo" },
  ],
};

/**
 * ═══════════════════════════════════════════════════════════
 * LÓGICA EXACTA DE CALIFICACIÓN (Calidad + Descarte)
 * ═══════════════════════════════════════════════════════════
 * Base oficial: REF = 350 bayas (columnas AZUL de la tabla).
 *
 * 1) Entrada: conteo (N°) y tamaño de muestra (S)
 * 2) Unidades equivalentes a 350:
 *        u = conteo × (350 / S)
 * 3) La calificación se decide SOLO con u vs bandas `unidades`
 *    (Excelente / Bueno / Regular / Malo), rangos inclusivos.
 * 4) El % guardado/mostrado es independiente:
 *        % = (conteo / S) × 100
 * 5) Los % de la matriz se DERIVAN de las unidades (no al revés):
 *        %banda = redondeo1( uBanda × 100 / 350 )
 *    Así unidades y % nunca se desincronizan.
 *
 * Solapes: Excelente↔Bueno → Excelente · Regular↔Malo → Malo.
 * Huecos entre bandas → grado anterior (mejor), salvo flags.
 * ═══════════════════════════════════════════════════════════
 */
QB.THRESHOLDS = {
  REF_SAMPLE: 350,

  /* ——— Calidad ——— */
  // Falta de color
  rojizo: {
    unidades: { excelente: [0, 0], bueno: [1, 3], regular: [4, 5], malo: [6, 150] },
    gapAsBueno: true,
  },
  rojiza: null,

  // Pedúnculo adherido
  pedicelo: {
    unidades: { excelente: [0, 0], bueno: [1, 4.5], regular: [5, 7], malo: [8, 150] },
    overlapWorst: true,
    gapAsBueno: true,
  },

  // Restos florales
  resto_floral: {
    unidades: { excelente: [0, 0], bueno: [1, 4], regular: [4.5, 7], malo: [8, 150] },
    overlapWorst: true,
    gapAsBueno: true,
  },

  // Cicatrices / Polen / Russet (Exc hasta 3% → 10.5 und)
  cicatriz: {
    unidades: { excelente: [0, 10.5], bueno: [9, 13], regular: [14, 18], malo: [19, 150] },
    overlapExcelenteWins: true,
    overlapWorst: true,
    gapAsBueno: true,
  },
  polen: null,
  russet: null,

  // Ausencia de bloom (Exc hasta 1% → 3.5 und)
  sin_bloom: {
    unidades: { excelente: [0, 3.5], bueno: [3, 6], regular: [7, 15], malo: [16, 150] },
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },

  // Plagas: cualquier unidad > 0 = Malo
  plagas: {
    unidades: { excelente: [0, 0], bueno: [0, 0], regular: [0, 0], malo: [0.01, 150] },
    zeroTolerance: true,
  },
  plagas_insectos: null,

  // Pre calibre
  pre_calibre: {
    unidades: { excelente: [0, 0], bueno: [0, 5], regular: [6, 12], malo: [13, 150] },
    gapAsBueno: true,
  },

  // Polvo: ≥5 und@350 = Malo
  polvo: {
    unidades: { excelente: [0, 0], bueno: [0, 0], regular: [0, 0], malo: [5, 150] },
    zeroTolerance: true,
  },

  default_cal: null,
  default: null,

  /* ——— Condición ——— */
  pudricion: {
    unidades: { excelente: [0, 0], bueno: [0, 0], regular: [0, 1], malo: [1.5, 150] },
    zeroTolerance: true,
  },

  picadura_ave: {
    unidades: { excelente: [0, 0], bueno: [0, 0], regular: [1, 1], malo: [2, 150] },
    gapAsBueno: false,
  },

  // Exc hasta 0.5% → 1.75 und
  insercion_pedicelar: {
    unidades: { excelente: [0, 1.75], bueno: [2, 4], regular: [5, 6], malo: [7, 150] },
    gapAsBueno: true,
  },

  // Exc hasta 1.5% → 5.25 und
  quemadura: {
    unidades: { excelente: [0, 5.25], bueno: [6, 9], regular: [10, 15], malo: [16, 150] },
    gapAsBueno: true,
  },

  blando: {
    unidades: { excelente: [0, 0], bueno: [0, 0], regular: [1, 2], malo: [2, 150] },
    overlapWorst: true,
  },

  // Deshidratación / Desgarro / Rojo deshidratado (Exc 0.8% → 2.8 und)
  deshidratado: {
    unidades: { excelente: [0, 2.8], bueno: [0, 2], regular: [3, 4], malo: [5, 150] },
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },
  deshidratada: null,
  desgarro: null,

  // Herida abierta (Exc 0.5% → 1.75 und)
  herida_abierta: {
    unidades: { excelente: [0, 1.75], bueno: [1, 2], regular: [3, 4], malo: [5, 150] },
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },

  // Quemadura de sol / Daño por sol
  dano_sol: {
    unidades: { excelente: [0, 1.75], bueno: [1.5, 2], regular: [3, 4], malo: [5, 150] },
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },

  deshidratado_rojizo: {
    unidades: { excelente: [0, 2.8], bueno: [0, 2], regular: [3, 4], malo: [5, 150] },
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },

  /* Sumas globales siguen en % (no usan unidades 350) */
  suma_cal: {
    excelente: [0, 0],
    bueno: [0.01, 12],
    regular: [12, 20],
    malo: [21, 50],
    overlapBuenoWins: true,
  },
  suma_con: {
    excelente: [0, 0],
    bueno: [0.01, 2],
    regular: [3, 5],
    malo: [6, 50],
    gapAsBueno: true,
  },

  pedicelo_count: { buenoMax: 4, regularMax: 7, byCount: true },
  fruta_buena: { buenoMax: 4, regularMax: 7, byCount: true },
  promedio_caida: { buenoMax: 2, regularMax: 4, byCount: true },
  promedio_planta: { buenoMax: 2, regularMax: 4, byCount: true },
};

/** % = redondeo a 1 decimal de (unidades × 100 / 350) */
function qbPctFromUnits_(u) {
  const ref = Number(QB.THRESHOLDS.REF_SAMPLE) || 350;
  const n = Number(u);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n * 10000) / ref) / 100; // 2 decimales exactos tipo 1.14; tabla usa ~1
}

function qbBandPctFromUnits_(band) {
  if (!band || band.length < 2) return [0, 0];
  return [qbPctFromUnits_(band[0]), qbPctFromUnits_(band[1])];
}

/** Rellena excelente/bueno/regular/malo (%) desde unidades — una sola fuente de verdad */
(function qbSyncPctFromUnidades_() {
  Object.keys(QB.THRESHOLDS).forEach((key) => {
    const t = QB.THRESHOLDS[key];
    if (!t || typeof t !== "object" || !t.unidades) return;
    const U = t.unidades;
    t.excelente = qbBandPctFromUnits_(U.excelente);
    t.bueno = qbBandPctFromUnits_(U.bueno);
    t.regular = qbBandPctFromUnits_(U.regular);
    t.malo = qbBandPctFromUnits_(U.malo);
  });
})();

[
  ["rojiza", "rojizo"],
  ["polen", "cicatriz"],
  ["russet", "cicatriz"],
  ["plagas_insectos", "plagas"],
  ["desgarro", "deshidratado"],
  ["deshidratada", "deshidratado"],
  ["default_cal", "resto_floral"],
  ["default", "resto_floral"],
].forEach(([k, from]) => {
  if (QB.THRESHOLDS[k] === null) QB.THRESHOLDS[k] = QB.THRESHOLDS[from];
});

QB.EVALS = {
  calidad: {
    id: "calidad",
    title: "Evaluación de calidad",
    short: "Cosechadores",
    desc: "Control individual por cosechador",
    sheet: "Calidad",
    accent: "calidad",
  },
  descarte: {
    id: "descarte",
    title: "Evaluación de descarte",
    short: "Descarte",
    desc: "Clasificación de fruta descartada",
    sheet: "Descarte",
    accent: "descarte",
  },
  caida: {
    id: "caida",
    title: "Fruta caída",
    short: "Caída",
    desc: "Frutos caídos en campo",
    sheet: "Fruta Caida",
    accent: "caida",
  },
  planta: {
    id: "planta",
    title: "Fruta en planta",
    short: "En planta",
    desc: "Fruta dejada en la planta",
    sheet: "Fruta Planta",
    accent: "planta",
  },
};
