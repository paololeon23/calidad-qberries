/**
 * Q Berries · Calidad — Google Apps Script
 * ------------------------------------------------------------
 * Patrón seguro (igual que Guías):
 * - LockService: un POST a la vez
 * - CacheService + Client ID: anti-duplicado solo en reintento de red
 * - Marca caché SOLO después de escribir en Sheet
 * - Cada guardado = UNA fila nueva (nunca pisa)
 *
 * SETUP:
 * 1) Sheet destino → Extensiones → Apps Script → pega este archivo
 * 2) Ejecuta UNA vez: setupSheets()
 * 3) Implementar → Nueva implementación → Web App (Yo + Cualquier persona)
 * 4) URL …/exec → js/config.js → API_URL
 */

var COL = {
  /** Común a las 4 evaluaciones */
  meta: ['Fecha', 'Evaluador', 'Supervisor'],
  cosechador: ['Cosechador'],
  ubicacion: ['Variedad', 'Lote', 'Módulo', 'Turno'],
  resultado: ['Puntos totales', 'Nota', 'Calificación global'],
  cierre: ['Comentario', 'Hora registro']
};

var SHEETS = {
  /** Orden: datos → resultados → Cal. → N° (unidades) → % → comentario / hora */
  calidad: {
    name: 'Calidad',
    headers: COL.meta.concat(COL.cosechador, COL.ubicacion, [
      'Tamaño muestra',
      'Puntos Calidad', 'Puntos Condición', 'Puntos Calidad def.'
    ], COL.resultado, [
      'Cal. Falta de color', 'Cal. Pedúnculo adherido', 'Cal. Restos florales', 'Cal. Cicatrices',
      'Cal. Polen', 'Cal. Ausencia de bloom', 'Cal. Russet', 'Cal. Plagas',
      'Cal. Pre calibre', 'Cal. Polvo',
      'Cal. Pudrición', 'Cal. Daño ave', 'Cal. Inserción pedicelar', 'Cal. Quemadura',
      'Cal. Blando', 'Cal. Deshidratación', 'Cal. Desgarro', 'Cal. Herida',
      'Cal. Quemadura de sol', 'Cal. Rojo deshidratado',
      'N° Falta de color', 'N° Pedúnculo adherido', 'N° Restos florales', 'N° Cicatrices',
      'N° Polen', 'N° Ausencia de bloom', 'N° Russet', 'N° Plagas e insectos',
      'N° Pre calibre', 'N° Polvo',
      'N° Pudrición', 'N° Daño ave', 'N° Inserción pedicelar', 'N° Quemadura',
      'N° Blando', 'N° Deshidratación', 'N° Desgarro', 'N° Herida abierta',
      'N° Quemadura de sol', 'N° Rojo deshidratado',
      '% Falta de color', '% Pedúnculo adherido', '% Restos florales', '% Cicatrices',
      '% Polen', '% Ausencia de bloom', '% Russet', '% Plagas e insectos',
      '% Pre calibre', '% Polvo',
      '% Pudrición', '% Daño ave', '% Inserción pedicelar', '% Quemadura',
      '% Blando', '% Deshidratación', '% Desgarro', '% Herida abierta',
      '% Quemadura de sol', '% Rojo deshidratado',
      '% Suma def. calidad', '% Suma def. condición', '% Tot. defectos', '% Calidad'
    ], COL.cierre)
  },
  descarte: {
    name: 'Descarte',
    headers: COL.meta.concat(COL.ubicacion, [
      'Tamaño muestra'
    ], COL.resultado, [
      /* Misma matriz 20 defectos que Calidad */
      'Cal. Falta de color', 'Cal. Pedúnculo adherido', 'Cal. Restos florales', 'Cal. Cicatrices',
      'Cal. Polen', 'Cal. Ausencia de bloom', 'Cal. Russet', 'Cal. Plagas',
      'Cal. Pre calibre', 'Cal. Polvo',
      'Cal. Pudrición', 'Cal. Daño ave', 'Cal. Inserción pedicelar', 'Cal. Quemadura',
      'Cal. Blando', 'Cal. Deshidratación', 'Cal. Desgarro', 'Cal. Herida',
      'Cal. Quemadura de sol', 'Cal. Rojo deshidratado',
      'N° Falta de color', 'N° Pedúnculo adherido', 'N° Restos florales', 'N° Cicatrices',
      'N° Polen', 'N° Ausencia de bloom', 'N° Russet', 'N° Plagas e insectos',
      'N° Pre calibre', 'N° Polvo',
      'N° Pudrición', 'N° Daño ave', 'N° Inserción pedicelar', 'N° Quemadura',
      'N° Blando', 'N° Deshidratación', 'N° Desgarro', 'N° Herida abierta',
      'N° Quemadura de sol', 'N° Rojo deshidratado',
      '% Falta de color', '% Pedúnculo adherido', '% Restos florales', '% Cicatrices',
      '% Polen', '% Ausencia de bloom', '% Russet', '% Plagas e insectos',
      '% Pre calibre', '% Polvo',
      '% Pudrición', '% Daño ave', '% Inserción pedicelar', '% Quemadura',
      '% Blando', '% Deshidratación', '% Desgarro', '% Herida abierta',
      '% Quemadura de sol', '% Rojo deshidratado',
      '% Suma def. calidad', '% Suma def. condición', '% Tot. defectos', '% Calidad'
    ], COL.cierre)
  },
  caida: {
    name: 'Fruta Caida',
    headers: COL.meta.concat(COL.cosechador, COL.ubicacion, [
      'Momento evaluación',
      'Plantas evaluadas', 'Frutos caídos', 'Frutos caídos verdes', 'Promedio frutos/planta'
    ], COL.resultado, COL.cierre)
  },
  planta: {
    name: 'Fruta Planta',
    headers: COL.meta.concat(COL.cosechador, COL.ubicacion, [
      'Plantas evaluadas', 'N° frutos en planta', 'Promedio frutos/planta'
    ], COL.resultado, COL.cierre)
  }
};

var CACHE_TTL_SEC = 21600; // 6 h — mismo criterio que Guías

/**
 * Columnas que el frontend ya no usa (nombres viejos).
 * Se renombran/fusionan primero; lo que sobra se borra al compactar.
 */
var OBSOLETE_COLS = [
  'Marca temporal',
  'Client ID',
  'Ptos. Tot',
  'Pun. Calidad',
  'Ptos. Condición',
  'Ptos. Calidad def.',
  'Jabas / Tamaño muestra',
  /* Descarte / matriz antigua */
  'Cal. Fruta buena', 'N° Fruta buena', '% Fruta buena',
  'Cal. Deshidratada', 'N° Deshidratada', '% Deshidratada',
  'Cal. Rojiza', 'N° Rojiza', '% Rojiza',
  'Cal. Rojizo', 'N° Rojizo', '% Rojizo',
  'Cal. Pedicelo', 'N° Pedicelo', '% Pedicelo',
  'Cal. Resto floral', 'N° Resto floral', '% Resto floral',
  'Cal. Cicatriz', 'N° Cicatriz', '% Cicatriz',
  'Cal. Sin Bloom', 'N° Sin Bloom', '% Sin Bloom',
  'Cal. Ave', 'N° Picadura ave', '% Picadura ave',
  'Cal. Deshidratado', 'N° Deshidratado', '% Deshidratado',
  'Cal. Daño sol', 'N° Daño sol', '% Daño sol',
  'Cal. Deshidratado rojizo', 'N° Deshidratado rojizo', '% Deshidratado rojizo',
  'Cal. Excreta', 'N° Excreta abeja', '% Excreta abeja',
  'Cal. Herida abierta' /* oficial es Cal. Herida */
];

/** Renombres suaves: datos viejos → nombre actual del frontend */
var RENAME_COLS = [
  ['Ptos. Tot', 'Puntos totales'],
  ['Pun. Calidad', 'Puntos Calidad'],
  ['Ptos. Condición', 'Puntos Condición'],
  ['Ptos. Calidad def.', 'Puntos Calidad def.'],
  ['% Excreta abeja', '% Polen'],
  ['Cal. Excreta', 'Cal. Polen'],
  ['N° Excreta abeja', 'N° Polen'],
  ['Cal. Rojizo', 'Cal. Falta de color'],
  ['Cal. Rojiza', 'Cal. Falta de color'],
  ['N° Rojizo', 'N° Falta de color'],
  ['N° Rojiza', 'N° Falta de color'],
  ['% Rojizo', '% Falta de color'],
  ['% Rojiza', '% Falta de color'],
  ['Cal. Pedicelo', 'Cal. Pedúnculo adherido'],
  ['N° Pedicelo', 'N° Pedúnculo adherido'],
  ['% Pedicelo', '% Pedúnculo adherido'],
  ['Cal. Resto floral', 'Cal. Restos florales'],
  ['N° Resto floral', 'N° Restos florales'],
  ['% Resto floral', '% Restos florales'],
  ['Cal. Cicatriz', 'Cal. Cicatrices'],
  ['N° Cicatriz', 'N° Cicatrices'],
  ['% Cicatriz', '% Cicatrices'],
  ['Cal. Sin Bloom', 'Cal. Ausencia de bloom'],
  ['N° Sin Bloom', 'N° Ausencia de bloom'],
  ['% Sin Bloom', '% Ausencia de bloom'],
  ['Cal. Ave', 'Cal. Daño ave'],
  ['N° Picadura ave', 'N° Daño ave'],
  ['% Picadura ave', '% Daño ave'],
  ['Cal. Deshidratado', 'Cal. Deshidratación'],
  ['N° Deshidratado', 'N° Deshidratación'],
  ['N° Deshidratada', 'N° Deshidratación'],
  ['% Deshidratado', '% Deshidratación'],
  ['% Deshidratada', '% Deshidratación'],
  ['Cal. Deshidratada', 'Cal. Deshidratación'],
  ['Cal. Daño sol', 'Cal. Quemadura de sol'],
  ['N° Daño sol', 'N° Quemadura de sol'],
  ['% Daño sol', '% Quemadura de sol'],
  ['Cal. Deshidratado rojizo', 'Cal. Rojo deshidratado'],
  ['N° Deshidratado rojizo', 'N° Rojo deshidratado'],
  ['% Deshidratado rojizo', '% Rojo deshidratado'],
  ['Cal. Herida abierta', 'Cal. Herida']
];

/**
 * Prepara hojas: renombra → mueve data → borra obsoletos → deja SOLO
 * el orden oficial (sin huecos ni columnas sueltas).
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keys = Object.keys(SHEETS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var def = SHEETS[key];
    var sheet = ensureSheet_(ss, def.name, def.headers);
    syncHeaders_(sheet, def.headers);
    if (key === 'calidad' || key === 'descarte') {
      backfillUnitsFromPct_(sheet);
    }
  }
}

function doGet(e) {
  e = e || { parameter: {} };
  var action = String((e.parameter && e.parameter.action) || 'ping').trim();
  if (action === 'ping') {
    return json_({ ok: true, api: 'calidad', ts: nowIso_(), version: '1.1.22' });
  }
  return json_({ ok: true, api: 'calidad', version: '1.1.22', sheets: Object.keys(SHEETS) });
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = String(body.action || 'save').trim();
    if (action === 'ping') {
      return json_({ ok: true, api: 'calidad', ts: nowIso_() });
    }
    var result = saveEvaluation_(body);
    return json_(result);
  } catch (err) {
    var msg = String(err && err.message ? err.message : err).replace(/^Error:\s*/i, '');
    return json_({ ok: false, error: msg });
  }
}

/** Clave de caché por Client ID (reintento de red del mismo envío) */
function clientIdKey_(clientId) {
  return 'qbcal:' + String(clientId || '').trim();
}

/** Solo LEE caché — nunca marca aquí */
function isDuplicateClient_(clientId) {
  var id = String(clientId || '').trim();
  if (!id) return false;
  try {
    if (CacheService.getScriptCache().get(clientIdKey_(id))) return true;
  } catch (_) {}
  return false;
}

/** Marcar solo cuando el Sheet ya se escribió */
function markClientIdDone_(clientId) {
  var id = String(clientId || '').trim();
  if (!id) return;
  try {
    CacheService.getScriptCache().put(clientIdKey_(id), '1', CACHE_TTL_SEC);
  } catch (_) {}
}

function saveEvaluation_(body) {
  body = body || {};
  var type = body.type;
  if (!SHEETS[type]) throw new Error('Tipo de evaluación inválido: ' + type);

  var clientId = String(body.clientId || '').trim();
  if (!clientId) throw new Error('Falta clientId (idempotencia)');

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(8000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    if (isDuplicateClient_(clientId)) {
      return {
        ok: true,
        api: 'calidad',
        created: false,
        duplicate: true,
        clientId: clientId
      };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var def = SHEETS[type];
    var sheet = ensureSheet_(ss, def.name, def.headers);

    var data = body.data || {};
    var score = body.score || {};
    var stamp = new Date();
    var rowMap = buildRow_(type, data, score, stamp, body.submittedAt);

    // Compacta a orden oficial (mueve data, sin huecos) y escribe
    syncHeaders_(sheet, def.headers);
    var headers = def.headers;
    var row = headers.map(function (h) {
      return rowMap.hasOwnProperty(h) ? rowMap[h] : '';
    });

    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, row.length).setValues([row]);

    markClientIdDone_(clientId);

    return {
      ok: true,
      api: 'calidad',
      created: true,
      duplicate: false,
      sheet: def.name,
      row: newRow,
      clientId: clientId
    };
  } finally {
    if (got) {
      try {
        lock.releaseLock();
      } catch (_) {}
    }
  }
}

function buildRow_(type, data, score, stamp, submittedAt) {
  var rowsById = {};
  (score.rows || []).forEach(function (r) { rowsById[r.id] = r; });

  /** % siempre numérico: si no llega data → 0 */
  function p(id) {
    var r = rowsById[id];
    if (r && r.pct != null && !isNaN(Number(r.pct))) return Number(r.pct);
    return pct_(data[id], data.tamano_muestra);
  }
  /**
   * Unidades (conteo): si no llega N° pero sí hay %,
   * se deduce: N° = redondeo(% × tamaño_muestra / 100)
   */
  function n(id) {
    var v = data[id];
    if (v !== '' && v != null) {
      var num = Number(v);
      if (!isNaN(num)) return num;
    }
    var pctVal = p(id);
    var sample = Number(data.tamano_muestra) || 0;
    if (sample > 0 && pctVal != null && !isNaN(pctVal) && Number(pctVal) !== 0) {
      return Math.round((Number(pctVal) / 100) * sample);
    }
    return 0;
  }
  function cal(id) {
    var r = rowsById[id];
    return r && r.calificacion ? r.calificacion : '';
  }
  function numOr0_(v) {
    return v != null && !isNaN(Number(v)) ? Number(v) : 0;
  }

  var base = {
    'Fecha': data.fecha || '',
    'Evaluador': data.evaluador || '',
    'Supervisor': data.supervisor || '',
    'Variedad': data.variedad || '',
    'Lote': data.lote || '',
    'Módulo': data.modulo || '',
    'Turno': data.turno || '',
    'Puntos totales': score.ptsTot != null ? score.ptsTot : '',
    'Nota': score.nota != null ? score.nota : '',
    'Calificación global': score.calidadGlobal || '',
    'Comentario': data.comentario || '',
    'Hora registro': formatHora_(submittedAt || stamp)
  };

  if (type === 'calidad') {
    return Object.assign(base, {
      'Cosechador': data.cosechador || '',
      'Tamaño muestra': data.tamano_muestra || '',
      'N° Falta de color': n('rojizo'),
      'N° Pedúnculo adherido': n('pedicelo'),
      'N° Restos florales': n('resto_floral'),
      'N° Cicatrices': n('cicatriz'),
      'N° Polen': n('polen'),
      'N° Ausencia de bloom': n('sin_bloom'),
      'N° Russet': n('russet'),
      'N° Plagas e insectos': n('plagas_insectos'),
      'N° Pre calibre': n('pre_calibre'),
      'N° Polvo': n('polvo'),
      'N° Pudrición': n('pudricion'),
      'N° Daño ave': n('picadura_ave'),
      'N° Inserción pedicelar': n('insercion_pedicelar'),
      'N° Quemadura': n('quemadura'),
      'N° Blando': n('blando'),
      'N° Deshidratación': n('deshidratado'),
      'N° Desgarro': n('desgarro'),
      'N° Herida abierta': n('herida_abierta'),
      'N° Quemadura de sol': n('dano_sol'),
      'N° Rojo deshidratado': n('deshidratado_rojizo'),
      '% Falta de color': p('rojizo'),
      '% Pedúnculo adherido': p('pedicelo'),
      '% Restos florales': p('resto_floral'),
      '% Cicatrices': p('cicatriz'),
      '% Polen': p('polen'),
      '% Ausencia de bloom': p('sin_bloom'),
      '% Russet': p('russet'),
      '% Plagas e insectos': p('plagas_insectos'),
      '% Pre calibre': p('pre_calibre'),
      '% Polvo': p('polvo'),
      '% Pudrición': p('pudricion'),
      '% Daño ave': p('picadura_ave'),
      '% Inserción pedicelar': p('insercion_pedicelar'),
      '% Quemadura': p('quemadura'),
      '% Blando': p('blando'),
      '% Deshidratación': p('deshidratado'),
      '% Desgarro': p('desgarro'),
      '% Herida abierta': p('herida_abierta'),
      '% Quemadura de sol': p('dano_sol'),
      '% Rojo deshidratado': p('deshidratado_rojizo'),
      '% Suma def. calidad': numOr0_(score.sumaDefCal),
      '% Suma def. condición': numOr0_(score.sumaDefCon),
      '% Tot. defectos': numOr0_(score.sumaDefectos),
      '% Calidad': score.pctCalidad != null ? Number(score.pctCalidad) : 100,
      'Puntos Calidad': score.nota != null ? score.nota : '',
      'Puntos Condición': ptsGrupo_(score.rows, 'CON'),
      'Puntos Calidad def.': ptsGrupo_(score.rows, 'CAL'),
      'Cal. Falta de color': cal('rojizo'),
      'Cal. Pedúnculo adherido': cal('pedicelo'),
      'Cal. Restos florales': cal('resto_floral'),
      'Cal. Cicatrices': cal('cicatriz'),
      'Cal. Polen': cal('polen'),
      'Cal. Ausencia de bloom': cal('sin_bloom'),
      'Cal. Russet': cal('russet'),
      'Cal. Plagas': cal('plagas_insectos'),
      'Cal. Pre calibre': cal('pre_calibre'),
      'Cal. Polvo': cal('polvo'),
      'Cal. Pudrición': cal('pudricion'),
      'Cal. Daño ave': cal('picadura_ave'),
      'Cal. Inserción pedicelar': cal('insercion_pedicelar'),
      'Cal. Quemadura': cal('quemadura'),
      'Cal. Blando': cal('blando'),
      'Cal. Deshidratación': cal('deshidratado'),
      'Cal. Desgarro': cal('desgarro'),
      'Cal. Herida': cal('herida_abierta'),
      'Cal. Quemadura de sol': cal('dano_sol'),
      'Cal. Rojo deshidratado': cal('deshidratado_rojizo')
    });
  }

  if (type === 'descarte') {
    return Object.assign(base, {
      'Tamaño muestra': data.tamano_muestra || '',
      'N° Falta de color': n('rojizo'),
      'N° Pedúnculo adherido': n('pedicelo'),
      'N° Restos florales': n('resto_floral'),
      'N° Cicatrices': n('cicatriz'),
      'N° Polen': n('polen'),
      'N° Ausencia de bloom': n('sin_bloom'),
      'N° Russet': n('russet'),
      'N° Plagas e insectos': n('plagas_insectos'),
      'N° Pre calibre': n('pre_calibre'),
      'N° Polvo': n('polvo'),
      'N° Pudrición': n('pudricion'),
      'N° Daño ave': n('picadura_ave'),
      'N° Inserción pedicelar': n('insercion_pedicelar'),
      'N° Quemadura': n('quemadura'),
      'N° Blando': n('blando'),
      'N° Deshidratación': n('deshidratado'),
      'N° Desgarro': n('desgarro'),
      'N° Herida abierta': n('herida_abierta'),
      'N° Quemadura de sol': n('dano_sol'),
      'N° Rojo deshidratado': n('deshidratado_rojizo'),
      '% Falta de color': p('rojizo'),
      '% Pedúnculo adherido': p('pedicelo'),
      '% Restos florales': p('resto_floral'),
      '% Cicatrices': p('cicatriz'),
      '% Polen': p('polen'),
      '% Ausencia de bloom': p('sin_bloom'),
      '% Russet': p('russet'),
      '% Plagas e insectos': p('plagas_insectos'),
      '% Pre calibre': p('pre_calibre'),
      '% Polvo': p('polvo'),
      '% Pudrición': p('pudricion'),
      '% Daño ave': p('picadura_ave'),
      '% Inserción pedicelar': p('insercion_pedicelar'),
      '% Quemadura': p('quemadura'),
      '% Blando': p('blando'),
      '% Deshidratación': p('deshidratado'),
      '% Desgarro': p('desgarro'),
      '% Herida abierta': p('herida_abierta'),
      '% Quemadura de sol': p('dano_sol'),
      '% Rojo deshidratado': p('deshidratado_rojizo'),
      '% Suma def. calidad': numOr0_(score.sumaDefCal),
      '% Suma def. condición': numOr0_(score.sumaDefCon),
      '% Tot. defectos': numOr0_(score.sumaDefectos),
      '% Calidad': score.pctCalidad != null ? Number(score.pctCalidad) : 100,
      'Cal. Falta de color': cal('rojizo'),
      'Cal. Pedúnculo adherido': cal('pedicelo'),
      'Cal. Restos florales': cal('resto_floral'),
      'Cal. Cicatrices': cal('cicatriz'),
      'Cal. Polen': cal('polen'),
      'Cal. Ausencia de bloom': cal('sin_bloom'),
      'Cal. Russet': cal('russet'),
      'Cal. Plagas': cal('plagas_insectos'),
      'Cal. Pre calibre': cal('pre_calibre'),
      'Cal. Polvo': cal('polvo'),
      'Cal. Pudrición': cal('pudricion'),
      'Cal. Daño ave': cal('picadura_ave'),
      'Cal. Inserción pedicelar': cal('insercion_pedicelar'),
      'Cal. Quemadura': cal('quemadura'),
      'Cal. Blando': cal('blando'),
      'Cal. Deshidratación': cal('deshidratado'),
      'Cal. Desgarro': cal('desgarro'),
      'Cal. Herida': cal('herida_abierta'),
      'Cal. Quemadura de sol': cal('dano_sol'),
      'Cal. Rojo deshidratado': cal('deshidratado_rojizo')
    });
  }

  if (type === 'caida') {
    return Object.assign(base, {
      'Cosechador': data.cosechador || '',
      'Momento evaluación': data.momento || '',
      'Plantas evaluadas': data.plantas_evaluadas || '',
      'Frutos caídos': data.frutos_caidos || '',
      'Frutos caídos verdes': data.frutos_caidos_verdes || '',
      'Promedio frutos/planta': score.promedio != null ? score.promedio : ''
    });
  }

  if (type === 'planta') {
    return Object.assign(base, {
      'Cosechador': data.cosechador || '',
      'Plantas evaluadas': data.plantas_evaluadas || '',
      'N° frutos en planta': data.frutos_planta || '',
      'Promedio frutos/planta': score.promedio != null ? score.promedio : ''
    });
  }

  return base;
}

function ptsGrupo_(rows, grupo) {
  if (!rows || !rows.length) return '';
  var sum = 0;
  var n = 0;
  rows.forEach(function (r) {
    if (r.grupo === grupo && r.puntos != null) {
      sum += Number(r.puntos) || 0;
      n++;
    }
  });
  return n ? Math.round((sum / n) * 100) / 100 : '';
}

function pct_(count, sample) {
  var s = Number(sample) || 0;
  if (s <= 0) return 0;
  return Math.round(((Number(count) || 0) / s) * 10000) / 100;
}

/**
 * Filas antiguas: si hay % y N° está vacío/0 → N° = redondeo(% × muestra / 100).
 * Pares por nombre: "N° X" ↔ "% X"
 */
function backfillUnitsFromPct_(sheet) {
  var headers = getHeaders_(sheet);
  if (!headers.length) return;

  var sampleIdx = headers.indexOf('Tamaño muestra');
  if (sampleIdx === -1) return;

  var pairs = [];
  for (var h = 0; h < headers.length; h++) {
    var name = headers[h];
    if (name.indexOf('N° ') !== 0) continue;
    var suffix = name.slice(3); // después de "N° "
    var pctName = '% ' + suffix;
    var pctIdx = headers.indexOf(pctName);
    if (pctIdx === -1) continue;
    pairs.push({ nIdx: h, pIdx: pctIdx });
  }
  if (!pairs.length) return;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var numRows = lastRow - 1;
  var lastCol = headers.length;
  var values = sheet.getRange(2, 1, numRows, lastCol).getValues();
  var changed = false;

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var sample = Number(row[sampleIdx]) || 0;
    if (sample <= 0) continue;

    for (var i = 0; i < pairs.length; i++) {
      var pair = pairs[i];
      var nVal = row[pair.nIdx];
      var pVal = row[pair.pIdx];
      var nEmpty = nVal === '' || nVal === null || typeof nVal === 'undefined' ||
        (typeof nVal === 'string' && String(nVal).trim() === '') ||
        Number(nVal) === 0;
      var pct = Number(pVal);
      if (!nEmpty || isNaN(pct) || pct === 0) continue;
      row[pair.nIdx] = Math.round((pct / 100) * sample);
      changed = true;
    }
  }

  if (changed) {
    sheet.getRange(2, 1, numRows, lastCol).setValues(values);
  }
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  var isNew = !sheet;
  if (isNew) sheet = ss.insertSheet(name);
  syncHeaders_(sheet, headers);
  if (isNew) styleHeader_(sheet, headers.length);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  var existing = getHeaders_(sheet);
  if (!existing.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  var missing = [];
  for (var i = 0; i < headers.length; i++) {
    if (existing.indexOf(headers[i]) === -1) missing.push(headers[i]);
  }
  if (!missing.length) return;
  var start = existing.length + 1;
  sheet.getRange(1, start, 1, missing.length).setValues([missing]);
}

/**
 * Renombra viejos → actuales, borra lo que el frontend ya no usa,
 * y reescribe TODA la hoja en el orden oficial (data se mueve, sin huecos).
 */
function syncHeaders_(sheet, headers) {
  for (var i = 0; i < RENAME_COLS.length; i++) {
    mergeRenameColumn_(sheet, RENAME_COLS[i][0], RENAME_COLS[i][1]);
  }
  for (var o = 0; o < OBSOLETE_COLS.length; o++) {
    var name = OBSOLETE_COLS[o];
    if (headers.indexOf(name) === -1) {
      removeColumnByHeader_(sheet, name);
    }
  }

  ensureHeaders_(sheet, headers);

  var existing = getHeaders_(sheet);
  var ordered = existing.length === headers.length;
  if (ordered) {
    for (var j = 0; j < headers.length; j++) {
      if (existing[j] !== headers[j]) {
        ordered = false;
        break;
      }
    }
  }
  if (ordered) return;

  var lastRow = Math.max(sheet.getLastRow(), 1);
  var lastCol = Math.max(existing.length, 1);
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var colIndex = {};
  for (var c = 0; c < existing.length; c++) {
    if (colIndex[existing[c]] == null) colIndex[existing[c]] = c;
  }

  var newOrder = headers.slice();
  var newValues = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var next = [];
    for (var n = 0; n < newOrder.length; n++) {
      var idx = colIndex[newOrder[n]];
      next.push(idx == null ? '' : row[idx]);
    }
    newValues.push(next);
  }

  if (lastCol > newOrder.length) {
    sheet.deleteColumns(newOrder.length + 1, lastCol - newOrder.length);
  }
  sheet.getRange(1, 1, lastRow, newOrder.length).setValues(newValues);
}

/**
 * Si solo existe el nombre viejo → renombra in-place.
 * Si existen ambos → copia vacíos al nuevo y borra el viejo (data no se pierde).
 */
function mergeRenameColumn_(sheet, fromName, toName) {
  fromName = String(fromName || '').trim();
  toName = String(toName || '').trim();
  if (!fromName || !toName || fromName === toName) return;
  var headers = getHeaders_(sheet);
  var fromIdx = headers.indexOf(fromName);
  if (fromIdx === -1) return;
  var toIdx = headers.indexOf(toName);

  if (toIdx === -1) {
    sheet.getRange(1, fromIdx + 1).setValue(toName);
    return;
  }

  var lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow >= 2) {
    var numDataRows = lastRow - 1;
    var fromVals = sheet.getRange(2, fromIdx + 1, numDataRows, 1).getValues();
    var toVals = sheet.getRange(2, toIdx + 1, numDataRows, 1).getValues();
    var merged = [];
    for (var i = 0; i < fromVals.length; i++) {
      var t = toVals[i][0];
      var f = fromVals[i][0];
      var tEmpty = t === '' || t === null || typeof t === 'undefined';
      merged.push([tEmpty ? f : t]);
    }
    sheet.getRange(2, toIdx + 1, numDataRows, 1).setValues(merged);
  }

  headers = getHeaders_(sheet);
  fromIdx = headers.indexOf(fromName);
  if (fromIdx !== -1) sheet.deleteColumn(fromIdx + 1);
}

function removeColumnByHeader_(sheet, headerName) {
  var headers = getHeaders_(sheet);
  var idx = headers.indexOf(String(headerName || '').trim());
  if (idx === -1) return;
  sheet.deleteColumn(idx + 1);
}

function getHeaders_(sheet) {
  var lastCol = Math.min(sheet.getLastColumn(), 120);
  if (lastCol < 1) return [];
  var row = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var out = [];
  for (var i = 0; i < row.length; i++) out.push(String(row[i] || '').trim());
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

function styleHeader_(sheet, colCount) {
  sheet.getRange(1, 1, 1, colCount)
    .setBackground('#5DB24B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontFamily('Arial')
    .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
}

function parseBody_(e) {
  var raw = '';
  if (e && e.postData && e.postData.contents != null) {
    raw = String(e.postData.contents);
  }
  raw = String(raw || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    var m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (ignore) {}
    }
    return {};
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowIso_() {
  return new Date().toISOString();
}

function formatHora_(value) {
  var date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) date = new Date();
  return Utilities.formatDate(date, 'America/Lima', 'hh:mm:ss a');
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Q Berries')
    .addItem('Preparar hojas / columnas', 'setupSheets')
    .addItem('Rellenar N° desde % (Calidad/Descarte)', 'backfillAllUnits_')
    .addToUi();
}

/** Menú: rellena N° vacíos desde % en Calidad y Descarte */
function backfillAllUnits_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['calidad', 'descarte'].forEach(function (key) {
    var def = SHEETS[key];
    var sheet = ss.getSheetByName(def.name);
    if (sheet) backfillUnitsFromPct_(sheet);
  });
  SpreadsheetApp.getUi().alert('Listo: unidades (N°) rellenadas desde % donde faltaban.');
}
