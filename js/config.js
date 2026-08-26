/** Catálogos, umbrales y definición de evaluaciones — Q Berries */
window.QB = window.QB || {};

QB.CONFIG = {
  /** Endpoint codificado (uso interno) */
  _ep: "aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4cnI3NGV4a2RnNUtQLURkR3FXWEpWMFNYUFdGOFlac3BDUXdIam4zX2NCQjJGTWk0eURPNTR6Ykk4bElmWS1qajkvZXhlYw==",
  APP_NAME: "Q Berries · Calidad",
  VERSION: "1.1.37",
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
    { id: "rojizo", label: "Rojizo", grupo: "CAL" },
    { id: "resto_floral", label: "Resto floral", grupo: "CAL" },
    { id: "excreta_abeja", label: "Excreta de abeja", grupo: "CAL" },
    { id: "pedicelo", label: "Pedicelo", grupo: "CAL" },
    { id: "cicatriz", label: "Cicatriz", grupo: "CAL" },
    { id: "polvo", label: "Polvo", grupo: "CAL" },
    { id: "herida_abierta", label: "Herida abierta", grupo: "CON" },
    { id: "picadura_ave", label: "Picadura de ave", grupo: "CON" },
    { id: "sin_bloom", label: "Sin Bloom", grupo: "CAL" },
    { id: "plagas_insectos", label: "Plagas e insectos (Cochinilla, Larva)", grupo: "CAL" },
    { id: "insercion_pedicelar", label: "Inserción pedicelar", grupo: "CAL" },
  ],
  descarte: [
    { id: "fruta_buena", label: "Fruta buena", grupo: "OK", invert: true },
    { id: "deshidratada", label: "Fruta deshidratada", grupo: "CON", thresholdKey: "deshidratado" },
    { id: "rojiza", label: "Fruta rojiza", grupo: "CAL", thresholdKey: "rojizo" },
    { id: "pedicelo", label: "Pedicelo", grupo: "CAL" },
    { id: "resto_floral", label: "Resto floral", grupo: "CAL" },
    { id: "cicatriz", label: "Cicatriz", grupo: "CAL" },
    { id: "polvo", label: "Polvo", grupo: "CAL" },
    { id: "desgarro", label: "Desgarro", grupo: "CON" },
    { id: "picadura_ave", label: "Picadura de ave", grupo: "CON" },
    { id: "sin_bloom", label: "Sin Bloom", grupo: "CAL" },
    { id: "excreta_abeja", label: "Excreta de abeja", grupo: "CAL" },
  ],
};

/**
 * Umbrales oficiales — Calidad/Descarte: % defecto (tabla).
 * Caída/Planta: promedio frutos/planta (misma escala Excelente→Malo).
 * 0 → Excelente | ≤ buenoMax → Bueno | ≤ regularMax → Regular | > regularMax → Malo
 */
QB.THRESHOLDS = {
  // CAL estándar: Exc 0 · Bueno 1–5 · Regular 6–12 · Malo 13+
  default: { buenoMax: 5, regularMax: 12 },
  rojizo: { buenoMax: 5, regularMax: 12 },
  rojiza: { buenoMax: 5, regularMax: 12 },
  pedicelo: { buenoMax: 5, regularMax: 12 },
  resto_floral: { buenoMax: 5, regularMax: 12 },
  cicatriz: { buenoMax: 5, regularMax: 12 },
  polvo: { buenoMax: 5, regularMax: 12 },
  sin_bloom: { buenoMax: 5, regularMax: 12 },
  // Plagas / excreta: Exc 0 · Bueno 1–2 · Regular 3–4 · Malo 5+
  excreta_abeja: { buenoMax: 2, regularMax: 4 },
  plagas_insectos: { buenoMax: 2, regularMax: 4 },
  // CAL estándar también: inserción pedicelar
  insercion_pedicelar: { buenoMax: 5, regularMax: 12 },
  // CON — Deshidratación / Desgarro / Herida: Exc 0 · Bueno 1–2 · Regular 3–5 · Malo 6+
  desgarro: { buenoMax: 2, regularMax: 5 },
  deshidratado: { buenoMax: 2, regularMax: 5 },
  deshidratada: { buenoMax: 2, regularMax: 5 },
  herida_abierta: { buenoMax: 2, regularMax: 5 },
  // Blando: Exc/Bueno 0 · Regular 1–2 · Malo >2
  blando: { buenoMax: 0, regularMax: 2 },
  // Picadura de ave: Exc/Bueno 0 · Regular 1 · Malo ≥2
  picadura_ave: { buenoMax: 0, regularMax: 1 },
  // Sumas oficiales
  suma_cal: { buenoMax: 12, regularMax: 20 },
  suma_con: { buenoMax: 2, regularMax: 5 },
  promedio_caida: { buenoMax: 2, regularMax: 5 },
  promedio_planta: { buenoMax: 3, regularMax: 6 },
};

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
