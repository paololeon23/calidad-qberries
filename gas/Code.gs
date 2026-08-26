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
  /** Orden: datos → resultados/calificaciones → % al final → comentario / hora */
  calidad: {
    name: 'Calidad',
    headers: COL.meta.concat(COL.cosechador, COL.ubicacion, [
      'Tamaño muestra',
      'Puntos Calidad', 'Puntos Condición', 'Puntos Calidad def.'
    ], COL.resultado, [
      'Cal. Blando', 'Cal. Desgarro', 'Cal. Deshidratado', 'Cal. Rojizo',
      'Cal. Resto floral', 'Cal. Polen', 'Cal. Pedicelo', 'Cal. Cicatriz',
      'Cal. Polvo', 'Cal. Herida', 'Cal. Ave', 'Cal. Sin Bloom',
      'Cal. Plagas', 'Cal. Inserción pedicelar',
      '% Blando', '% Desgarro', '% Deshidratado', '% Rojizo', '% Resto floral',
      '% Polen', '% Pedicelo', '% Cicatriz', '% Polvo', '% Herida abierta',
      '% Picadura ave', '% Sin Bloom', '% Plagas e insectos', '% Inserción pedicelar',
      '% Suma def. calidad', '% Suma def. condición', '% Tot. defectos', '% Calidad'
    ], COL.cierre)
  },
  descarte: {
    name: 'Descarte',
    headers: COL.meta.concat(COL.ubicacion, [
      'Tamaño muestra'
    ], COL.resultado, [
      'Cal. Fruta buena', 'Cal. Deshidratada', 'Cal. Rojiza', 'Cal. Pedicelo',
      'Cal. Resto floral', 'Cal. Cicatriz', 'Cal. Polvo', 'Cal. Desgarro',
      'Cal. Ave', 'Cal. Sin Bloom', 'Cal. Polen',
      '% Fruta buena', '% Deshidratada', '% Rojiza', '% Pedicelo', '% Resto floral',
      '% Cicatriz', '% Polvo', '% Desgarro', '% Picadura ave', '% Sin Bloom', '% Polen',
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
 * Solo preparación manual (menú / editor). NO lo usa doPost.
 * Estilos solo en hojas nuevas — re-ejecutar no repinta encabezados.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keys = Object.keys(SHEETS);
  for (var i = 0; i < keys.length; i++) {
    var def = SHEETS[keys[i]];
    var sheet = ensureSheet_(ss, def.name, def.headers);
    removeColumnByHeader_(sheet, 'Marca temporal');
    syncHeaders_(sheet, def.headers);
  }
}

function doGet(e) {
  e = e || { parameter: {} };
  var action = String((e.parameter && e.parameter.action) || 'ping').trim();
  if (action === 'ping') {
    return json_({ ok: true, api: 'calidad', ts: nowIso_(), version: '1.1.13' });
  }
  return json_({ ok: true, api: 'calidad', version: '1.1.13', sheets: Object.keys(SHEETS) });
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

    removeColumnByHeader_(sheet, 'Marca temporal');
    syncHeaders_(sheet, def.headers);
    // Siempre escribir en el orden oficial (Puntos totales + Nota incluidos)
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

  function p(id) {
    var r = rowsById[id];
    return r && r.pct != null ? Number(r.pct) : pct_(data[id], data.tamano_muestra);
  }
  function cal(id) {
    var r = rowsById[id];
    return r && r.calificacion ? r.calificacion : '';
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
      '% Blando': p('blando'),
      '% Desgarro': p('desgarro'),
      '% Deshidratado': p('deshidratado'),
      '% Rojizo': p('rojizo'),
      '% Resto floral': p('resto_floral'),
      '% Polen': p('polen'),
      '% Pedicelo': p('pedicelo'),
      '% Cicatriz': p('cicatriz'),
      '% Polvo': p('polvo'),
      '% Herida abierta': p('herida_abierta'),
      '% Picadura ave': p('picadura_ave'),
      '% Sin Bloom': p('sin_bloom'),
      '% Plagas e insectos': p('plagas_insectos'),
      '% Inserción pedicelar': p('insercion_pedicelar'),
      '% Suma def. calidad': score.sumaDefCal != null ? score.sumaDefCal : '',
      '% Suma def. condición': score.sumaDefCon != null ? score.sumaDefCon : '',
      '% Tot. defectos': score.sumaDefectos != null ? score.sumaDefectos : '',
      '% Calidad': score.pctCalidad != null ? score.pctCalidad : '',
      'Puntos Calidad': score.nota != null ? score.nota : '',
      'Puntos Condición': ptsGrupo_(score.rows, 'CON'),
      'Puntos Calidad def.': ptsGrupo_(score.rows, 'CAL'),
      'Cal. Blando': cal('blando'),
      'Cal. Desgarro': cal('desgarro'),
      'Cal. Deshidratado': cal('deshidratado'),
      'Cal. Rojizo': cal('rojizo'),
      'Cal. Resto floral': cal('resto_floral'),
      'Cal. Polen': cal('polen'),
      'Cal. Pedicelo': cal('pedicelo'),
      'Cal. Cicatriz': cal('cicatriz'),
      'Cal. Polvo': cal('polvo'),
      'Cal. Herida': cal('herida_abierta'),
      'Cal. Ave': cal('picadura_ave'),
      'Cal. Sin Bloom': cal('sin_bloom'),
      'Cal. Plagas': cal('plagas_insectos'),
      'Cal. Inserción pedicelar': cal('insercion_pedicelar')
    });
  }

  if (type === 'descarte') {
    return Object.assign(base, {
      'Tamaño muestra': data.tamano_muestra || '',
      '% Fruta buena': p('fruta_buena'),
      '% Deshidratada': p('deshidratada'),
      '% Rojiza': p('rojiza'),
      '% Pedicelo': p('pedicelo'),
      '% Resto floral': p('resto_floral'),
      '% Cicatriz': p('cicatriz'),
      '% Polvo': p('polvo'),
      '% Desgarro': p('desgarro'),
      '% Picadura ave': p('picadura_ave'),
      '% Sin Bloom': p('sin_bloom'),
      '% Polen': p('polen'),
      '% Suma def. calidad': score.sumaDefCal != null ? score.sumaDefCal : '',
      '% Suma def. condición': score.sumaDefCon != null ? score.sumaDefCon : '',
      '% Tot. defectos': score.sumaDefectos != null ? score.sumaDefectos : '',
      '% Calidad': score.pctCalidad != null ? score.pctCalidad : '',
      'Cal. Fruta buena': cal('fruta_buena'),
      'Cal. Deshidratada': cal('deshidratada'),
      'Cal. Rojiza': cal('rojiza'),
      'Cal. Pedicelo': cal('pedicelo'),
      'Cal. Resto floral': cal('resto_floral'),
      'Cal. Cicatriz': cal('cicatriz'),
      'Cal. Polvo': cal('polvo'),
      'Cal. Desgarro': cal('desgarro'),
      'Cal. Ave': cal('picadura_ave'),
      'Cal. Sin Bloom': cal('sin_bloom'),
      'Cal. Polen': cal('polen')
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
  // getRange(fila, col, numFilas, numCols) — no usar columna final
  sheet.getRange(1, start, 1, missing.length).setValues([missing]);
}

/** Renombra/fusiona aliases viejos, elimina columnas obsoletas y deja SOLO el orden oficial */
function syncHeaders_(sheet, headers) {
  mergeRenameColumn_(sheet, 'Ptos. Tot', 'Puntos totales');
  mergeRenameColumn_(sheet, 'Pun. Calidad', 'Puntos Calidad');
  mergeRenameColumn_(sheet, 'Ptos. Condición', 'Puntos Condición');
  mergeRenameColumn_(sheet, 'Ptos. Calidad def.', 'Puntos Calidad def.');
  mergeRenameColumn_(sheet, '% Excreta abeja', '% Polen');
  mergeRenameColumn_(sheet, 'Cal. Excreta', 'Cal. Polen');

  var obsolete = [
    'Ptos. Tot',
    'Pun. Calidad',
    'Ptos. Condición',
    'Ptos. Calidad def.',
    'Marca temporal'
  ];
  for (var o = 0; o < obsolete.length; o++) {
    if (headers.indexOf(obsolete[o]) === -1) {
      removeColumnByHeader_(sheet, obsolete[o]);
    }
  }

  ensureHeaders_(sheet, headers);

  var existing = getHeaders_(sheet);
  var ordered = existing.length === headers.length;
  if (ordered) {
    for (var i = 0; i < headers.length; i++) {
      if (existing[i] !== headers[i]) {
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
    // Si hay duplicados, preferir la primera columna con ese nombre
    if (colIndex[existing[c]] == null) colIndex[existing[c]] = c;
  }

  // Solo columnas oficiales — no dejar "Ptos. Tot" ni extras viejos al final
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
  } else if (lastCol < newOrder.length) {
    // ensureHeaders ya agregó; el setValues amplia
  }
  sheet.getRange(1, 1, lastRow, newOrder.length).setValues(newValues);
}

/**
 * Si solo existe el nombre viejo → renombra.
 * Si existen ambos → copia valores faltantes al nuevo y borra el viejo.
 */
function mergeRenameColumn_(sheet, fromName, toName) {
  fromName = String(fromName || '').trim();
  toName = String(toName || '').trim();
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
    // getRange(fila, col, numFilas, numCols) — no coordenadas finales
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

function renameHeader_(sheet, fromName, toName) {
  mergeRenameColumn_(sheet, fromName, toName);
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

/** Quita columna obsoleta (p. ej. Marca temporal) al ejecutar setupSheets */
function removeColumnByHeader_(sheet, headerName) {
  var headers = getHeaders_(sheet);
  var idx = headers.indexOf(String(headerName || '').trim());
  if (idx === -1) return;
  sheet.deleteColumn(idx + 1);
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
    .addToUi();
}
