/** Persistencia local + envío a Google Apps Script */
window.QB = window.QB || {};

QB.API = (() => {
  const QUEUE_KEY = "qb_pending_queue";
  const HISTORY_KEY = "qb_people_history";
  const CUSTOM_PEOPLE_KEY = "qb_custom_people";
  const CUSTOM_VALUES_KEY = "qb_custom_values";
  const ACTIVITY_KEY = "qb_activity";
  const HISTORY_TTL_MS = 48 * 60 * 60 * 1000; // 48 h
  const EVAL_TYPES = ["calidad", "descarte", "caida", "planta"];
  const TZ_OPS = "America/Lima";

  function isFresh_(iso) {
    const t = new Date(iso || 0).getTime();
    if (!t || Number.isNaN(t)) return false;
    return Date.now() - t <= HISTORY_TTL_MS;
  }

  /** Día operativo Perú (YYYY-MM-DD). Evita desfases UTC de noche. */
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

  /** Limpia historial > 48 h (no toca cola pendiente) */
  function pruneActivity_() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]");
      if (!Array.isArray(raw) || !raw.length) return [];
      const kept = raw.filter((a) => isFresh_(a.at));
      if (kept.length !== raw.length) {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(kept));
        window.dispatchEvent(new Event("qb:activity"));
      }
      return kept;
    } catch {
      return [];
    }
  }

  function getQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function setQueue(q) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
    window.dispatchEvent(new CustomEvent("qb:queue", { detail: { count: q.length } }));
  }

  function pendingCount() {
    return getQueue().length;
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

  function peopleOptions(kind) {
    const list = getHistory()[kind] || [];
    return list.map((n) => ({ id: n, label: n, meta: "Reciente" }));
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

  /** Persona de emergencia — solo local, no modifica JSON del servidor */
  function rememberCustomPerson(kind, dni, nombre) {
    const d = String(dni || "").replace(/\D/g, "").trim();
    const n = String(nombre || "").trim();
    if (!d || !n) return null;
    const label =
      window.QB?.Data?.personLabel?.(d, n) ||
      `${d} — ${n}`;
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

  /** Valor libre (lote, variedad, etc.) — solo local */
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

  function logActivity(record) {
    try {
      const list = pruneActivity_();
      const data = record.data || {};
      let lote = data.lote || "";
      let modulo = data.modulo || "";
      let turno = data.turno != null && data.turno !== "" ? String(data.turno) : "";
      if (lote && window.QB?.Data?.loteMeta) {
        const meta = QB.Data.loteMeta(lote);
        if (meta.modulo) modulo = meta.modulo;
        if (meta.turno) turno = meta.turno;
        if (meta.lote) lote = meta.lote;
      }
      const clientId = String(record.clientId || "").trim();
      const entry = {
        clientId,
        type: normEvalType_(record.type) || record.type,
        nota: record.score?.nota,
        calidadGlobal: record.score?.calidadGlobal,
        evaluador: data.evaluador || "",
        cosechador: data.cosechador || "",
        variedad: data.variedad || "",
        modulo,
        lote,
        turno,
        at: record.submittedAt || new Date().toISOString(),
      };
      // Evitar duplicar el mismo envío en historial
      const next = clientId
        ? list.filter((a) => String(a.clientId || "") !== clientId)
        : list;
      next.unshift(entry);
      localStorage.setItem(
        ACTIVITY_KEY,
        JSON.stringify(next.filter((a) => isFresh_(a.at)).slice(0, 80))
      );
      window.dispatchEvent(new Event("qb:activity"));
    } catch {
      /* ignore */
    }
  }

  function getActivity() {
    return pruneActivity_();
  }

  function queueToHistoryEntry(item) {
    const d = item.data || {};
    const s = item.score || {};
    const at = item.submittedAt || item.at || "";
    const type = normEvalType_(item.type) || item.type || "";
    let lote = d.lote || "";
    let modulo = d.modulo || "";
    let turno = d.turno != null && d.turno !== "" ? String(d.turno) : "";
    if (lote && window.QB?.Data?.loteMeta) {
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

  /** Pendientes (cola) + enviados (últimas 48 h), sin duplicar clientId */
  function getUploadHistory() {
    const seen = new Set();
    const queue = [];
    getQueue().forEach((item) => {
      const entry = queueToHistoryEntry(item);
      const id = String(entry.clientId || "").trim();
      if (id) {
        if (seen.has(id)) return;
        seen.add(id);
      }
      queue.push(entry);
    });
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

  /**
   * Conteos del día operativo (América/Lima).
   * Total = enviados hoy + pendientes hoy (sin doble conteo por clientId).
   */
  function getTodayOpsStats() {
    const day = todayKey();
    const byType = emptyByType_();
    const items = getUploadHistory();
    const todayItems = [];
    for (let i = 0; i < items.length; i += 1) {
      const a = items[i];
      const t = normEvalType_(a.type);
      if (!t) continue; // solo protocolos conocidos
      const key = dayKeyLima_(a.at);
      if (!day || key !== day) continue;
      todayItems.push(a);
      byType[t] += 1;
    }
    const pendingAll = getQueue().length;
    let pendingToday = 0;
    getQueue().forEach((q) => {
      if (dayKeyLima_(q.submittedAt || q.at) === day) pendingToday += 1;
    });
    return {
      day,
      total: todayItems.length,
      byType,
      pending: pendingAll,
      pendingToday,
      last: todayItems[0] || items[0] || null,
    };
  }

  /** Limpieza en segundo plano cada hora */
  function startHistoryCleanup() {
    pruneActivity_();
    try {
      if (window.__qbHistClean) clearInterval(window.__qbHistClean);
      window.__qbHistClean = setInterval(pruneActivity_, 60 * 60 * 1000);
    } catch (_) {}
  }

  startHistoryCleanup();

  /** Endpoint interno — no loguear ni exponer en consola */
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

  function dequeueByClientId_(clientId) {
    const id = String(clientId || "").trim();
    if (!id) return;
    const q = getQueue();
    const next = q.filter((x) => String(x.clientId || "") !== id);
    if (next.length !== q.length) setQueue(next);
  }

  async function submit(payload) {
    const url = apiUrl_();
    const record = {
      ...payload,
      type: normEvalType_(payload.type) || payload.type,
      clientId: payload.clientId || cryptoRandom(),
      submittedAt: payload.submittedAt || new Date().toISOString(),
    };

    if (record.data) {
      rememberPerson("evaluador", record.data.evaluador);
      rememberPerson("supervisor", record.data.supervisor);
      rememberPerson("cosechador", record.data.cosechador);
      rememberPerson("turno", record.data.turno);
    }

    if (!url) {
      dequeueByClientId_(record.clientId);
      const demo = JSON.parse(localStorage.getItem("qb_demo_saves") || "[]");
      demo.unshift(record);
      localStorage.setItem("qb_demo_saves", JSON.stringify(demo.slice(0, 200)));
      logActivity(record);
      return { ok: true, mode: "demo", message: "Guardado local" };
    }

    let settled = false;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(record),
        redirect: "follow",
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      const serverOk =
        res.ok &&
        json &&
        json.ok !== false &&
        (json.created === true || json.duplicate === true || json.ok === true);

      if (!serverOk) {
        enqueue(record);
        throw new Error(
          (json && (json.error || json.message)) ||
            "No se pudo confirmar el guardado"
        );
      }

      // Éxito: salir de cola (reintento) y registrar una sola vez
      dequeueByClientId_(record.clientId);
      logActivity(record);
      settled = true;
      return json;
    } catch (err) {
      if (!settled) enqueue(record);
      throw err;
    }
  }

  function isServerOk(json) {
    return (
      json &&
      json.ok !== false &&
      (json.created === true || json.duplicate === true || json.ok === true)
    );
  }

  function enqueue(record) {
    const id = String(record?.clientId || "").trim();
    const q = getQueue();
    if (id && q.some((x) => String(x.clientId || "") === id)) return;
    const entry = {
      ...record,
      clientId: id || cryptoRandom(),
      type: normEvalType_(record?.type) || record?.type,
      submittedAt: record?.submittedAt || new Date().toISOString(),
    };
    q.push(entry);
    setQueue(q);
  }

  async function flushQueue() {
    const url = apiUrl_();
    if (!url || !navigator.onLine) return { sent: 0 };
    const q = getQueue();
    if (!q.length) return { sent: 0 };
    const remain = [];
    let sent = 0;
    for (const item of q) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(item),
          redirect: "follow",
        });
        let json;
        try {
          json = JSON.parse(await res.text());
        } catch {
          json = null;
        }
        if (res.ok && isServerOk(json)) {
          sent += 1;
          // Pendiente → Enviado en historial (antes no se registraba)
          logActivity(item);
        } else {
          remain.push(item);
        }
      } catch {
        remain.push(item);
      }
    }
    setQueue(remain);
    return { sent, remain: remain.length };
  }

  function cryptoRandom() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `qb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  return {
    submit,
    flushQueue,
    newClientId: cryptoRandom,
    peopleOptions,
    rememberPerson,
    rememberCustomPerson,
    customPeopleOptions,
    rememberCustomValue,
    customValueOptions,
    getQueue,
    pendingCount,
    getActivity,
    logActivity,
    getUploadHistory,
    getTodayOpsStats,
    todayKey,
    localDayKey,
  };
})();
