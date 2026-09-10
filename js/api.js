/** Persistencia local (IndexedDB) + cola de sync + envío a Google Apps Script */
window.QB = window.QB || {};

QB.API = (() => {
  const QUEUE_KEY = "qb_pending_queue"; // legacy localStorage (migración)
  const HISTORY_KEY = "qb_people_history";
  const CUSTOM_PEOPLE_KEY = "qb_custom_people";
  const CUSTOM_VALUES_KEY = "qb_custom_values";
  const ACTIVITY_KEY = "qb_activity";
  const DAY_STATS_KEY = "qb_day_stats"; // conteo preciso Total del día / por tipo
  const IDB_NAME = "qb_calidad_db";
  const IDB_STORE = "queue";
  const IDB_VER = 2;
  const HISTORY_TTL_MS = 12 * 60 * 60 * 1000; // 12 h — historial UI + cola crítica (antiguos no se borran)
  const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000; // sync automática de antiguos
  const LAST_SYNC_KEY = "qb_last_sync_at";
  const EVAL_TYPES = ["calidad", "descarte", "caida", "planta"];
  const TZ_OPS = "America/Lima";
  const BATCH_SIZE = 10; // 10–12: 10 más estable con GAS/Sheets sin saturar
  const FETCH_TIMEOUT_MS = 15000;
  const MAX_ATTEMPTS = 12;
  const MAX_BACKOFF_MS = 15 * 60 * 1000;
  const WATCHDOG_STALE_MS = 45000;
  const SYNC_PROGRESS_UI_MS = 450;
  const YIELD_BETWEEN_BATCH_MS = 48;

  /** Cola en memoria + conteo O(1) para no recorrer 300 ítems en cada chip */
  let memQueue = [];
  let pendingCountCache = 0;
  let idbReady = null;
  let dbPromise_ = null;
  let syncing = false;
  let syncAbortCtrl = null;
  let watchdogFired = false;
  let syncStartedAt = 0;
  let lastProgressAt = 0;
  let lastSyncUiEmitAt = 0;
  let watchdogTimer = null;
  let queueEventTimer = null;
  let softSendTimer = null;
  let activityBuf_ = [];
  let activityFlushTimer_ = null;

  function isFresh_(iso) {
    const t = new Date(iso || 0).getTime();
    if (!t || Number.isNaN(t)) return false;
    return Date.now() - t <= HISTORY_TTL_MS;
  }

  function dayKeyLima_(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ_OPS,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${m}-${day}`;
    }
  }

  function todayKey() {
    return dayKeyLima_();
  }

  function localDayKey(iso) {
    return dayKeyLima_(iso);
  }

  function normEvalType_(t) {
    const k = String(t || "").trim().toLowerCase();
    return EVAL_TYPES.includes(k) ? k : "";
  }

  function emptyByType_() {
    return { calidad: 0, descarte: 0, caida: 0, planta: 0 };
  }

  /** Día operativo: data.fecha (YYYY-MM-DD) o submittedAt en Lima */
  function opsDayKey_(record) {
    const f = String(
      (record && record.data && record.data.fecha) || record?.fecha || ""
    ).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
    return dayKeyLima_(record?.submittedAt || record?.at) || todayKey();
  }

  function loadDayStats_() {
    const day = todayKey();
    try {
      const raw = JSON.parse(localStorage.getItem(DAY_STATS_KEY) || "null");
      if (!raw || raw.day !== day) {
        return { day, total: 0, byType: emptyByType_(), ids: {} };
      }
      const byType = emptyByType_();
      const src = raw.byType || {};
      EVAL_TYPES.forEach((t) => {
        byType[t] = Number(src[t]) || 0;
      });
      const ids =
        raw.ids && typeof raw.ids === "object" && !Array.isArray(raw.ids)
          ? raw.ids
          : {};
      let total = 0;
      EVAL_TYPES.forEach((t) => {
        total += byType[t];
      });
      return { day, total, byType, ids };
    } catch {
      return { day, total: 0, byType: emptyByType_(), ids: {} };
    }
  }

  function saveDayStats_(stats) {
    try {
      localStorage.setItem(DAY_STATS_KEY, JSON.stringify(stats));
    } catch (_) {}
  }

  /** Registra 1 evaluación del día (idempotente por clientId) */
  function noteDayStat_(record) {
    const id = String(record?.clientId || "").trim();
    const type = normEvalType_(record?.type);
    if (!id || !type) return false;
    const opsDay = opsDayKey_(record);
    const today = todayKey();
    if (opsDay !== today) return false; // no inflar el KPI de hoy con otra fecha

    let stats = loadDayStats_();
    if (stats.day !== today) {
      stats = { day: today, total: 0, byType: emptyByType_(), ids: {} };
    }
    if (stats.ids[id]) return false;
    stats.ids[id] = type;
    stats.byType[type] = (Number(stats.byType[type]) || 0) + 1;
    stats.total =
      (Number(stats.byType.calidad) || 0) +
      (Number(stats.byType.descarte) || 0) +
      (Number(stats.byType.caida) || 0) +
      (Number(stats.byType.planta) || 0);
    saveDayStats_(stats);
    return true;
  }

  /** Reconstruye ledger del día: union cola + actividad + ledger (sin perder) */
  function rebuildDayStats_() {
    const day = todayKey();
    const ids = {};
    const byType = emptyByType_();

    function add(id, type, opsDay) {
      const t = normEvalType_(type);
      const cid = String(id || "").trim();
      if (!cid || !t || opsDay !== day || ids[cid]) return;
      ids[cid] = t;
      byType[t] += 1;
    }

    const prev = loadDayStats_();
    if (prev.day === day && prev.ids) {
      Object.keys(prev.ids).forEach((cid) => add(cid, prev.ids[cid], day));
    }

    for (let i = 0; i < memQueue.length; i++) {
      const q = memQueue[i];
      if (!q) continue;
      add(q.clientId, q.type, opsDayKey_(q));
    }

    try {
      const act = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
      if (Array.isArray(act)) {
        for (let i = 0; i < act.length; i++) {
          const a = act[i];
          if (!a) continue;
          const opsDay = a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha))
            ? String(a.fecha)
            : dayKeyLima_(a.at);
          add(a.clientId, a.type, opsDay);
        }
      }
    } catch (_) {}

    const total =
      byType.calidad + byType.descarte + byType.caida + byType.planta;
    saveDayStats_({ day, total, byType, ids });
    return { day, total, byType, ids };
  }

  function cryptoRandom() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `qb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function apiUrl_() {
    const raw = String((QB.CONFIG && (QB.CONFIG._ep || QB.CONFIG.API_URL)) || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    try {
      return atob(raw);
    } catch {
      return "";
    }
  }

  function emitQueue_() {
    if (queueEventTimer) return;
    queueEventTimer = setTimeout(() => {
      queueEventTimer = null;
      window.dispatchEvent(
        new CustomEvent("qb:queue", {
          detail: { count: pendingCountCache },
        })
      );
    }, 280);
  }

  function emitSync_(detail, force) {
    const phase = detail && detail.phase;
    const now = Date.now();
    if (
      !force &&
      phase === "progress" &&
      now - lastSyncUiEmitAt < SYNC_PROGRESS_UI_MS
    ) {
      return;
    }
    if (phase === "progress" || phase === "start" || phase === "done") {
      lastSyncUiEmitAt = now;
    }
    window.dispatchEvent(new CustomEvent("qb:sync", { detail: detail || {} }));
  }

  function refreshPendingCount_() {
    let n = 0;
    for (let i = 0; i < memQueue.length; i++) {
      if (memQueue[i] && memQueue[i].status !== "sent") n += 1;
    }
    pendingCountCache = n;
  }

  function getLastSyncAt_() {
    return Number(localStorage.getItem(LAST_SYNC_KEY) || 0) || 0;
  }

  function markLastSync_() {
    try {
      localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
    } catch (_) {}
  }

  /** Sync de antiguos (>12 h) solo en ciclo 12 h o manual */
  function shouldAutoSync_() {
    return Date.now() - getLastSyncAt_() >= SYNC_INTERVAL_MS;
  }

  function isRecent_(iso) {
    return isFresh_(iso);
  }

  function yieldToUi_() {
    return new Promise((resolve) => {
      const ms = document.hidden ? 16 : YIELD_BETWEEN_BATCH_MS;
      const done = () => setTimeout(resolve, ms);
      if (typeof requestAnimationFrame === "function" && !document.hidden) {
        requestAnimationFrame(() => done());
      } else {
        done();
      }
    });
  }

  /** Yield mínimo (no espera 48ms) — para no bloquear en stringify */
  function tick_() {
    return new Promise((r) => setTimeout(r, 0));
  }

  function touchProgress_() {
    lastProgressAt = Date.now();
  }

  function clearWatchdog_() {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function startWatchdog_() {
    clearWatchdog_();
    syncStartedAt = Date.now();
    watchdogFired = false;
    touchProgress_();
    watchdogTimer = setInterval(() => {
      if (!syncing) {
        clearWatchdog_();
        return;
      }
      if (Date.now() - lastProgressAt > WATCHDOG_STALE_MS) {
        watchdogFired = true;
        try {
          if (syncAbortCtrl) syncAbortCtrl.abort();
        } catch (_) {}
      }
    }, 5000);
  }

  /* ——— IndexedDB (conexión cacheada) ——— */
  function openDb_() {
    if (dbPromise_) return dbPromise_;
    dbPromise_ = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        dbPromise_ = null;
        reject(new Error("no-idb"));
        return;
      }
      const req = indexedDB.open(IDB_NAME, IDB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        let store;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          store = db.createObjectStore(IDB_STORE, { keyPath: "clientId" });
        } else {
          store = req.transaction.objectStore(IDB_STORE);
        }
        try {
          if (!store.indexNames.contains("byStatus")) {
            store.createIndex("byStatus", "status", { unique: false });
          }
          if (!store.indexNames.contains("bySubmittedAt")) {
            store.createIndex("bySubmittedAt", "submittedAt", { unique: false });
          }
        } catch (_) {}
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch (_) {}
          dbPromise_ = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise_ = null;
        reject(req.error || new Error("idb-open"));
      };
    });
    return dbPromise_;
  }

  function idbReq_(fn, mode) {
    return openDb_().then(
      (db) =>
        new Promise((resolve, reject) => {
          let tx;
          try {
            tx = db.transaction(IDB_STORE, mode || "readwrite");
          } catch (e) {
            reject(e);
            return;
          }
          const store = tx.objectStore(IDB_STORE);
          let req;
          let result;
          try {
            req = fn(store);
          } catch (e) {
            reject(e);
            return;
          }
          if (req) {
            req.onsuccess = () => {
              result = req.result;
            };
            req.onerror = () => reject(req.error || new Error("idb-req"));
          }
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error || new Error("idb-tx"));
        })
    );
  }

  function idbGetAll_() {
    return idbReq_((store) => store.getAll(), "readonly").then((rows) =>
      Array.isArray(rows) ? rows : []
    );
  }

  function idbPut_(item) {
    return idbReq_((store) => store.put(item));
  }

  function idbDelete_(clientId) {
    return idbReq_((store) => store.delete(String(clientId)));
  }

  /** Varios put/delete en UNA transacción (evita N opens durante sync) */
  function idbMutateBatch_(puts, deletes) {
    return openDb_().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          (puts || []).forEach((it) => store.put(it));
          (deletes || []).forEach((id) => store.delete(String(id)));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error("idb-batch"));
        })
    );
  }

  function idbClear_() {
    return idbReq_((store) => store.clear());
  }

  function idbReplaceAll_(items) {
    return openDb_().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          const store = tx.objectStore(IDB_STORE);
          store.clear();
          (items || []).forEach((it) => store.put(it));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error("idb-replace"));
        })
    );
  }

  function lsGetQueueRaw_() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function normalizeQueueItem_(record) {
    const id = String(record?.clientId || "").trim() || cryptoRandom();
    return {
      type: normEvalType_(record?.type) || record?.type,
      sheet: record?.sheet,
      clientId: id,
      data: record?.data || {},
      score: record?.score || {},
      submittedAt: record?.submittedAt || new Date().toISOString(),
      status: record?.status || "pending",
      attempts: Number(record?.attempts) || 0,
      nextRetryAt: Number(record?.nextRetryAt) || 0,
      lastError: record?.lastError || "",
      updatedAt: Date.now(),
    };
  }

  async function hydrateQueue_() {
    let fromIdb = [];
    try {
      fromIdb = await idbGetAll_();
    } catch {
      fromIdb = [];
    }
    const fromLs = lsGetQueueRaw_().map(normalizeQueueItem_);
    const map = new Map();
    [...fromIdb, ...fromLs].forEach((raw) => {
      const item = normalizeQueueItem_(raw);
      if (!item.clientId) return;
      const prev = map.get(item.clientId);
      if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) {
        map.set(item.clientId, item);
      }
    });
    memQueue = Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.submittedAt || 0).getTime() -
        new Date(b.submittedAt || 0).getTime()
    );
    // Recuperar "sending" huérfanos (cierre durante sync)
    const now = Date.now();
    for (let i = 0; i < memQueue.length; i++) {
      const it = memQueue[i];
      if (it && it.status === "sending") {
        it.status = "pending";
        it.updatedAt = now;
      }
    }
    refreshPendingCount_();
    // Persistir unificado en IDB y retirar LS legacy (evita pegar main thread)
    if (window.indexedDB) {
      try {
        await idbReplaceAll_(memQueue);
        localStorage.removeItem(QUEUE_KEY);
      } catch {
        try {
          localStorage.setItem(QUEUE_KEY, JSON.stringify(memQueue));
        } catch (_) {}
      }
    } else {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(memQueue));
      } catch (_) {}
    }
    emitQueue_();
    try {
      rebuildDayStats_();
    } catch (_) {}
    return memQueue;
  }

  function ensureReady_() {
    if (!idbReady) {
      idbReady = hydrateQueue_().catch(() => {
        memQueue = lsGetQueueRaw_().map(normalizeQueueItem_);
        refreshPendingCount_();
        return memQueue;
      });
    }
    return idbReady;
  }

  /** Tras guardar / reabrir: envía pendientes recientes (≤12 h) en 2º plano */
  function scheduleSoftSend_() {
    if (softSendTimer) clearTimeout(softSendTimer);
    softSendTimer = setTimeout(() => {
      softSendTimer = null;
      if (!navigator.onLine || syncing) return;
      flushQueue({ soft: true, includeOld: false }).catch(() => {});
    }, 600);
  }

  ensureReady_();

  async function persistItem_(item, opts) {
    const entry = normalizeQueueItem_(item);
    const idx = memQueue.findIndex((x) => x.clientId === entry.clientId);
    if (idx >= 0) memQueue[idx] = entry;
    else memQueue.push(entry);
    refreshPendingCount_();
    try {
      await idbPut_(entry);
    } catch {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(memQueue));
      } catch (_) {}
    }
    if (!opts || !opts.silent) emitQueue_();
    return entry;
  }

  async function removeItem_(clientId) {
    const id = String(clientId || "").trim();
    if (!id) return;
    memQueue = memQueue.filter((x) => x.clientId !== id);
    refreshPendingCount_();
    try {
      await idbDelete_(id);
    } catch {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(memQueue));
      } catch (_) {}
    }
    emitQueue_();
  }

  function getQueue() {
    // Solo copia liviana para callers; no mutar memQueue
    return memQueue.slice();
  }

  function pendingCount() {
    return pendingCountCache;
  }

  /** Pendientes >12h siguen en IDB; no se borran */
  function pendingOldCount() {
    let n = 0;
    for (let i = 0; i < memQueue.length; i++) {
      const q = memQueue[i];
      if (!q || q.status === "sent") continue;
      if (!isRecent_(q.submittedAt || q.at)) n += 1;
    }
    return n;
  }

  function isSyncing() {
    return syncing;
  }

  function whenReady() {
    return ensureReady_();
  }

  function backoffMs_(attempts) {
    const n = Math.max(0, Number(attempts) || 0);
    return Math.min(MAX_BACKOFF_MS, 1500 * Math.pow(2, Math.min(n, 8)));
  }

  /* ——— Personas / actividad (localStorage liviano) ——— */
  function pruneActivity_() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
      if (!Array.isArray(raw) || !raw.length) return [];
      const day = todayKey();
      // Conservar: frescos (12 h) O del día operativo actual (KPI / historial del día)
      const kept = raw.filter((a) => {
        if (!a) return false;
        if (isFresh_(a.at)) return true;
        const ops =
          a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha))
            ? String(a.fecha)
            : dayKeyLima_(a.at);
        return ops === day;
      });
      if (kept.length !== raw.length) {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(kept.slice(0, 200)));
        window.dispatchEvent(new Event("qb:activity"));
      }
      return kept;
    } catch {
      return [];
    }
  }

  function rememberPerson(kind, name) {
    if (!name || !name.trim()) return;
    const all = getHistory();
    if (!all[kind]) all[kind] = [];
    const n = name.trim();
    all[kind] = [n, ...all[kind].filter((x) => x.toLowerCase() !== n.toLowerCase())].slice(0, 40);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function getCustomPeople_() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_PEOPLE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function getCustomValues_() {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_VALUES_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function rememberCustomPerson(kind, dni, nombre) {
    const d = String(dni || "").replace(/\D/g, "").trim();
    const n = String(nombre || "").trim();
    if (!d || !n) return null;
    const label =
      window.QB?.Data?.personLabel?.(d, n) || `${d} — ${n}`;
    rememberPerson(kind, label);
    const all = getCustomPeople_();
    if (!all[kind]) all[kind] = {};
    all[kind][d] = { nombre: n, at: Date.now() };
    localStorage.setItem(CUSTOM_PEOPLE_KEY, JSON.stringify(all));
    return { dni: d, nombre: n, label };
  }

  function customPeopleOptions(kind, query) {
    const map = getCustomPeople_()[kind] || {};
    const q = String(query || "").trim().toLowerCase();
    const digits = String(query || "").replace(/\D/g, "");
    const out = [];
    Object.keys(map).forEach((dni) => {
      const p = map[dni];
      const nombre = (p.nombre || "").trim();
      const byDni = digits.length >= 2 && dni.includes(digits);
      const byName = q.length >= 2 && nombre.toLowerCase().includes(q);
      if (q && !byDni && !byName) return;
      const short = window.QB?.Data?.shortName?.(nombre) || nombre;
      out.push({
        id: window.QB?.Data?.personLabel?.(dni, nombre) || `${dni} — ${short}`,
        label: nombre || dni,
        meta: "Local · emergencia",
        nombre,
        nombreCorto: short,
        dni: String(dni),
        local: true,
      });
    });
    return out;
  }

  function rememberCustomValue(kind, value) {
    const v = String(value || "").trim();
    if (!v) return;
    rememberPerson(kind, v);
    const all = getCustomValues_();
    if (!all[kind]) all[kind] = [];
    all[kind] = [v, ...all[kind].filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 30);
    localStorage.setItem(CUSTOM_VALUES_KEY, JSON.stringify(all));
  }

  function customValueOptions(kind, query) {
    const list = getCustomValues_()[kind] || [];
    const q = String(query || "").trim().toLowerCase();
    return list
      .filter((v) => !q || String(v).toLowerCase().includes(q))
      .map((v) => ({ id: v, label: v, meta: "Local · emergencia", customText: true }));
  }

  function activityEntryLight_(record) {
    const data = record.data || {};
    const fecha =
      String(data.fecha || "").trim() ||
      dayKeyLima_(record.submittedAt) ||
      "";
    return {
      clientId: String(record.clientId || "").trim(),
      type: normEvalType_(record.type) || record.type,
      nota: record.score?.nota,
      calidadGlobal: record.score?.calidadGlobal,
      evaluador: data.evaluador || "",
      cosechador: data.cosechador || "",
      variedad: data.variedad || "",
      modulo: data.modulo || "",
      lote: data.lote || "",
      turno: data.turno != null && data.turno !== "" ? String(data.turno) : "",
      fecha,
      at: record.submittedAt || new Date().toISOString(),
    };
  }

  function flushActivityBuf_() {
    if (activityFlushTimer_) {
      clearTimeout(activityFlushTimer_);
      activityFlushTimer_ = null;
    }
    if (!activityBuf_.length) return;
    try {
      let list = pruneActivity_();
      const buf = activityBuf_;
      activityBuf_ = [];
      for (let i = 0; i < buf.length; i++) {
        const entry = buf[i];
        const id = String(entry.clientId || "").trim();
        list = id ? list.filter((a) => String(a.clientId || "") !== id) : list;
        list.unshift(entry);
      }
      const day = todayKey();
      const kept = list.filter((a) => {
        if (isFresh_(a.at)) return true;
        const ops =
          a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha))
            ? String(a.fecha)
            : dayKeyLima_(a.at);
        return ops === day;
      });
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(kept.slice(0, 200)));
      window.dispatchEvent(new Event("qb:activity"));
    } catch {
      activityBuf_ = [];
    }
  }

  function logActivity(record, opts) {
    try {
      const entry = activityEntryLight_(record);
      if (opts && opts.buffer) {
        activityBuf_.push(entry);
        if (!activityFlushTimer_) {
          activityFlushTimer_ = setTimeout(flushActivityBuf_, 500);
        }
        return;
      }
      activityBuf_.push(entry);
      flushActivityBuf_();
    } catch {
      /* ignore */
    }
  }

  function getActivity() {
    flushActivityBuf_();
    return pruneActivity_();
  }

  function queueToHistoryEntry(item, light) {
    const d = item.data || {};
    const s = item.score || {};
    const at = item.submittedAt || item.at || "";
    const type = normEvalType_(item.type) || item.type || "";
    let lote = d.lote || "";
    let modulo = d.modulo || "";
    let turno = d.turno != null && d.turno !== "" ? String(d.turno) : "";
    // loteMeta es caro: solo en historial visible, no en KPIs
    if (!light && lote && window.QB?.Data?.loteMeta) {
      const meta = QB.Data.loteMeta(lote);
      if (meta.modulo) modulo = meta.modulo;
      if (meta.turno) turno = meta.turno;
      if (meta.lote) lote = meta.lote;
    }
    return {
      id: item.clientId || at || `pending_${Math.random().toString(36).slice(2, 8)}`,
      clientId: item.clientId || "",
      type,
      at,
      evaluador: d.evaluador || "",
      cosechador: d.cosechador || "",
      variedad: d.variedad || "",
      lote,
      modulo,
      turno,
      nota: s.nota,
      calidadGlobal: s.calidadGlobal || "",
      status: "pending",
    };
  }

  /**
   * Historial UI: solo últimas 12 h.
   * Pendientes antiguos permanecen en IDB (fuera del flujo crítico).
   */
  function getUploadHistory() {
    const seen = new Set();
    const queue = [];
    for (let i = 0; i < memQueue.length; i++) {
      const item = memQueue[i];
      if (!item || item.status === "sent") continue;
      if (!isRecent_(item.submittedAt || item.at)) continue;
      const entry = queueToHistoryEntry(item);
      const id = String(entry.clientId || "").trim();
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      queue.push(entry);
    }
    const activity = getActivity()
      .filter((a) => {
        const id = String(a.clientId || "").trim();
        return !id || !seen.has(id);
      })
      .map((a, i) => {
        const id = String(a.clientId || "").trim();
        if (id) seen.add(id);
        return {
          ...a,
          type: normEvalType_(a.type) || a.type || "",
          id: id || `${a.at || i}|${a.type}|${a.evaluador || ""}`,
          status: "sent",
        };
      });
    return [...queue, ...activity].sort(
      (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
    );
  }

  /** KPIs del día — ledger O(1); rebuild solo si el día cambió */
  function getTodayOpsStats() {
    flushActivityBuf_();
    const day = todayKey();
    let stats = loadDayStats_();
    if (stats.day !== day) {
      stats = rebuildDayStats_();
    }

    let last = null;
    let pendingToday = 0;

    for (let i = 0; i < memQueue.length; i++) {
      const q = memQueue[i];
      if (!q || q.status === "sent") continue;
      if (opsDayKey_(q) !== day) continue;
      pendingToday += 1;
      const at = q.submittedAt || q.at || "";
      if (!last || new Date(at).getTime() > new Date(last.at || 0).getTime()) {
        last = queueToHistoryEntry(q, true);
      }
    }

    if (!last) {
      const activity = getActivity();
      for (let i = 0; i < activity.length; i++) {
        const a = activity[i];
        const ops =
          a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(a.fecha))
            ? String(a.fecha)
            : dayKeyLima_(a.at);
        if (ops !== day) continue;
        last = { ...a, status: "sent" };
        break;
      }
    }

    return {
      day,
      total: stats.total,
      byType: { ...emptyByType_(), ...stats.byType },
      pending: pendingCountCache,
      pendingToday,
      pendingOld: pendingOldCount(),
      last,
    };
  }

  function startHistoryCleanup() {
    pruneActivity_();
    try {
      if (window.__qbHistClean) clearInterval(window.__qbHistClean);
      window.__qbHistClean = setInterval(pruneActivity_, 60 * 60 * 1000);
    } catch (_) {}
  }

  startHistoryCleanup();

  function isServerOk(json) {
    return (
      json &&
      json.ok !== false &&
      (json.created === true || json.duplicate === true || json.ok === true)
    );
  }

  async function fetchJson_(url, bodyObj, timeoutMs, externalSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || FETCH_TIMEOUT_MS);
    const onExtAbort = () => {
      try {
        ctrl.abort();
      } catch (_) {}
    };
    if (externalSignal) {
      if (externalSignal.aborted) onExtAbort();
      else externalSignal.addEventListener("abort", onExtAbort, { once: true });
    }
    try {
      await tick_();
      const body = JSON.stringify(bodyObj);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        redirect: "follow",
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { res, json, text };
    } finally {
      clearTimeout(timer);
      if (externalSignal) {
        try {
          externalSignal.removeEventListener("abort", onExtAbort);
        } catch (_) {}
      }
    }
  }

  /** Score liviano para red (Sheets solo usa id/pct/calificacion en rows) */
  function slimScore_(score) {
    if (!score || typeof score !== "object") return {};
    const rowsIn = Array.isArray(score.rows) ? score.rows : [];
    const rows = new Array(rowsIn.length);
    for (let i = 0; i < rowsIn.length; i++) {
      const r = rowsIn[i] || {};
      rows[i] = { id: r.id, pct: r.pct, calificacion: r.calificacion };
    }
    return {
      nota: score.nota,
      calidadGlobal: score.calidadGlobal,
      pctCalidad: score.pctCalidad,
      sumaDefectos: score.sumaDefectos,
      sumaDefCal: score.sumaDefCal,
      sumaDefCon: score.sumaDefCon,
      ptsTot: score.ptsTot,
      ptsPromedio: score.ptsPromedio,
      promedio: score.promedio,
      rows,
    };
  }

  function toWirePayload_(item) {
    return {
      action: "save",
      type: item.type,
      sheet: item.sheet,
      clientId: item.clientId,
      data: item.data,
      score: slimScore_(item.score),
      submittedAt: item.submittedAt,
    };
  }

  /**
   * Offline-first: guarda en IndexedDB y responde YA.
   * El envío a red es en segundo plano (soft) — no bloquea formularios.
   */
  async function submit(payload) {
    await ensureReady_();
    const record = normalizeQueueItem_({
      ...payload,
      type: normEvalType_(payload.type) || payload.type,
      clientId: payload.clientId || cryptoRandom(),
      submittedAt: payload.submittedAt || new Date().toISOString(),
      status: "pending",
      attempts: 0,
      nextRetryAt: 0,
    });

    if (record.data) {
      rememberPerson("evaluador", record.data.evaluador);
      rememberPerson("supervisor", record.data.supervisor);
      rememberPerson("cosechador", record.data.cosechador);
      rememberPerson("turno", record.data.turno);
    }

    await persistItem_(record);
    noteDayStat_(record);

    const url = apiUrl_();
    if (!url) {
      logActivity(record);
      await removeItem_(record.clientId);
      return { ok: true, mode: "demo", message: "Guardado local", local: true, synced: true };
    }

    if (navigator.onLine) scheduleSoftSend_();

    return {
      ok: true,
      queued: true,
      local: true,
      offline: !navigator.onLine,
      clientId: record.clientId,
    };
  }

  /** Siguiente lote pequeño (sin sort completo de toda la cola) */
  function nextDueBatch_(opts = {}) {
    const now = Date.now();
    const includeOld = !!opts.includeOld;
    const limit = opts.limit || BATCH_SIZE;
    const out = [];
    for (let i = 0; i < memQueue.length; i++) {
      const x = memQueue[i];
      if (!x || !x.clientId) continue;
      if ((Number(x.attempts) || 0) >= MAX_ATTEMPTS) continue;
      if (!includeOld && !isRecent_(x.submittedAt || x.at)) continue;
      const st = x.status || "pending";
      if (st === "sending") {
        // No re-encolar mid-flight; recover solo al boot
        continue;
      }
      if (st === "pending" || st === "error") {
        if (!x.nextRetryAt || Number(x.nextRetryAt) <= now) {
          out.push(x);
          if (out.length >= limit) break;
        }
      }
    }
    return out;
  }

  function countDue_(includeOld) {
    const now = Date.now();
    let n = 0;
    for (let i = 0; i < memQueue.length; i++) {
      const x = memQueue[i];
      if (!x || !x.clientId) continue;
      if ((Number(x.attempts) || 0) >= MAX_ATTEMPTS) continue;
      if (!includeOld && !isRecent_(x.submittedAt || x.at)) continue;
      const st = x.status || "pending";
      if (st === "pending" || st === "error") {
        if (!x.nextRetryAt || Number(x.nextRetryAt) <= now) n += 1;
      }
    }
    return n;
  }

  async function applyBatchOutcome_(batch, resultsById) {
    const toDelete = [];
    const toPut = [];
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const r = resultsById[item.clientId];
      if (r && (r.ok === true || r.created === true || r.duplicate === true)) {
        toDelete.push(item.clientId);
        logActivity(item, { buffer: true });
        sent += 1;
      } else {
        item.attempts = (Number(item.attempts) || 0) + 1;
        item.status = "error";
        item.lastError = String((r && r.error) || "batch-fail").slice(0, 180);
        item.nextRetryAt = Date.now() + backoffMs_(item.attempts);
        item.updatedAt = Date.now();
        toPut.push(item);
        failed += 1;
      }
    }

    const delSet = new Set(toDelete);
    if (toDelete.length) {
      memQueue = memQueue.filter((x) => !delSet.has(x.clientId));
    }
    for (let i = 0; i < toPut.length; i++) {
      const entry = toPut[i];
      const idx = memQueue.findIndex((x) => x.clientId === entry.clientId);
      if (idx >= 0) memQueue[idx] = entry;
    }
    refreshPendingCount_();

    try {
      await idbMutateBatch_(toPut, toDelete);
    } catch {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(memQueue));
      } catch (_) {}
    }

    return { sent, failed };
  }

  /**
   * Un solo proceso de sync (mutex + watchdog).
   * Lotes de 10 → batchSave. Yield al UI entre lotes.
   * "sending" solo en memoria (IDB al confirmar/fallar).
   */
  async function flushQueue(opts = {}) {
    await ensureReady_();
    const manual = !!opts.manual;
    const soft = !!opts.soft;
    const includeOld =
      manual || opts.includeOld === true || (!soft && shouldAutoSync_());

    if (syncing) {
      return { sent: 0, remain: pendingCount(), busy: true };
    }
    if (!navigator.onLine) {
      return { sent: 0, remain: pendingCount(), offline: true };
    }

    const url = apiUrl_();
    if (!url) return { sent: 0, remain: pendingCount(), noUrl: true };

    const totalStart = countDue_(includeOld);
    if (!totalStart) {
      if (manual || !soft) markLastSync_();
      return { sent: 0, remain: pendingCount(), empty: true };
    }

    syncing = true;
    syncAbortCtrl = new AbortController();
    startWatchdog_();
    let sent = 0;
    let failed = 0;
    let stale = false;

    emitSync_(
      {
        phase: "start",
        sent: 0,
        total: totalStart,
        remain: pendingCount(),
        message: `Sincronizando 0 de ${totalStart}...`,
      },
      true
    );

    try {
      while (navigator.onLine && !watchdogFired) {
        if (Date.now() - lastProgressAt > WATCHDOG_STALE_MS) {
          stale = true;
          break;
        }

        const batch = nextDueBatch_({ includeOld, limit: BATCH_SIZE });
        if (!batch.length) break;

        for (let i = 0; i < batch.length; i++) {
          batch[i].status = "sending";
          batch[i].updatedAt = Date.now();
        }

        let results = null;
        try {
          const { res, json } = await fetchJson_(
            url,
            {
              action: "batchSave",
              records: batch.map(toWirePayload_),
            },
            FETCH_TIMEOUT_MS,
            syncAbortCtrl.signal
          );
          if (res.ok && json && json.ok !== false && Array.isArray(json.results)) {
            results = json.results;
          }
        } catch (err) {
          if (err?.name === "AbortError") {
            for (let i = 0; i < batch.length; i++) {
              batch[i].status = "error";
              batch[i].attempts = (Number(batch[i].attempts) || 0) + 1;
              batch[i].lastError = watchdogFired ? "watchdog" : "timeout";
              batch[i].nextRetryAt = Date.now() + backoffMs_(batch[i].attempts);
              batch[i].updatedAt = Date.now();
            }
            try {
              await idbMutateBatch_(batch, []);
            } catch (_) {}
            failed += batch.length;
            if (watchdogFired) {
              stale = true;
              break;
            }
            touchProgress_();
            await yieldToUi_();
            continue;
          }
          results = null;
        }

        if (results) {
          const byId = {};
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r && r.clientId) byId[String(r.clientId)] = r;
          }
          const out = await applyBatchOutcome_(batch, byId);
          sent += out.sent;
          failed += out.failed;
          touchProgress_();
        } else {
          for (let i = 0; i < batch.length; i++) {
            if (!navigator.onLine || watchdogFired) break;
            const item = batch[i];
            try {
              const { res, json } = await fetchJson_(
                url,
                toWirePayload_(item),
                FETCH_TIMEOUT_MS,
                syncAbortCtrl.signal
              );
              if (res.ok && isServerOk(json)) {
                memQueue = memQueue.filter((x) => x.clientId !== item.clientId);
                refreshPendingCount_();
                try {
                  await idbDelete_(item.clientId);
                } catch (_) {}
                logActivity(item, { buffer: true });
                sent += 1;
              } else {
                item.attempts = (Number(item.attempts) || 0) + 1;
                item.status = "error";
                item.lastError = String(
                  (json && (json.error || json.message)) || `HTTP ${res.status}`
                ).slice(0, 180);
                item.nextRetryAt = Date.now() + backoffMs_(item.attempts);
                item.updatedAt = Date.now();
                try {
                  await idbPut_(item);
                } catch (_) {}
                failed += 1;
              }
            } catch (err) {
              item.status = "error";
              item.attempts = (Number(item.attempts) || 0) + 1;
              item.lastError = String(
                err?.name === "AbortError" ? "timeout" : err?.message || "network"
              ).slice(0, 180);
              item.nextRetryAt = Date.now() + backoffMs_(item.attempts);
              item.updatedAt = Date.now();
              try {
                await idbPut_(item);
              } catch (_) {}
              failed += 1;
              if (err?.name === "AbortError" && watchdogFired) break;
            }
            touchProgress_();
            await tick_();
          }
        }

        emitSync_({
          phase: "progress",
          sent,
          total: totalStart,
          remain: pendingCount(),
          message: `Sincronizando ${sent} de ${totalStart}...`,
        });
        if (typeof opts.onProgress === "function") {
          try {
            opts.onProgress({ sent, total: totalStart, remain: pendingCount(), failed });
          } catch (_) {}
        }

        await yieldToUi_();
      }

      if (!stale) markLastSync_();
    } finally {
      clearWatchdog_();
      syncAbortCtrl = null;
      watchdogFired = false;
      const stuck = [];
      for (let i = 0; i < memQueue.length; i++) {
        const it = memQueue[i];
        if (it && it.status === "sending") {
          it.status = "pending";
          it.updatedAt = Date.now();
          stuck.push(it);
        }
      }
      if (stuck.length) {
        try {
          await idbMutateBatch_(stuck, []);
        } catch (_) {}
      }
      flushActivityBuf_();
      refreshPendingCount_();
      syncing = false;
      const remain = pendingCount();
      emitSync_(
        {
          phase: "done",
          sent,
          failed,
          total: totalStart,
          remain,
          stale: !!stale,
          message: stale
            ? `Sincronización interrumpida · ${sent} enviados · ${remain} pendientes.`
            : remain
              ? `${sent} enviados · ${remain} pendientes de reintento.`
              : sent
                ? `${sent} registros sincronizados correctamente.`
                : "",
        },
        true
      );
      emitQueue_();
    }

    return { sent, failed, remain: pendingCount(), total: totalStart, stale };
  }

  function sleep_(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function waitForOnline_(signal) {
    if (navigator.onLine) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onOnline = () => {
        cleanup();
        resolve();
      };
      const onAbort = () => {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      };
      const cleanup = () => {
        window.removeEventListener("online", onOnline);
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      window.addEventListener("online", onOnline, { once: true });
      if (signal) {
        if (signal.aborted) {
          cleanup();
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  /**
   * Sync agresivo hasta vaciar la cola (modo transferencia / cierre de día).
   * Incluye pendientes viejos. Reintenta si hay red; espera si no hay.
   */
  async function flushUntilEmpty(opts = {}) {
    await ensureReady_();
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
    const signal = opts.signal || null;
    let totalSent = 0;
    let rounds = 0;
    const maxRounds = 800;
    const startRemain = pendingCount();

    onProgress?.({
      phase: "start",
      sent: 0,
      remain: startRemain,
      total: startRemain,
      message: startRemain ? `Preparando ${startRemain} pendientes…` : "Sin pendientes",
    });

    while (rounds++ < maxRounds) {
      if (signal?.aborted) {
        return { ok: false, aborted: true, sent: totalSent, remain: pendingCount() };
      }

      const remain = pendingCount();
      if (!remain) {
        markLastSync_();
        onProgress?.({
          phase: "done",
          sent: totalSent,
          remain: 0,
          total: Math.max(startRemain, totalSent),
          message: "Todo enviado · 0 pendientes",
        });
        return { ok: true, sent: totalSent, remain: 0 };
      }

      if (!navigator.onLine) {
        onProgress?.({
          phase: "offline",
          sent: totalSent,
          remain,
          total: Math.max(startRemain, totalSent + remain),
          message: `Sin señal · ${remain} en espera. Reintentará al volver internet.`,
        });
        try {
          await waitForOnline_(signal);
        } catch {
          return { ok: false, aborted: true, sent: totalSent, remain: pendingCount() };
        }
        continue;
      }

      if (syncing) {
        await sleep_(350);
        continue;
      }

      const before = remain;
      const r = await flushQueue({
        manual: true,
        includeOld: true,
        onProgress: (p) => {
          onProgress?.({
            phase: "sync",
            sent: totalSent + (p.sent || 0),
            remain: p.remain != null ? p.remain : pendingCount(),
            total: Math.max(startRemain, totalSent + before),
            message: p.message || `Enviando… quedan ${pendingCount()}`,
          });
        },
      });

      totalSent += r.sent || 0;
      const after = pendingCount();

      onProgress?.({
        phase: r.offline ? "offline" : after ? "sync" : "done",
        sent: totalSent,
        remain: after,
        total: Math.max(startRemain, totalSent + after),
        message: after
          ? `Enviados ${totalSent} · quedan ${after}`
          : "Todo enviado · 0 pendientes",
      });

      if (!after) {
        markLastSync_();
        return { ok: true, sent: totalSent, remain: 0 };
      }

      if (r.offline) {
        try {
          await waitForOnline_(signal);
        } catch {
          return { ok: false, aborted: true, sent: totalSent, remain: pendingCount() };
        }
        continue;
      }

      // Si no avanzó, pausa corta y reintenta (backoff / red inestable)
      if (!(r.sent > 0)) await sleep_(1200);
      else await yieldToUi_();
    }

    return { ok: false, timeout: true, sent: totalSent, remain: pendingCount() };
  }

  return {
    submit,
    flushQueue,
    flushUntilEmpty,
    newClientId: cryptoRandom,
    rememberPerson,
    rememberCustomPerson,
    customPeopleOptions,
    rememberCustomValue,
    customValueOptions,
    getQueue,
    pendingCount,
    pendingOldCount,
    isSyncing,
    whenReady,
    getLastSyncAt: getLastSyncAt_,
    shouldAutoSync: shouldAutoSync_,
    getActivity,
    logActivity,
    getUploadHistory,
    getTodayOpsStats,
    todayKey,
    localDayKey,
  };
})();
