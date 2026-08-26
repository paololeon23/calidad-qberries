/** Catálogos, umbrales y definición de evaluaciones — Q Berries */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno) */
  _ep: "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4cnI3NGV4a2RnNUtQLURkR3FXWEpWMFNYUFdGOFlac3BDUXdIam4zX2NCQjJGTWk0eURPNTR6Ykk4bElmWS1qajkvZXhlYw==",
  APP_NAME: "Q Berries · Calidad",
  VERSION: "1.1.65",
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
    { id: "Antes de cosecha", label: "Antes de cosecha", meta: "Momento" },
    { id: "Después de cosecha", label: "Después de cosecha", meta: "Momento" },
  ],
};

/** Defectos por formulario (conteos → %). Clave = id campo */
QB.DEFECTS = {
  calidad: [
    { id: "blando", label: "Blando", grupo: "CON", thresholdKey: "blando" },
    { id: "desgarro", label: "Desgarro", grupo: "CON", thresholdKey: "desgarro" },
    { id: "deshidratado", label: "Deshidratado", grupo: "CON", thresholdKey: "deshidratado" },
    { id: "rojizo", label: "Rojizo", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "resto_floral", label: "Resto floral", grupo: "CAL", thresholdKey: "resto_floral" },
    { id: "polen", label: "Polen", grupo: "CAL", thresholdKey: "polen" },
    { id: "pedicelo", label: "Pedicelo", grupo: "CAL", thresholdKey: "pedicelo" },
    { id: "cicatriz", label: "Cicatriz", grupo: "CAL", thresholdKey: "cicatriz" },
    { id: "polvo", label: "Polvo", grupo: "CAL", thresholdKey: "polvo" },
    { id: "herida_abierta", label: "Herida abierta", grupo: "CON", thresholdKey: "herida_abierta" },
    { id: "picadura_ave", label: "Picadura de ave", grupo: "CON", thresholdKey: "picadura_ave" },
    { id: "sin_bloom", label: "Sin Bloom", grupo: "CAL", thresholdKey: "sin_bloom" },
    { id: "plagas_insectos", label: "Plagas e insectos (Cochinilla, Larva)", grupo: "CAL", thresholdKey: "plagas" },
    { id: "insercion_pedicelar", label: "Inserción pedicelar", grupo: "CON", thresholdKey: "insercion_pedicelar" },
  ],
  descarte: [
    // Solo estos tienen calificación (Bueno/Malo…). El resto es solo conteo.
    { id: "fruta_buena", label: "Fruta buena", grupo: "OK", rateByCount: true, thresholdKey: "fruta_buena" },
    { id: "deshidratada", label: "Fruta deshidratada", grupo: "CAL", noRate: true },
    { id: "rojiza", label: "Fruta rojiza", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "pedicelo", label: "Pedicelo", grupo: "CAL", rateByCount: true, thresholdKey: "pedicelo_count" },
    { id: "resto_floral", label: "Resto floral", grupo: "CAL", noRate: true },
    { id: "cicatriz", label: "Cicatriz", grupo: "CAL", noRate: true },
    { id: "polvo", label: "Polvo", grupo: "CAL", noRate: true },
    { id: "desgarro", label: "Desgarro", grupo: "CAL", noRate: true },
    { id: "picadura_ave", label: "Picadura de ave", grupo: "CAL", noRate: true },
    { id: "sin_bloom", label: "Sin Bloom", grupo: "CAL", noRate: true },
    { id: "polen", label: "Polen", grupo: "CAL", noRate: true },
  ],
};

/**
 * Destino USA/EU/ASIA — rangos % [mín, máx] inclusivos.
 * Solape Excelente↔Bueno → Excelente · Regular↔Malo → Malo.
 * Huecos entre bandas → grado anterior (mejor).
 */
QB.THRESHOLDS = {
  // Falta de color (Rojizo)
  rojizo: {
    excelente: [0, 0],
    bueno: [0.3, 1.4],
    regular: [1.7, 3.4],
    malo: [4, 43],
    gapAsBueno: true,
  },
  rojiza: null,

  // Pedúnculo adherido (Pedicelo %) — calidad
  pedicelo: {
    excelente: [0, 0],
    bueno: [0.3, 1.3],
    regular: [1.4, 2.0],
    malo: [2, 43],
    gapAsBueno: true,
  },

  // Restos florales
  resto_floral: {
    excelente: [0, 0],
    bueno: [0.3, 1.1],
    regular: [1.3, 2.0],
    malo: [2, 43],
    gapAsBueno: true,
  },

  // Cicatrices / Polen / Russet
  cicatriz: {
    excelente: [0, 3],
    bueno: [2.6, 3.7],
    regular: [4.0, 5.1],
    malo: [5, 43],
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },
  polen: null,
  russet: null,

  // Ausencia de bloom
  sin_bloom: {
    excelente: [0, 1],
    bueno: [0.9, 1.7],
    regular: [2.0, 4.3],
    malo: [5, 43],
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },

  // Plagas: tolerancia 0 — cualquier % > 0 = Malo
  plagas: {
    excelente: [0, 0],
    bueno: [0, 0],
    regular: [0, 0],
    malo: [0.01, 43],
    zeroTolerance: true,
  },
  plagas_insectos: null,

  // Polvo: 0 Excelente · ≥1% Malo
  polvo: {
    excelente: [0, 0],
    bueno: [0, 0],
    regular: [0, 0],
    malo: [1, 43],
    zeroTolerance: true,
  },

  // Pre calibre (si se usa)
  pre_calibre: {
    excelente: [0, 0],
    bueno: [0, 1.4],
    regular: [1.7, 3.4],
    malo: [4, 43],
    gapAsBueno: true,
  },

  default_cal: null,
  default: null,

  // ——— Condición ———
  // Pudrición o hongo
  pudricion: {
    excelente: [0, 0],
    bueno: [0, 0],
    regular: [0, 0.3],
    malo: [0.4, 42.9],
    zeroTolerance: true,
  },

  // Daño por ave
  picadura_ave: {
    excelente: [0, 0],
    bueno: [0, 0],
    regular: [0.3, 0.3],
    malo: [0.6, 42.9],
    gapAsBueno: false,
  },

  // Inserción pedicelar (condición)
  insercion_pedicelar: {
    excelente: [0, 0.5],
    bueno: [0.6, 1.1],
    regular: [1.4, 1.7],
    malo: [2.0, 42.9],
    gapAsBueno: true,
  },

  // Quemadura / Deshidratación / Desgarro
  desgarro: {
    excelente: [0, 1.5],
    bueno: [1.7, 2.6],
    regular: [2.9, 4.3],
    malo: [4.6, 42.9],
    gapAsBueno: true,
  },
  deshidratado: null,
  deshidratada: null,
  quemadura: null,

  // Blando: Regular 0.3–0.6 · Malo ≥0.6 (en 0.6 → Malo)
  blando: {
    excelente: [0, 0],
    bueno: [0, 0],
    regular: [0.3, 0.6],
    malo: [0.6, 42.9],
    overlapWorst: true,
  },

  // Herida abierta
  herida_abierta: {
    excelente: [0, 0.5],
    bueno: [0.4, 0.9],
    regular: [1.1, 2.6],
    malo: [2.9, 42.9],
    overlapExcelenteWins: true,
    gapAsBueno: true,
  },

  // Sumas (Excelente solo en 0; escala operativa para resto)
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

  // Descarte: pedicelo / fruta buena por bayas
  pedicelo_count: { buenoMax: 4, regularMax: 7, byCount: true },
  fruta_buena: { buenoMax: 4, regularMax: 7, byCount: true },

  // Caída / planta (bayas por planta)
  promedio_caida: { buenoMax: 2, regularMax: 4, byCount: true },
  promedio_planta: { buenoMax: 2, regularMax: 4, byCount: true },
};

[
  ["rojiza", "rojizo"],
  ["polen", "cicatriz"],
  ["russet", "cicatriz"],
  ["plagas_insectos", "plagas"],
  ["deshidratado", "desgarro"],
  ["deshidratada", "desgarro"],
  ["quemadura", "desgarro"],
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
