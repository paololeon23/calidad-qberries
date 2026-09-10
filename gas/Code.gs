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
 *
 * GET panel jefe (otra página):
 *   ?action=filters&fecha=YYYY-MM-DD
 *   ?action=summary&fecha=YYYY-MM-DD&role=evaluador|supervisor|cosechador&name=...
 *
 * Respecto a 1.1.17: mismos nombres.
 * Solo se AGREGARON en Calidad y Descarte:
 * Quemadura de sol y Rojo deshidratado.
 * (Deshidratado y Rojo deshidratado NO se unen en Sheet)
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
      'Cal. Blando', 'Cal. Desgarro', 'Cal. Deshidratado', 'Cal. Rojizo',
      'Cal. Resto floral', 'Cal. Polen', 'Cal. Pedicelo', 'Cal. Cicatriz',
      'Cal. Polvo', 'Cal. Herida', 'Cal. Ave', 'Cal. Sin Bloom',
      'Cal. Plagas', 'Cal. Inserción pedicelar',
      'Cal. Quemadura de sol', 'Cal. Rojo deshidratado',
      'N° Blando', 'N° Desgarro', 'N° Deshidratado', 'N° Rojizo', 'N° Resto floral',
      'N° Polen', 'N° Pedicelo', 'N° Cicatriz', 'N° Polvo', 'N° Herida abierta',
      'N° Picadura ave', 'N° Sin Bloom', 'N° Plagas e insectos', 'N° Inserción pedicelar',
      'N° Quemadura de sol', 'N° Rojo deshidratado',
      '% Blando', '% Desgarro', '% Deshidratado', '% Rojizo', '% Resto floral',
      '% Polen', '% Pedicelo', '% Cicatriz', '% Polvo', '% Herida abierta',
      '% Picadura ave', '% Sin Bloom', '% Plagas e insectos', '% Inserción pedicelar',
      '% Quemadura de sol', '% Rojo deshidratado',
      '% Suma def. calidad', '% Suma def. condición', '% Tot. defectos', '% Calidad'
    ], COL.cierre)
  },
  descarte: {
    name: 'Descarte',
    headers: COL.meta.concat(COL.ubicacion, [
      'Tamaño muestra'
    ], COL.resultado, [
      /* Solo 3 se califican; el resto es N° + % */
      'Cal. Fruta buena', 'Cal. Rojiza', 'Cal. Pedicelo',
      'Cal. Quemadura de sol', 'Cal. Rojo deshidratado',
      'N° Fruta buena', 'N° Deshidratada', 'N° Rojiza', 'N° Pedicelo', 'N° Resto floral',
      'N° Cicatriz', 'N° Polvo', 'N° Desgarro', 'N° Picadura ave', 'N° Sin Bloom', 'N° Polen',
      'N° Quemadura de sol', 'N° Rojo deshidratado',
      '% Fruta buena', '% Deshidratada', '% Rojiza', '% Pedicelo', '% Resto floral',
      '% Cicatriz', '% Polvo', '% Desgarro', '% Picadura ave', '% Sin Bloom', '% Polen',
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
 * Solo preparación manual (menú / editor). NO lo usa doPost.
 * Estilos solo en hojas nuevas — re-ejecutar no repinta encabezados.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keys = Object.keys(SHEETS);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var def = SHEETS[key];
    var sheet = ensureSheet_(ss, def.name, def.headers);
    removeColumnByHeader_(sheet, 'Marca temporal');
    syncHeaders_(sheet, def.headers);
    if (key === 'calidad' || key === 'descarte') {
      backfillUnitsFromPct_(sheet);
    }
  }
}

/**
 * GET (otra página / panel jefe):
 *   ?action=ping
 *   ?action=filters&fecha=YYYY-MM-DD
 *       → listas para select: Evaluador, Supervisor, Cosechador
 *   ?action=summary&fecha=YYYY-MM-DD&role=evaluador|supervisor|cosechador&name=NOMBRE
 *       &type=all|calidad|descarte|caida|planta  (opcional, default all)
 *       → resumen compacto del día (sin unir columnas de Sheet)
 */
function doGet(e) {
  e = e || { parameter: {} };
  var p = e.parameter || {};
  var action = String(p.action || 'ping').trim();

  try {
    if (action === 'ping') {
      return json_({ ok: true, api: 'calidad', ts: nowIso_(), version: '1.1.31' });
    }
    if (action === 'help') {
      return json_({
        ok: true,
        version: '1.1.31',
        endpoints: {
          filters: '?action=filters&fecha=YYYY-MM-DD',
          summary: '?action=summary&fecha=YYYY-MM-DD&role=evaluador|supervisor|cosechador&name=...',
          batchSave: 'POST { action:"batchSave", records:[...] }'
        }
      });
    }
    if (action === 'filters') {
      return json_(getFilters_(p));
    }
    if (action === 'summary') {
      return json_(getSummary_(p));
    }
    return json_({ ok: true, api: 'calidad', version: '1.1.31', sheets: Object.keys(SHEETS) });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err).replace(/^Error:\s*/i, '');
    return json_({ ok: false, error: msg });
  }
}

/** Normaliza fecha a YYYY-MM-DD (Lima). Evita que el día “salte” por zona horaria. */
function fechaKey_(value) {
  if (value === '' || value == null) return '';
  if (typeof value === 'number' && isFinite(value)) {
    // Serial Excel / Sheets
    var epoch = new Date(Date.UTC(1899, 11, 30));
    var asDate = new Date(epoch.getTime() + Math.floor(value) * 86400000);
    return Utilities.formatDate(asDate, 'America/Lima', 'yyyy-MM-dd');
  }
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, 'America/Lima', 'yyyy-MM-dd');
  }
  var s = String(value).trim();
  if (!s) return '';
  // Solo YYYY-MM-DD (lo que manda la app)
  var mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return mIso[1] + '-' + mIso[2] + '-' + mIso[3];
  // dd/mm/yyyy o dd-mm-yyyy (Sheets UI Perú)
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) {
    var dd = ('0' + m[1]).slice(-2);
    var mm = ('0' + m[2]).slice(-2);
    return m[3] + '-' + mm + '-' + dd;
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, 'America/Lima', 'yyyy-MM-dd');
  }
  return '';
}

/**
 * Fecha a guardar en Sheet:
 * 1) Si el cliente mandó YYYY-MM-DD válido → esa (día de la evaluación)
 * 2) Si no → día Lima de submittedAt
 * Siempre string texto (nunca Date) para que GET no mezcle días.
 */
function canonFechaSave_(rawFecha, submittedAt) {
  var s = String(rawFecha || '').trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var fromClient = fechaKey_(rawFecha);
  if (fromClient) return fromClient;
  var fromSubmit = fechaKey_(submittedAt);
  if (fromSubmit) return fromSubmit;
  return Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
}

/** Deja la celda Fecha como TEXTO (@) para que Sheets no la convierta a Date */
function lockFechaCellAsText_(sheet, rowIndex, isoFecha) {
  var headers = getHeaders_(sheet);
  var idx = headers.indexOf('Fecha');
  if (idx === -1) return;
  var cell = sheet.getRange(rowIndex, idx + 1);
  cell.setNumberFormat('@');
  cell.setValue(String(isoFecha || ''));
}

/** Varias filas Fecha en una sola operación (batch) */
function lockFechaRange_(sheet, startRow, fechas) {
  if (!fechas || !fechas.length) return;
  var headers = getHeaders_(sheet);
  var idx = headers.indexOf('Fecha');
  if (idx === -1) return;
  var n = fechas.length;
  var range = sheet.getRange(startRow, idx + 1, startRow + n - 1, idx + 1);
  range.setNumberFormat('@');
  var vals = [];
  for (var i = 0; i < n; i++) vals.push([String(fechas[i] || '')]);
  range.setValues(vals);
}

function normName_(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqSorted_(arr) {
  var seen = {};
  var out = [];
  for (var i = 0; i < arr.length; i++) {
    var v = String(arr[i] || '').trim();
    if (!v) continue;
    var k = normName_(v);
    if (seen[k]) continue;
    seen[k] = true;
    out.push(v);
  }
  out.sort(function (a, b) {
    return a.localeCompare(b, 'es', { sensitivity: 'base' });
  });
  return out;
}

function colMap_(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim();
    if (h && map[h] == null) map[h] = i;
  }
  return map;
}

/** Lee filas de una hoja como objetos {header: value} */
function readSheetObjects_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var headers = getHeaders_(sheet);
  if (!headers.length) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = headers.length;
  var values = sheet.getRange(2, 1, lastRow, lastCol).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var obj = {};
    var empty = true;
    for (var c = 0; c < headers.length; c++) {
      var v = row[c];
      if (v !== '' && v != null) empty = false;
      obj[headers[c]] = v;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

function roleColumn_(role) {
  role = String(role || '').trim().toLowerCase();
  if (role === 'evaluador') return 'Evaluador';
  if (role === 'supervisor') return 'Supervisor';
  if (role === 'cosechador') return 'Cosechador';
  return '';
}

/**
 * Selectors para la otra página.
 * Si viene fecha → solo personas con registros ese día.
 */
function getFilters_(p) {
  p = p || {};
  var fecha = fechaKey_(p.fecha) || fechaKey_(new Date());
  var types = ['calidad', 'descarte', 'caida', 'planta'];
  var evaluadores = [];
  var supervisores = [];
  var cosechadores = [];

  for (var t = 0; t < types.length; t++) {
    var key = types[t];
    var def = SHEETS[key];
    var rows = readSheetObjects_(def.name);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (fechaKey_(row['Fecha']) !== fecha) continue;
      if (row['Evaluador']) evaluadores.push(row['Evaluador']);
      if (row['Supervisor']) supervisores.push(row['Supervisor']);
      if (row['Cosechador']) cosechadores.push(row['Cosechador']);
    }
  }

  return {
    ok: true,
    action: 'filters',
    fecha: fecha,
    evaluadores: uniqSorted_(evaluadores),
    supervisores: uniqSorted_(supervisores),
    cosechadores: uniqSorted_(cosechadores)
  };
}

function avg_(nums) {
  if (!nums || !nums.length) return null;
  var s = 0;
  for (var i = 0; i < nums.length; i++) s += nums[i];
  return Math.round((s / nums.length) * 100) / 100;
}

function num_(v) {
  if (v === '' || v == null) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Resumen del día para jefe/supervisor.
 * Columnas Deshidratado / Rojo deshidratado siguen SEPARADAS en Sheet.
 */
function getSummary_(p) {
  p = p || {};
  var fecha = fechaKey_(p.fecha);
  if (!fecha) throw new Error('Falta fecha (YYYY-MM-DD)');
  var role = String(p.role || '').trim().toLowerCase();
  var col = roleColumn_(role);
  if (!col) throw new Error('role inválido: use evaluador | supervisor | cosechador');
  var name = String(p.name || '').trim();
  if (!name) throw new Error('Falta name');
  var nameKey = normName_(name);

  var typeFilter = String(p.type || 'all').trim().toLowerCase();
  var types = ['calidad', 'descarte', 'caida', 'planta'];
  if (typeFilter !== 'all') {
    if (SHEETS[typeFilter]) types = [typeFilter];
    else throw new Error('type inválido');
  }

  var porTipo = { calidad: 0, descarte: 0, caida: 0, planta: 0 };
  var notas = [];
  var pctCalidad = [];
  var pctDefectos = [];
  var grades = { Excelente: 0, Bueno: 0, Regular: 0, Malo: 0, Otro: 0 };
  var items = [];

  // Promedios de % defectos clave (Calidad) — sin fusionar
  var defectKeys = [
    '% Blando', '% Desgarro', '% Deshidratado', '% Rojizo', '% Resto floral',
    '% Polen', '% Pedicelo', '% Cicatriz', '% Polvo', '% Herida abierta',
    '% Picadura ave', '% Sin Bloom', '% Plagas e insectos', '% Inserción pedicelar',
    '% Quemadura de sol', '% Rojo deshidratado'
  ];
  var defectSums = {};
  var defectN = {};
  for (var d = 0; d < defectKeys.length; d++) {
    defectSums[defectKeys[d]] = 0;
    defectN[defectKeys[d]] = 0;
  }

  for (var t = 0; t < types.length; t++) {
    var key = types[t];
    var def = SHEETS[key];
    var rows = readSheetObjects_(def.name);
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (fechaKey_(row['Fecha']) !== fecha) continue;
      if (col === 'Cosechador' && (row['Cosechador'] == null || row['Cosechador'] === '')) continue;
      if (normName_(row[col]) !== nameKey) continue;

      porTipo[key]++;
      var nota = num_(row['Nota']);
      if (nota != null) notas.push(nota);
      var pc = num_(row['% Calidad']);
      if (pc != null) pctCalidad.push(pc);
      var pd = num_(row['% Tot. defectos']);
      if (pd != null) pctDefectos.push(pd);

      var g = String(row['Calificación global'] || '').trim();
      if (grades.hasOwnProperty(g)) grades[g]++;
      else if (g) grades.Otro++;

      if (key === 'calidad' || key === 'descarte') {
        for (var k = 0; k < defectKeys.length; k++) {
          var hk = defectKeys[k];
          var dv = num_(row[hk]);
          if (dv == null) continue;
          // Descarte no tiene todos; solo suma si existe valor
          if (row.hasOwnProperty(hk) || def.headers.indexOf(hk) !== -1) {
            if (dv != null && row[hk] !== '' && row[hk] != null) {
              defectSums[hk] += dv;
              defectN[hk]++;
            }
          }
        }
      }

      items.push({
        tipo: key,
        hoja: def.name,
        hora: row['Hora registro'] || '',
        variedad: row['Variedad'] || '',
        lote: row['Lote'] || '',
        modulo: row['Módulo'] || '',
        turno: row['Turno'] || '',
        evaluador: row['Evaluador'] || '',
        supervisor: row['Supervisor'] || '',
        cosechador: row['Cosechador'] || '',
        nota: nota,
        pctCalidad: pc,
        pctDefectos: pd,
        calificacion: g || ''
      });
    }
  }

  // Top defectos por promedio (solo los que tuvieron datos)
  var topDefectos = [];
  for (var j = 0; j < defectKeys.length; j++) {
    var dk = defectKeys[j];
    if (!defectN[dk]) continue;
    topDefectos.push({
      defecto: dk,
      promedio: Math.round((defectSums[dk] / defectN[dk]) * 100) / 100,
      n: defectN[dk]
    });
  }
  topDefectos.sort(function (a, b) { return b.promedio - a.promedio; });
  if (topDefectos.length > 8) topDefectos = topDefectos.slice(0, 8);

  var total = porTipo.calidad + porTipo.descarte + porTipo.caida + porTipo.planta;

  return {
    ok: true,
    action: 'summary',
    fecha: fecha,
    role: role,
    name: name,
    type: typeFilter,
    total: total,
    porTipo: porTipo,
    kpis: {
      notaMedia: avg_(notas),
      pctCalidadMedia: avg_(pctCalidad),
      pctDefectosMedia: avg_(pctDefectos),
      calificaciones: grades
    },
    topDefectos: topDefectos,
    items: items
  };
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = String(body.action || 'save').trim();
    if (action === 'ping') {
      return json_({ ok: true, api: 'calidad', ts: nowIso_() });
    }
    if (action === 'batchSave' || action === 'batch') {
      return json_(saveBatch_(body));
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

/**
 * Guarda UN registro (sin reordenar toda la hoja en cada POST).
 * Solo agrega columnas faltantes — crítico con colas grandes.
 */
function appendOneEvaluation_(ss, body) {
  body = body || {};
  var type = body.type;
  if (!SHEETS[type]) throw new Error('Tipo de evaluación inválido: ' + type);

  var clientId = String(body.clientId || '').trim();
  if (!clientId) throw new Error('Falta clientId (idempotencia)');

  if (isDuplicateClient_(clientId)) {
    return {
      ok: true,
      created: false,
      duplicate: true,
      clientId: clientId
    };
  }

  var def = SHEETS[type];
  var sheet = ss.getSheetByName(def.name);
  if (!sheet) sheet = ensureSheet_(ss, def.name, def.headers);
  else ensureHeaders_(sheet, def.headers);

  var data = body.data || {};
  var score = body.score || {};
  var stamp = new Date();
  var fechaISO = canonFechaSave_(data.fecha, body.submittedAt || stamp);
  data.fecha = fechaISO;
  var rowMap = buildRow_(type, data, score, stamp, body.submittedAt);

  var headers = getHeaders_(sheet);
  if (!headers.length) {
    headers = def.headers.slice();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  var row = headers.map(function (h) {
    return rowMap.hasOwnProperty(h) ? rowMap[h] : '';
  });

  var newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, row.length).setValues([row]);
  lockFechaCellAsText_(sheet, newRow, fechaISO);
  markClientIdDone_(clientId);

  return {
    ok: true,
    created: true,
    duplicate: false,
    sheet: def.name,
    row: newRow,
    clientId: clientId,
    fecha: fechaISO
  };
}

function saveEvaluation_(body) {
  var clientId = String((body && body.clientId) || '').trim();
  if (!clientId) throw new Error('Falta clientId (idempotencia)');

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(8000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = appendOneEvaluation_(ss, body);
    result.api = 'calidad';
    return result;
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/**
 * Batch: varios registros en UN lock + setValues multi-fila por tipo.
 * Body: { action:'batchSave', records:[ {type,clientId,data,score,submittedAt}, ... ] }
 * Máx 10 por request (alineado con PWA).
 */
function saveBatch_(body) {
  body = body || {};
  var records = body.records;
  if (!records || !records.length) throw new Error('Faltan records');
  if (records.length > 10) records = records.slice(0, 10);

  var lock = LockService.getScriptLock();
  var got = false;
  try {
    got = lock.tryLock(25000);
    if (!got) throw new Error('El servidor está ocupado. Intente de nuevo.');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var stamp = new Date();
    var byCid = {};
    var byType = {};

    for (var i = 0; i < records.length; i++) {
      var rec = records[i] || {};
      var cid = String(rec.clientId || '').trim();
      if (!cid) {
        byCid['idx_' + i] = { clientId: 'idx_' + i, ok: false, error: 'Falta clientId' };
        continue;
      }
      if (isDuplicateClient_(cid)) {
        byCid[cid] = { clientId: cid, ok: true, created: false, duplicate: true };
        continue;
      }
      var type = rec.type;
      if (!SHEETS[type]) {
        byCid[cid] = { clientId: cid, ok: false, error: 'Tipo inválido: ' + type };
        continue;
      }
      if (!byType[type]) byType[type] = [];
      byType[type].push(rec);
    }

    for (var typeKey in byType) {
      if (!Object.prototype.hasOwnProperty.call(byType, typeKey)) continue;
      var def = SHEETS[typeKey];
      var sheet = ss.getSheetByName(def.name);
      if (!sheet) sheet = ensureSheet_(ss, def.name, def.headers);
      else ensureHeaders_(sheet, def.headers);

      var headers = getHeaders_(sheet);
      if (!headers.length) {
        headers = def.headers.slice();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }

      var group = byType[typeKey];
      var matrix = [];
      var fechas = [];
      var cids = [];

      for (var g = 0; g < group.length; g++) {
        var rec2 = group[g];
        var cid2 = String(rec2.clientId || '').trim();
        try {
          var data = rec2.data || {};
          var score = rec2.score || {};
          var fechaISO = canonFechaSave_(data.fecha, rec2.submittedAt || stamp);
          data.fecha = fechaISO;
          var rowMap = buildRow_(typeKey, data, score, stamp, rec2.submittedAt);
          var row = headers.map(function (h) {
            return rowMap.hasOwnProperty(h) ? rowMap[h] : '';
          });
          matrix.push(row);
          fechas.push(fechaISO);
          cids.push(cid2);
        } catch (errPrep) {
          byCid[cid2] = {
            clientId: cid2,
            ok: false,
            error: String(errPrep && errPrep.message ? errPrep.message : errPrep).replace(/^Error:\s*/i, '')
          };
        }
      }

      if (matrix.length) {
        var startRow = sheet.getLastRow() + 1;
        var endRow = startRow + matrix.length - 1;
        sheet.getRange(startRow, 1, endRow, headers.length).setValues(matrix);
        lockFechaRange_(sheet, startRow, fechas);
        for (var m = 0; m < cids.length; m++) {
          markClientIdDone_(cids[m]);
          byCid[cids[m]] = {
            clientId: cids[m],
            ok: true,
            created: true,
            duplicate: false,
            sheet: def.name,
            row: startRow + m,
            fecha: fechas[m]
          };
        }
      }
    }

    var results = [];
    for (var r = 0; r < records.length; r++) {
      var cidR = String((records[r] && records[r].clientId) || '').trim() || ('idx_' + r);
      results.push(byCid[cidR] || { clientId: cidR, ok: false, error: 'sin resultado' });
    }

    return { ok: true, api: 'calidad', action: 'batchSave', results: results };
  } finally {
    if (got) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

function buildRow_(type, data, score, stamp, submittedAt) {
  var rowsById = {};
  (score.rows || []).forEach(function (r) { rowsById[r.id] = r; });

  function p(id) {
    var r = rowsById[id];
    if (r && r.pct != null && !isNaN(Number(r.pct))) return Number(r.pct);
    return pct_(data[id], data.tamano_muestra);
  }
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
    'Fecha': canonFechaSave_(data.fecha, submittedAt || stamp),
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
      'N° Blando': n('blando'),
      'N° Desgarro': n('desgarro'),
      'N° Deshidratado': n('deshidratado'),
      'N° Rojizo': n('rojizo'),
      'N° Resto floral': n('resto_floral'),
      'N° Polen': n('polen'),
      'N° Pedicelo': n('pedicelo'),
      'N° Cicatriz': n('cicatriz'),
      'N° Polvo': n('polvo'),
      'N° Herida abierta': n('herida_abierta'),
      'N° Picadura ave': n('picadura_ave'),
      'N° Sin Bloom': n('sin_bloom'),
      'N° Plagas e insectos': n('plagas_insectos'),
      'N° Inserción pedicelar': n('insercion_pedicelar'),
      'N° Quemadura de sol': n('dano_sol'),
      'N° Rojo deshidratado': n('deshidratado_rojizo'),
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
      '% Quemadura de sol': p('dano_sol'),
      '% Rojo deshidratado': p('deshidratado_rojizo'),
      '% Suma def. calidad': numOr0_(score.sumaDefCal),
      '% Suma def. condición': numOr0_(score.sumaDefCon),
      '% Tot. defectos': numOr0_(score.sumaDefectos),
      '% Calidad': score.pctCalidad != null ? Number(score.pctCalidad) : 100,
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
      'Cal. Inserción pedicelar': cal('insercion_pedicelar'),
      'Cal. Quemadura de sol': cal('dano_sol'),
      'Cal. Rojo deshidratado': cal('deshidratado_rojizo')
    });
  }

  if (type === 'descarte') {
    return Object.assign(base, {
      'Tamaño muestra': data.tamano_muestra || '',
      'N° Fruta buena': n('fruta_buena'),
      'N° Deshidratada': n('deshidratada'),
      'N° Rojiza': n('rojiza'),
      'N° Pedicelo': n('pedicelo'),
      'N° Resto floral': n('resto_floral'),
      'N° Cicatriz': n('cicatriz'),
      'N° Polvo': n('polvo'),
      'N° Desgarro': n('desgarro'),
      'N° Picadura ave': n('picadura_ave'),
      'N° Sin Bloom': n('sin_bloom'),
      'N° Polen': n('polen'),
      'N° Quemadura de sol': n('dano_sol'),
      'N° Rojo deshidratado': n('deshidratado_rojizo'),
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
      '% Quemadura de sol': p('dano_sol'),
      '% Rojo deshidratado': p('deshidratado_rojizo'),
      '% Suma def. calidad': numOr0_(score.sumaDefCal),
      '% Suma def. condición': numOr0_(score.sumaDefCon),
      '% Tot. defectos': numOr0_(score.sumaDefectos),
      '% Calidad': score.pctCalidad != null ? Number(score.pctCalidad) : 100,
      'Cal. Fruta buena': cal('fruta_buena'),
      'Cal. Rojiza': cal('rojiza'),
      'Cal. Pedicelo': cal('pedicelo'),
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

function backfillUnitsFromPct_(sheet) {
  var headers = getHeaders_(sheet);
  if (!headers.length) return;

  var sampleIdx = headers.indexOf('Tamaño muestra');
  if (sampleIdx === -1) return;

  var pairs = [];
  for (var h = 0; h < headers.length; h++) {
    var name = headers[h];
    if (name.indexOf('N° ') !== 0) continue;
    var suffix = name.slice(3);
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

/** Renombra aliases mínimos, elimina obsoletos y deja el orden oficial (sin huecos) */
function syncHeaders_(sheet, headers) {
  mergeRenameColumn_(sheet, 'Ptos. Tot', 'Puntos totales');
  mergeRenameColumn_(sheet, 'Pun. Calidad', 'Puntos Calidad');
  mergeRenameColumn_(sheet, 'Ptos. Condición', 'Puntos Condición');
  mergeRenameColumn_(sheet, 'Ptos. Calidad def.', 'Puntos Calidad def.');
  mergeRenameColumn_(sheet, '% Excreta abeja', '% Polen');
  mergeRenameColumn_(sheet, 'Cal. Excreta', 'Cal. Polen');
  /* Si se habían renombrado mal → devolver data a nombres originales */
  mergeRenameColumn_(sheet, 'Cal. Falta de color', 'Cal. Rojizo');
  mergeRenameColumn_(sheet, 'N° Falta de color', 'N° Rojizo');
  mergeRenameColumn_(sheet, '% Falta de color', '% Rojizo');
  mergeRenameColumn_(sheet, 'Cal. Pedúnculo adherido', 'Cal. Pedicelo');
  mergeRenameColumn_(sheet, 'N° Pedúnculo adherido', 'N° Pedicelo');
  mergeRenameColumn_(sheet, '% Pedúnculo adherido', '% Pedicelo');
  mergeRenameColumn_(sheet, 'Cal. Restos florales', 'Cal. Resto floral');
  mergeRenameColumn_(sheet, 'N° Restos florales', 'N° Resto floral');
  mergeRenameColumn_(sheet, '% Restos florales', '% Resto floral');
  mergeRenameColumn_(sheet, 'Cal. Cicatrices', 'Cal. Cicatriz');
  mergeRenameColumn_(sheet, 'N° Cicatrices', 'N° Cicatriz');
  mergeRenameColumn_(sheet, '% Cicatrices', '% Cicatriz');
  mergeRenameColumn_(sheet, 'Cal. Ausencia de bloom', 'Cal. Sin Bloom');
  mergeRenameColumn_(sheet, 'N° Ausencia de bloom', 'N° Sin Bloom');
  mergeRenameColumn_(sheet, '% Ausencia de bloom', '% Sin Bloom');
  mergeRenameColumn_(sheet, 'Cal. Daño ave', 'Cal. Ave');
  mergeRenameColumn_(sheet, 'N° Daño ave', 'N° Picadura ave');
  mergeRenameColumn_(sheet, '% Daño ave', '% Picadura ave');
  mergeRenameColumn_(sheet, 'Cal. Deshidratación', 'Cal. Deshidratado');
  mergeRenameColumn_(sheet, 'N° Deshidratación', 'N° Deshidratado');
  mergeRenameColumn_(sheet, '% Deshidratación', '% Deshidratado');

  var obsolete = [
    'Ptos. Tot',
    'Pun. Calidad',
    'Ptos. Condición',
    'Ptos. Calidad def.',
    'Marca temporal',
    'Client ID',
    /* extras que no pediste — quitar si quedaron en la hoja */
    'Cal. Russet', 'N° Russet', '% Russet',
    'Cal. Pre calibre', 'N° Pre calibre', '% Pre calibre',
    'Cal. Pudrición', 'N° Pudrición', '% Pudrición',
    'Cal. Quemadura', 'N° Quemadura', '% Quemadura'
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

function getHeaders_(sheet) {
  var lastCol = Math.min(sheet.getLastColumn(), 120);
  if (lastCol < 1) return [];
  var row = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var out = [];
  for (var i = 0; i < row.length; i++) out.push(String(row[i] || '').trim());
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

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
    .addItem('Rellenar N° desde % (Calidad/Descarte)', 'backfillAllUnits_')
    .addToUi();
}

function backfillAllUnits_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['calidad', 'descarte'].forEach(function (key) {
    var def = SHEETS[key];
    var sheet = ss.getSheetByName(def.name);
    if (sheet) backfillUnitsFromPct_(sheet);
  });
  SpreadsheetApp.getUi().alert('Listo: unidades (N°) rellenadas desde % donde faltaban.');
}
