/** Catálogos, umbrales y definición de evaluaciones — Q Berries */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno) */
  _ep: "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4cnI3NGV4a2RnNUtQLURkR3FXWEpWMFNYUFdGOFlac3BDUXdIam4zX2NCQjJGTWk0eURPNTR6Ykk4bElmWS1qajkvZXhlYw==",
  APP_NAME: "Q Berries · Calidad",
  VERSION: "1.1.61",
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
    { id: "blando", label: "Blando", grupo: "CON" },
    { id: "desgarro", label: "Desgarro", grupo: "CON" },
    { id: "deshidratado", label: "Deshidratado", grupo: "CON" },
    { id: "rojizo", label: "Rojizo", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "resto_floral", label: "Resto floral", grupo: "CAL", thresholdKey: "default_cal" },
    { id: "polen", label: "Polen", grupo: "CAL", thresholdKey: "default_cal" },
    { id: "pedicelo", label: "Pedicelo", grupo: "CAL", rateByCount: true, thresholdKey: "pedicelo" },
    { id: "cicatriz", label: "Cicatriz", grupo: "CAL", thresholdKey: "default_cal" },
    { id: "polvo", label: "Polvo", grupo: "CAL", thresholdKey: "default_cal" },
    { id: "herida_abierta", label: "Herida abierta", grupo: "CON", thresholdKey: "herida_abierta" },
    { id: "picadura_ave", label: "Picadura de ave", grupo: "CON", thresholdKey: "picadura_ave" },
    { id: "sin_bloom", label: "Sin Bloom", grupo: "CAL", thresholdKey: "default_cal" },
    { id: "plagas_insectos", label: "Plagas e insectos (Cochinilla, Larva)", grupo: "CAL", thresholdKey: "plagas" },
    { id: "insercion_pedicelar", label: "Inserción pedicelar", grupo: "CAL", thresholdKey: "default_cal" },
  ],
  descarte: [
    // Solo estos tienen calificación (Bueno/Malo…). El resto es solo conteo.
    { id: "fruta_buena", label: "Fruta buena", grupo: "OK", rateByCount: true, thresholdKey: "fruta_buena" },
    { id: "deshidratada", label: "Fruta deshidratada", grupo: "CAL", noRate: true },
    { id: "rojiza", label: "Fruta rojiza", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "pedicelo", label: "Pedicelo", grupo: "CAL", rateByCount: true, thresholdKey: "pedicelo" },
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
 * Umbrales oficiales (% defecto).
 * Cada clave define bandas [min, max] inclusivas.
 * Valores entre bueno y regular (ej. 2.01–2.99 en desgarro) → Bueno.
 * Solapes en límites (ej. suma cal en 12) → Bueno.
 */
QB.THRESHOLDS = {
  // Defectos de calidad estándar: Exc 0 · Bueno 1–5 · Regular 6–12 · Malo 13–50
  default_cal: {
    bueno: [1, 5],
    regular: [6, 12],
    malo: [13, 50],
  },
  default: null, // alias set below
  resto_floral: null,
  cicatriz: null,
  polvo: null,
  sin_bloom: null,
  insercion_pedicelar: null,
  rojizo: {
    bueno: [1, 5],
    regular: [6, 12],
    malo: [13, 50],
  },
  rojiza: null,

  // Plagas: Exc 0 · Bueno 1–2 · Regular 3–4 · Malo 5–50
  plagas: {
    bueno: [1, 2],
    regular: [3, 4],
    malo: [5, 50],
  },
  plagas_insectos: null,
  polen: null,

  // Deshidratación / Desgarro / Herida: Exc 0 · Bueno 1–2 · Regular 3–5 · Malo 6–50
  cond_estandar: {
    bueno: [1, 2],
    regular: [3, 5],
    malo: [6, 50],
    gapAsBueno: true,
  },
  desgarro: null,
  deshidratado: null,
  deshidratada: null,
  herida_abierta: null,

  // Blando: Exc/Bueno 0 · Regular 1–2 · Malo ≥3
  blando: {
    bueno: [0, 0],
    regular: [1, 2],
    malo: [3, 50],
  },

  // Daño por ave: Exc/Bueno 0 · Regular 1 · Malo 2–50
  picadura_ave: {
    bueno: [0, 0],
    regular: [1, 1],
    malo: [2, 50],
  },

  // Sumas
  suma_cal: {
    bueno: [1, 12],
    regular: [12, 20],
    malo: [21, 50],
    overlapBuenoWins: true,
  },
  suma_con: {
    bueno: [1, 2],
    regular: [3, 5],
    malo: [6, 50],
    gapAsBueno: true,
  },

  // Pedicelo / fruta buena (bayas, no %)
  pedicelo: { buenoMax: 4, regularMax: 7, byCount: true },
  fruta_buena: { buenoMax: 4, regularMax: 7, byCount: true },

  // Caída / planta (bayas por planta, escala conteo)
  promedio_caida: { buenoMax: 2, regularMax: 4, byCount: true },
  promedio_planta: { buenoMax: 2, regularMax: 4, byCount: true },
};

[
  "default",
  "resto_floral",
  "cicatriz",
  "polvo",
  "sin_bloom",
  "insercion_pedicelar",
  "rojiza",
  "plagas_insectos",
  "polen",
  "desgarro",
  "deshidratado",
  "deshidratada",
  "herida_abierta",
].forEach((k) => {
  if (QB.THRESHOLDS[k] === null) {
    QB.THRESHOLDS[k] =
      k === "rojiza"
        ? QB.THRESHOLDS.rojizo
        : k === "polen"
          ? QB.THRESHOLDS.default_cal
          : k === "plagas_insectos"
            ? QB.THRESHOLDS.plagas
            : k === "desgarro" || k === "deshidratado" || k === "deshidratada" || k === "herida_abierta"
              ? QB.THRESHOLDS.cond_estandar
              : QB.THRESHOLDS.default_cal;
  }
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
