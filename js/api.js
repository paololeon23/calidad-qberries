/** Persistencia local + envío a Google Apps Script */
window.QB = window.QB || {};

QB.API = (() => {
  const QUEUE_KEY = "qb_pending_queue";
  const HISTORY_KEY = "qb_people_history";
  const ACTIVITY_KEY = "qb_activity";
  const HISTORY_TTL_MS = 48 * 60 * 60 * 1000; // 48 h

  function isFresh_(iso) {
    const t = new Date(iso || 0).getTime();
    if (!t || Number.isNaN(t)) return false;
    return Date.now() - t <= HISTORY_TTL_MS;
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
        type: record.type,
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
    return {
      id: item.clientId || item.submittedAt,
      clientId: item.clientId || "",
      type: item.type,
      at: item.submittedAt || new Date().toISOString(),
      evaluador: d.evaluador || "",
      cosechador: d.cosechador || "",
      variedad: d.variedad || "",
      lote: d.lote || "",
      modulo: d.modulo || "",
      turno: d.turno || "",
      nota: s.nota,
      calidadGlobal: s.calidadGlobal || "",
      status: "pending",
    };
  }

  /** Pendientes (cola) + enviados (últimas 48 h), sin duplicar clientId */
  function getUploadHistory() {
    const queue = getQueue().map(queueToHistoryEntry);
    const pendingIds = new Set(queue.map((q) => String(q.clientId || "")).filter(Boolean));
    const activity = getActivity()
      .filter((a) => {
        const id = String(a.clientId || "");
        return !id || !pendingIds.has(id);
      })
      .map((a, i) => ({
        ...a,
        id: a.clientId || `${a.at || i}|${a.type}|${a.evaluador || ""}`,
        status: "sent",
      }));
    return [...queue, ...activity].sort(
      (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()
    );
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

  async function submit(payload) {
    const url = apiUrl_();
    const record = {
      ...payload,
      clientId: payload.clientId || cryptoRandom(),
      submittedAt: new Date().toISOString(),
    };

    if (record.data) {
      rememberPerson("evaluador", record.data.evaluador);
      rememberPerson("supervisor", record.data.supervisor);
      rememberPerson("cosechador", record.data.cosechador);
      rememberPerson("turno", record.data.turno);
    }

    if (!url) {
      const demo = JSON.parse(localStorage.getItem("qb_demo_saves") || "[]");
      demo.unshift(record);
      localStorage.setItem("qb_demo_saves", JSON.stringify(demo.slice(0, 200)));
      logActivity(record);
      return { ok: true, mode: "demo", message: "Guardado local" };
    }

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

      logActivity(record);
      return json;
    } catch (err) {
      // Si ya está en cola (fallo de red / servidor), no volver a encolar ciegamente
      enqueue(record);
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
    const q = getQueue();
    if (q.some((x) => x.clientId === record.clientId)) return;
    q.push(record);
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
    getQueue,
    pendingCount,
    getActivity,
    logActivity,
    getUploadHistory,
  };
})();
