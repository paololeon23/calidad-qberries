/** App principal — router, formularios, resumen */
window.QB = window.QB || {};

QB.App = (() => {
  const state = {
    screen: "home",
    type: null,
    data: {},
    score: null,
    clientId: null,
    saving: false,
    uploadsPage: 0,
  };

  const UPLOADS_PAGE_SIZE = 10;
  const DRAFT_KEY = "qb_eval_drafts";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function readAllDrafts_() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return {};
      const d = JSON.parse(raw);
      return d && typeof d === "object" ? d : {};
    } catch {
      return {};
    }
  }

  function saveDraft_() {
    try {
      if (!state.type || (state.screen !== "form" && state.screen !== "resumen")) return;
      const data =
        state.screen === "form" && $("#form-root")
          ? { ...state.data, ...readFormSafe_() }
          : state.data || {};
      const all = readAllDrafts_();
      all[state.type] = {
        data,
        score: state.score || null,
        clientId: state.clientId || null,
        screen: state.screen,
        at: Date.now(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    } catch (_) {
      /* ignore */
    }
  }

  function readFormSafe_() {
    try {
      return readForm();
    } catch {
      return {};
    }
  }

  function draftIsMeaningful_(d) {
    if (!d || !d.data) return false;
    if (d.score) return true;
    return Object.keys(d.data).some((k) => {
      if (k === "fecha") return false;
      const v = d.data[k];
      return v != null && String(v).trim() !== "";
    });
  }

  function loadDraft_(type) {
    try {
      const all = readAllDrafts_();
      const d = all[type];
      if (!d || !d.data) return null;
      if (d.at && Date.now() - d.at > 7 * 24 * 60 * 60 * 1000) {
        clearDraft_(type);
        return null;
      }
      if (!draftIsMeaningful_(d)) {
        clearDraft_(type);
        return null;
      }
      return d;
    } catch {
      return null;
    }
  }

  function clearDraft_(type) {
    try {
      if (!type) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const all = readAllDrafts_();
      if (!(type in all)) return;
      delete all[type];
      if (Object.keys(all).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  const FB_ICONS = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v5h1"/></svg>',
  };

  let fbTimer = null;
  let fbResolve = null;

  function ensureToastStack() {
    let stack = document.getElementById("qb-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "qb-toast-stack";
      stack.className = "qb-toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(msg, type = "ok") {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = `qb-toast-item ${type === "warn" ? "warn" : type}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .2s";
      setTimeout(() => el.remove(), 220);
    }, 2800);
  }

  function closeFeedback(result) {
    const root = $("#qb-fb");
    if (!root) return;
    root.classList.remove("open");
    clearTimeout(fbTimer);
    fbTimer = null;
    setTimeout(() => {
      root.hidden = true;
    }, 220);
    if (fbResolve) {
      const r = fbResolve;
      fbResolve = null;
      r(result);
    }
  }

  function feedback({ title, text = "", type = "ok", confirmText = "Listo", cancelText = null, autoClose = 0 }) {
    return new Promise((resolve) => {
      const root = $("#qb-fb");
      const icon = $("#qb-fb-icon");
      const titleEl = $("#qb-fb-title");
      const textEl = $("#qb-fb-text");
      const actions = $("#qb-fb-actions");
      if (!root || !icon || !titleEl || !textEl || !actions) {
        toast(title, type === "error" ? "error" : type === "warn" ? "warn" : "ok");
        resolve(true);
        return;
      }
      if (fbResolve) fbResolve(false);
      fbResolve = resolve;
      clearTimeout(fbTimer);

      icon.className = `qb-fb-icon ${type}`;
      icon.innerHTML = FB_ICONS[type] || FB_ICONS.info;
      titleEl.textContent = title;
      textEl.textContent = text;
      textEl.hidden = !text;

      actions.innerHTML = "";
      if (cancelText) {
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "qb-fb-secondary";
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener("click", () => closeFeedback(false));
        actions.appendChild(cancelBtn);
      }
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "qb-fb-primary";
      okBtn.textContent = confirmText;
      okBtn.addEventListener("click", () => closeFeedback(true));
      actions.appendChild(okBtn);

      root.hidden = false;
      requestAnimationFrame(() => root.classList.add("open"));

      if (autoClose > 0 && !cancelText) {
        fbTimer = setTimeout(() => closeFeedback(true), autoClose);
      }
    });
  }

  function setLoading(on, title = "Procesando...") {
    const root = $("#qb-loader");
    const text = $("#qb-loader-text");
    if (!root) return;
    if (on) {
      if (text) text.textContent = title;
      root.hidden = false;
    } else {
      root.hidden = true;
    }
  }

  async function confirmCancel() {
    return feedback({
      title: "¿Salir de la evaluación?",
      text: "Los datos quedan en el celular hasta que pulses Guardar.",
      type: "warn",
      confirmText: "Salir",
      cancelText: "Seguir",
    });
  }

  function todayISO() {
    if (QB.API?.todayKey) return QB.API.todayKey();
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /** Siempre el día de hoy — no dejar fecha pegada de otro día */
  function syncFechaHoy() {
    const hoy = todayISO();
    if (!state.data) state.data = {};
    state.data.fecha = hoy;
    const hidden = $("#field-fecha");
    const trig = $("#trig-fecha");
    if (hidden) hidden.value = hoy;
    if (trig) {
      const span = trig.querySelector(".value, .placeholder");
      if (span) {
        span.className = "value";
        span.textContent = QB.DatePicker
          ? QB.DatePicker.formatDisplay(hoy)
          : hoy;
      }
    }
    return hoy;
  }

  /** Día operativo América/Lima — el conteo “hoy” no debe fallar de noche */
  function localDayISO(iso) {
    if (QB.API?.localDayKey) return QB.API.localDayKey(iso);
    const d = iso ? new Date(iso) : new Date();
    if (Number.isNaN(d.getTime())) return "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function nowStamp() {
    const d = new Date();
    return d.toLocaleString("es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showScreen(id) {
    state.screen = id;
    $$(".screen").forEach((s) => s.classList.toggle("active", s.id === `screen-${id}`));
    resetViewportLayout();
    const scroller = document.querySelector(`#screen-${id} .panel-scroll`);
    if (scroller) scroller.scrollTop = 0;
  }

  function isTypingField_(el) {
    return !!(
      el &&
      el.matches &&
      (el.matches("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea") ||
        el.isContentEditable)
    );
  }

  function isKeyboardOpen_() {
    if (isTypingField_(document.activeElement)) return true;
    const vv = window.visualViewport;
    if (!vv) return false;
    // iOS y Android: teclado reduce el viewport visible
    const gap = Math.max(
      window.innerHeight - vv.height,
      (window.outerHeight || window.innerHeight) - vv.height
    );
    return gap > 80;
  }

  function setKeyboardUi_(open) {
    document.body.classList.toggle("kb-open", !!open);
    // form-actions siempre visibles (Cancelar / Ver resumen / Guardar)
  }

  function scrollFieldIntoView_(el) {
    if (!el) return;
    try {
      const scroller = el.closest(".panel-scroll");
      if (!scroller) return;
      requestAnimationFrame(() => {
        const er = el.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        const pad = 20;
        if (er.bottom > sr.bottom - pad) {
          scroller.scrollTop += er.bottom - sr.bottom + pad + 24;
        } else if (er.top < sr.top + pad) {
          scroller.scrollTop -= sr.top - er.top + pad;
        }
      });
    } catch (_) {}
  }

  /** Viewport real (iOS + Android): siempre seguir visualViewport — sin huecos blancos */
  function resetViewportLayout() {
    if (document.querySelector(".overlay.open, #qb-sync.open, #qb-fb.open, .date-overlay.open")) {
      return;
    }

    const kb = isKeyboardOpen_();
    setKeyboardUi_(kb);

    const app = document.querySelector(".app");
    const vv = window.visualViewport;
    const layoutH = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
    const vvH = vv ? Math.round(vv.height) : layoutH;
    const vvTop = vv ? Math.round(vv.offsetTop || 0) : 0;

    // Altura visible real (teclado abierto o cerrado)
    const h = Math.max(180, Math.min(vvH, layoutH));
    document.documentElement.style.setProperty("--app-h", `${h}px`);

    if (app) {
      app.style.height = `${h}px`;
      app.style.maxHeight = `${h}px`;
      // Android a veces no usa offsetTop; iOS sí — ambos quedan bien
      if (kb && vvTop > 0) {
        app.style.transform = `translateY(${vvTop}px)`;
      } else {
        app.style.transform = "";
      }
    }

    if (kb && isTypingField_(document.activeElement)) {
      scrollFieldIntoView_(document.activeElement);
    }

    if (!kb) {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (app) app.style.transform = "";
    }
  }

  function goHome() {
    state.type = null;
    state.data = {};
    state.score = null;
    state.clientId = null;
    state.saving = false;
    showScreen("home");
    updateStatusUI();
  }

  function clearEvalSession() {
    const type = state.type;
    state.type = null;
    state.data = {};
    state.score = null;
    state.clientId = null;
    state.saving = false;
    if (type) clearDraft_(type);
  }

  async function startEval(type) {
    state.type = type;
    const draft = loadDraft_(type);
    if (draft && draft.data) {
      state.data = { ...draft.data, fecha: todayISO() };
      state.score = draft.score || null;
      state.clientId = draft.clientId || null;
    } else {
      state.data = { fecha: todayISO() };
      state.score = null;
      state.clientId = null;
    }
    state.saving = false;
    if (QB.Data && !QB.Data.isReady()) {
      setLoading(true, "Cargando catálogos...");
      await QB.Data.load();
      setLoading(false);
    }
    if (QB.Data?.ensureEvaluadores) {
      const n = (QB.Data.evaluadorOptions("") || []).length;
      if (!n) {
        setLoading(true, "Cargando evaluadores...");
        await QB.Data.ensureEvaluadores();
        setLoading(false);
      }
    }
    const resumeResumen = draft && draft.screen === "resumen" && draft.score;
    if (resumeResumen) {
      renderResumen();
      showScreen("resumen");
      $("#progress-fill").style.width = "100%";
    } else {
      renderForm();
      showScreen("form");
      $("#progress-fill").style.width = "45%";
    }
    saveDraft_();
    if (draft) toast("Borrador recuperado", "info");
  }

  /* ——— Icons ——— */
  const ICONS = {
    calidad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.2 4.5 5 .7-3.6 3.5.9 5.1L12 14.8 7.5 16.8l.9-5.1L4.8 8.2l5-.7L12 3z"/></svg>`,
    descarte: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5h6v2M6 7l1 12h10l1-12"/><path d="M10 11v5M14 11v5"/></svg>`,
    caida: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v10"/><path d="M8 9l4 4 4-4"/><path d="M5 19h14"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>`,
    planta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V11"/><path d="M12 11c-4-1-6-4-6-7 4 0 6 2 6 5"/><path d="M12 11c4-1 6-4 6-7-4 0-6 2-6 5"/><path d="M9 21h6"/></svg>`,
    chevron: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>`,
    back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>`,
    caret: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6"/></svg>`,
  };

  const EVAL_CODES = {
    calidad: "QC-01 · Cosechador",
    descarte: "QC-02 · Descarte",
    caida: "QC-03 · Caída",
    planta: "QC-04 · Planta",
  };

  function renderHome() {
    const drafts = readAllDrafts_();
    const grid = $("#eval-grid");
    grid.innerHTML = Object.values(QB.EVALS)
      .map(
        (e, i) => `
      <button type="button" class="eval-card" data-type="${e.id}" style="--i:${i}">
        <div class="eval-icon">${ICONS[e.id]}</div>
        <div class="eval-meta">
          <h2>${e.title}</h2>
          <p>${e.desc}</p>
          <span class="eval-code">${EVAL_CODES[e.id] || ""}${draftIsMeaningful_(drafts[e.id]) ? " · Borrador" : ""}</span>
        </div>
        <span class="eval-go" aria-hidden="true">${ICONS.chevron}</span>
      </button>`
      )
      .join("");

    grid.querySelectorAll(".eval-card").forEach((btn) => {
      btn.addEventListener("click", () => startEval(btn.dataset.type));
    });
    renderOpsPanel();
  }

  /** Solo localStorage — cero GET/POST al Script */
  function renderOpsPanel() {
    const dateEl = $("#ops-date");
    if (!dateEl) return;

    let stats;
    try {
      stats = QB.API.getTodayOpsStats
        ? QB.API.getTodayOpsStats()
        : null;
    } catch (_) {
      stats = null;
    }

    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("es-PE", {
      timeZone: "America/Lima",
      weekday: "long",
      day: "numeric",
      month: "long",
    });

    const byType = stats?.byType || { calidad: 0, descarte: 0, caida: 0, planta: 0 };
    const total = Number(stats?.total) || 0;
    const pend = Number(stats?.pending ?? QB.API.pendingCount()) || 0;
    const last = stats?.last || null;

    const hoyEl = $("#kpi-hoy");
    const pendEl = $("#kpi-pend");
    if (hoyEl) hoyEl.textContent = String(total);
    if (pendEl) pendEl.textContent = String(pend);
    $("#kpi-pend-wrap")?.classList.toggle("warn", pend > 0);

    ["calidad", "descarte", "caida", "planta"].forEach((t) => {
      const n = Number(byType[t]) || 0;
      const el = $(`#kpi-tipo-${t}`);
      if (el) el.textContent = String(n);
      $(`.ops-type[data-type="${t}"]`)?.classList.toggle("has-count", n > 0);
    });

    const lastWrap = $("#ops-last");
    if (!lastWrap) return;

    if (!last) {
      lastWrap.innerHTML = `
        <p class="ops-section-label">Actividad reciente</p>
        <div class="ops-brief">
          <div class="ops-brief-row"><span>Estado</span><strong>Listo para evaluar</strong></div>
          <div class="ops-brief-row"><span>Conexión</span><strong>${navigator.onLine ? "En línea" : "Sin conexión"}</strong></div>
          <p class="ops-tip">Seleccione un protocolo, complete la evaluación y pulse GUARDAR. Sin conexión, el registro queda en cola.</p>
        </div>`;
      return;
    }

    const evalDef = QB.EVALS[last.type];
    const title = evalDef ? evalDef.title : last.type || "—";
    const who = personDisplay(last.cosechador || last.evaluador || "—");
    const variedad = last.variedad || "";
    const time = last.at
      ? new Date(last.at).toLocaleTimeString("es-PE", {
          timeZone: "America/Lima",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    const loteBig =
      last.lote != null && last.lote !== ""
        ? QB.Data?.loteShortLabel?.(QB.Data.findLote(last.codLote || last.lote)) || `Lote ${last.lote}`
        : "—";
    let modSm = "—";
    let turSm = "—";
    if ((last.codLote || last.lote) && QB.Data?.loteMeta) {
      const loteMeta = QB.Data.loteMeta(last.codLote || last.lote);
      modSm = loteMeta.modulo || last.modulo || "—";
      turSm = loteMeta.turno ? `T${loteMeta.turno}` : last.turno ? `T${last.turno}` : "—";
    } else {
      modSm = last.modulo || "—";
      turSm = last.turno != null && last.turno !== "" ? `T${last.turno}` : "—";
    }

    lastWrap.innerHTML = `
      <p class="ops-section-label">Actividad reciente</p>
      <div class="ops-last-card">
        <div class="ops-last-top">
          <span class="ops-last-tag">Último registro</span>
          <span class="ops-last-time">${escapeHtml(time)}</span>
        </div>
        <div class="ops-last-body">
          <div class="ops-last-info">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(who)}${variedad ? ` · ${escapeHtml(variedad)}` : ""}</p>
          </div>
          <div class="ops-last-score" title="Lote · Módulo · Turno">
            <span class="big">${escapeHtml(loteBig)}</span>
            <span class="sm">${escapeHtml(modSm)}</span>
            <span class="sm">${escapeHtml(turSm)}</span>
          </div>
        </div>
      </div>`;
  }

  function openUploadsHistory() {
    state.uploadsPage = 0;
    renderUploadsHistory();
    showScreen("uploads");
  }

  function openSyncModal() {
    const root = $("#qb-sync");
    const ver = $("#qb-sync-version");
    if (ver) ver.textContent = `v${QB.CONFIG.VERSION || "1.1.0"}`;
    refreshInstallUi_();
    if (!root) return;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add("open"));
  }

  /* ——— Instalar PWA (Android) / Anclar al inicio (iPhone) ——— */
  let deferredInstallPrompt = null;
  const INSTALL_DISMISS_KEY = "qb_install_dismissed";

  function isAppInstalled_() {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    if (navigator.standalone === true) return true; // iOS Safari
    return false;
  }

  function isIosSafari_() {
    const ua = navigator.userAgent || "";
    const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const webkit = /WebKit/i.test(ua);
    const chromeLike = /CriOS|FxiOS|EdgiOS|OPiOS|Chrome/i.test(ua);
    return iOS && webkit && !chromeLike;
  }

  function refreshInstallUi_() {
    const installed = isAppInstalled_();
    const banner = $("#install-banner");
    const title = $("#install-banner-title");
    const text = $("#install-banner-text");
    const btn = $("#btn-install-app");
    const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";

    if (installed) {
      if (banner) banner.hidden = true;
      return;
    }

    const ios = isIosSafari_();
    const canNative = !!deferredInstallPrompt;

    if (title) {
      title.textContent = ios ? "Anclar a inicio" : "Instalar Q Calidad";
    }
    if (text) {
      text.textContent = ios
        ? "En Safari: Compartir → Agregar a pantalla de inicio."
        : "Agrégala a tu inicio para usarla como app en campo.";
    }
    if (btn) btn.textContent = ios ? "Cómo hacerlo" : "Instalar";

    const showBanner = !dismissed && (canNative || ios);
    if (banner) banner.hidden = !showBanner;
  }

  async function promptInstallApp_() {
    if (isAppInstalled_()) {
      toast("Ya está instalada", "ok");
      return;
    }

    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        if (choice && choice.outcome === "accepted") {
          toast("App instalada ✓", "ok");
          localStorage.setItem(INSTALL_DISMISS_KEY, "1");
        }
      } catch (_) {
        /* ignore */
      }
      refreshInstallUi_();
      return;
    }

    if (isIosSafari_()) {
      closeSyncModal();
      await feedback({
        title: "Anclar en iPhone",
        text: "1) Toca Compartir (□↑) abajo en Safari. 2) Elige «Agregar a pantalla de inicio». 3) Confirma Agregar. Así queda como app.",
        type: "info",
        confirmText: "Entendido",
      });
      return;
    }

    await feedback({
      title: "Instalar desde el menú",
      text: "En Chrome: menú ⋮ → «Instalar app» o «Agregar a la pantalla de inicio». Debe estar en HTTPS y con internet la primera vez.",
      type: "info",
      confirmText: "Entendido",
    });
  }

  function setupInstallPrompt_() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      refreshInstallUi_();
    });
    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
      refreshInstallUi_();
      toast("App instalada ✓", "ok");
    });
    refreshInstallUi_();
  }

  function closeSyncModal() {
    const root = $("#qb-sync");
    if (!root) return;
    root.classList.remove("open");
    setTimeout(() => {
      root.hidden = true;
    }, 220);
  }

  async function updateApp() {
    setLoading(true, "Actualizando app...");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (_) {
      /* ignore */
    }
    setLoading(false);
    closeSyncModal();
    toast("App actualizada — recargando…", "ok");
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", String(Date.now()));
      window.location.replace(url.toString());
    }, 500);
  }

  async function clearAppCache() {
    closeSyncModal();
    await new Promise((r) => setTimeout(r, 240));

    const ok = await feedback({
      title: "¿Eliminar caché?",
      text: "Limpia borradores, formularios abiertos, caché del navegador y datos temporales. Conserva la cola pendiente y el historial de envíos.",
      type: "warn",
      confirmText: "Eliminar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setLoading(true, "Limpiando…");
    try {
      const keep = new Set(["qb_pending_queue", "qb_activity"]);
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !keep.has(k) && (k.startsWith("qb_") || k.startsWith("QB_"))) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      try {
        sessionStorage.clear();
      } catch (_) {}
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => {})));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      clearEvalSession();
      goHome();
    } catch (_) {
      /* ignore */
    }
    setLoading(false);
    closeSyncModal();
    toast("Caché eliminada ✓", "ok");
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("_v", String(Date.now()));
      window.location.replace(url.toString());
    }, 400);
  }

  function showTipAdvice(tip) {
    const tips = {
      lote: {
        title: "Lote primero",
        text: "Elige el lote y el app completa módulo y turno. Así evitas errores en campo.",
      },
      offline: {
        title: "Trabajo sin red",
        text: "Si cierras el app, el formulario queda guardado. Al GUARDAR, se envía o queda en cola (pend.) hasta tener señal; ahí se limpia el borrador.",
      },
      resumen: {
        title: "Ver tus registros",
        text: "En el inicio pulsa Resumen para ver enviados y pendientes, 10 por página.",
      },
      una: {
        title: "Una a la vez",
        text: "Completa, Ver resumen, GUARDAR. El borrador se borra solo al enviar; si sales antes, al volver lo recuperas.",
      },
      soporte: {
        title: "Soporte",
        text: "Si tienes problemas con el app, contacta a support: Paolo León.",
      },
    };
    const t = tips[tip] || tips.lote;
    closeSyncModal();
    setTimeout(() => {
      feedback({ title: t.title, text: t.text, type: "info", confirmText: "Entendido" });
    }, 240);
  }

  function renderUploadCard(item) {
    const evalDef = QB.EVALS[item.type];
    const title = evalDef ? evalDef.short || evalDef.title : item.type;
    const who = personDisplay(item.cosechador || item.evaluador || "—");
    const dt = item.at ? new Date(item.at) : null;
    const fecha = dt
      ? dt.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })
      : "—";
    const hora = dt
      ? dt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
      : "";
    let loteBig = item.lote != null && item.lote !== "" ? `Lote ${item.lote}` : "—";
    let modSm = item.modulo || "—";
    let turSm = item.turno != null && item.turno !== "" ? `T${item.turno}` : "—";
    if ((item.codLote || item.lote) && QB.Data?.loteMeta) {
      const meta = QB.Data.loteMeta(item.codLote || item.lote);
      if (meta.modulo) modSm = meta.modulo;
      if (meta.turno) turSm = `T${meta.turno}`;
      if (meta.raw && QB.Data.loteShortLabel) loteBig = QB.Data.loteShortLabel(meta.raw);
      else if (meta.lote) loteBig = `Lote ${meta.lote}`;
    }
    const nota =
      item.nota != null && !Number.isNaN(Number(item.nota)) ? String(item.nota) : "—";
    const grade = item.calidadGlobal || "";
    const gradeClass = grade ? QB.Scoring.pillClass(grade) : "na";
    const pending = item.status === "pending";

    return `
      <article class="upload-card${pending ? " is-pending" : ""}" data-type="${escapeAttr(item.type)}">
        <div class="upload-card-top">
          <span class="upload-card-type">${escapeHtml(title)}</span>
          <span class="upload-card-status ${pending ? "pending" : "sent"}">${pending ? "Pendiente" : "Enviado"}</span>
        </div>
        <div class="upload-card-body">
          <div class="upload-card-info">
            <strong>${escapeHtml(who)}</strong>
            <p>${escapeHtml(item.variedad || "—")} · ${escapeHtml(fecha)}${hora ? ` · ${escapeHtml(hora)}` : ""}</p>
          </div>
          <div class="upload-card-score">
            <span class="big">${escapeHtml(loteBig)}</span>
            <span class="sm">${escapeHtml(modSm)}</span>
            <span class="sm">${escapeHtml(turSm)}</span>
          </div>
        </div>
        <div class="upload-card-foot">
          <span class="upload-card-nota">Nota ${escapeHtml(nota)}</span>
          ${grade ? `<span class="pill ${gradeClass}">${escapeHtml(grade)}</span>` : ""}
        </div>
      </article>`;
  }

  function renderUploadsHistory() {
    const listEl = $("#uploads-list");
    const summaryEl = $("#uploads-summary");
    const pagerEl = $("#uploads-pager");
    if (!listEl) return;

    const all = QB.API.getUploadHistory();
    const pendingN = all.filter((x) => x.status === "pending").length;
    const sentN = all.length - pendingN;
    const totalPages = Math.max(1, Math.ceil(all.length / UPLOADS_PAGE_SIZE));
    const page = Math.min(Math.max(0, state.uploadsPage), totalPages - 1);
    state.uploadsPage = page;

    if (summaryEl) {
      if (!all.length) {
        summaryEl.textContent = "Aún no hay registros guardados.";
      } else {
        summaryEl.textContent = `${all.length} registro${all.length === 1 ? "" : "s"} (últimas 48 h) · ${sentN} enviado${sentN === 1 ? "" : "s"} · ${pendingN} pendiente${pendingN === 1 ? "" : "s"}`;
      }
    }

    if (!all.length) {
      listEl.innerHTML = `
        <div class="uploads-empty">
          <p>Completa una evaluación y pulsa <strong>GUARDAR</strong>.</p>
          <p class="uploads-empty-sub">Aquí verás lo de las últimas 48 h (enviados y pendientes).</p>
        </div>`;
      if (pagerEl) pagerEl.hidden = true;
      return;
    }

    const slice = all.slice(page * UPLOADS_PAGE_SIZE, page * UPLOADS_PAGE_SIZE + UPLOADS_PAGE_SIZE);
    listEl.innerHTML = slice.map(renderUploadCard).join("");

    if (pagerEl) {
      pagerEl.hidden = totalPages <= 1;
      const info = $("#uploads-page-info");
      const prev = $("#uploads-prev");
      const next = $("#uploads-next");
      if (info) info.textContent = `${page + 1} / ${totalPages}`;
      if (prev) prev.disabled = page <= 0;
      if (next) next.disabled = page >= totalPages - 1;
    }
  }

  function updateStatusUI() {
    const online = navigator.onLine;
    const pending = QB.API.pendingCount();

    document.querySelectorAll("[data-chip-online], #chip-online").forEach((chip) => {
      chip.classList.toggle("online", online);
      chip.classList.toggle("offline", !online);
      const text = chip.querySelector(".chip-text");
      if (text) text.textContent = online ? "En línea" : "Sin conexión";
    });

    document.querySelectorAll("[data-chip-pending], #chip-pending").forEach((chip) => {
      chip.classList.toggle("has-items", pending > 0);
      const text =
        chip.querySelector("[data-pending-text]") ||
        chip.querySelector("#chip-pending-text") ||
        chip.querySelector(".chip-text");
      if (text) text.textContent = pending > 0 ? `${pending} pend.` : "0 pend.";
    });
  }

  async function syncPending(manual = false) {
    if (!navigator.onLine) {
      if (manual) toast("Sin conexión — no se puede sincronizar", "error");
      updateStatusUI();
      return;
    }
    const before = QB.API.pendingCount();
    if (!before) {
      if (manual) toast("Sin pendientes", "ok");
      updateStatusUI();
      return;
    }
    // Sync en silencio — sin modal (no interrumpe formularios)
    try {
      const r = await QB.API.flushQueue();
      if (manual) {
        if (r.sent) toast(`Sincronizados ${r.sent} registros`, "ok");
        else toast("No se pudo sincronizar", "error");
      }
    } finally {
      updateStatusUI();
      renderOpsPanel();
      if (state.screen === "uploads") renderUploadsHistory();
    }
  }

  function fieldHtml(name, label, opts = {}) {
    const req = opts.required ? `<span class="req">*</span>` : "";
    const type = opts.type || "text";
    let val = state.data[name] ?? opts.value ?? "";
    let shown = val;
    if (name === "lote") {
      const key = state.data.codLote || state.data.lote || val;
      const L = key && QB.Data?.findLote ? QB.Data.findLote(key) : null;
      if (L) {
        val = L.codLote || String(L.lote);
        shown = QB.Data.loteLabel(L);
      }
    }
    if (opts.readonly) {
      const shown = val || opts.placeholder || "Según lote";
      return `
        <div class="field field-locked" data-field="${name}">
          <label>${label}${req}</label>
          <div class="precise-trigger is-locked" id="trig-${name}" aria-readonly="true">
            <span class="${val ? "value" : "placeholder"}">${escapeHtml(shown)}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
          </div>
          <input type="hidden" name="${name}" id="field-${name}" value="${escapeAttr(val)}" ${opts.required ? "required" : ""} />
        </div>`;
    }
    if (opts.precise) {
      return `
        <div class="field" data-field="${name}">
          <label>${label}${req}</label>
          <button type="button" class="precise-trigger" data-precise="${name}" id="trig-${name}">
            <span class="${val ? "value" : "placeholder"}">${escapeHtml(shown || opts.placeholder || "Seleccionar...")}</span>
            ${ICONS.caret}
          </button>
          <input type="hidden" name="${name}" id="field-${name}" value="${escapeAttr(val)}" ${opts.required ? "required" : ""} />
          <span class="field-hint">Campo obligatorio</span>
        </div>`;
    }
    if (type === "date") {
      const hoy = todayISO();
      const shown = QB.DatePicker ? QB.DatePicker.formatDisplay(hoy) : hoy;
      return `
        <div class="field field-locked" data-field="${name}">
          <label>${label}${req}</label>
          <div class="precise-trigger date-trigger is-locked" id="trig-${name}" aria-readonly="true" title="Fecha del día (se actualiza sola)">
            <span class="value">${shown}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="5" width="18" height="16" rx="2"/>
              <path d="M3 10h18M8 3v4M16 3v4"/>
            </svg>
          </div>
          <input type="hidden" name="${name}" id="field-${name}" value="${escapeAttr(hoy)}" ${opts.required ? "required" : ""} />
        </div>`;
    }
    if (type === "textarea") {
      return `
        <div class="field comment-field" data-field="${name}">
          <label>${label}${req}</label>
          <textarea name="${name}" id="field-${name}" rows="3" placeholder="${opts.placeholder || ""}">${escapeHtml(val)}</textarea>
          <span class="field-hint">Campo obligatorio</span>
        </div>`;
    }
    if (name === "tamano_muestra" || opts.maxDigits) {
      const limit = opts.maxDigits || 3;
      val = String(val ?? "").replace(/\D/g, "").slice(0, limit);
    }
    return `
      <div class="field" data-field="${name}">
        <label>${label}${req}</label>
        <input type="${type}" name="${name}" id="field-${name}" value="${escapeAttr(val)}"
          ${opts.min != null ? `min="${opts.min}"` : ""}
          ${opts.max != null ? `max="${opts.max}"` : ""}
          ${opts.step != null ? `step="${opts.step}"` : ""}
          ${opts.maxlength != null ? `maxlength="${opts.maxlength}"` : ""}
          ${opts.maxDigits != null ? `data-max-digits="${opts.maxDigits}"` : ""}
          ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""}
          ${opts.pattern ? `pattern="${opts.pattern}"` : ""}
          ${opts.required ? "required" : ""}
          placeholder="${opts.placeholder || (type === "number" ? "00" : "")}" />
        <span class="field-hint">Campo obligatorio</span>
      </div>`;
  }

  function defectsHtml(type) {
    const defs = QB.DEFECTS[type] || [];
    return `
      <div class="section-card">
        <div class="section-head">
          <div class="section-title">Conteo de defectos</div>
          <p class="section-sub">Ingrese la cantidad encontrada en la muestra. La calificación usa los parámetros oficiales.</p>
        </div>
        <div class="defect-grid">
          ${defs
            .map((d) => {
              const raw = state.data[d.id];
              const hasVal = raw !== undefined && raw !== null && raw !== "";
              const v = hasVal ? raw : "";
              return `
              <div class="defect-item" data-defect-id="${d.id}">
                <label for="field-${d.id}">${d.label}</label>
                <input type="number" min="0" step="1" inputmode="numeric"
                  name="${d.id}" id="field-${d.id}" value="${escapeAttr(v)}"
                  placeholder="00" />
                <div class="defect-live" data-live="${d.id}" hidden>
                  <span class="defect-live-pct">—</span>
                  <span class="pill na">—</span>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  function refreshDefectLiveRatings() {
    const root = $("#form-root");
    if (!root || !QB.Scoring) return;

    if (state.type === "calidad" || state.type === "descarte") {
      const sampleEl = root.querySelector('[name="tamano_muestra"]');
      const sample = Number(sampleEl?.value) || 0;
      const defs = QB.DEFECTS[state.type] || [];
      for (const d of defs) {
        const live = root.querySelector(`[data-live="${d.id}"]`);
        if (!live) continue;
        const input = root.querySelector(`[name="${d.id}"]`);
        const rawVal = input?.value;
        const hasInput = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "";
        if (!hasInput) {
          live.hidden = true;
          continue;
        }
        const count = Number(rawVal) || 0;
        const needsSample = !d.rateByCount && !d.noRate;
        if (needsSample && sample <= 0) {
          const pctEl = live.querySelector(".defect-live-pct");
          const pillEl = live.querySelector(".pill");
          if (pctEl) pctEl.textContent = `${count} u. · ingrese tamaño de muestra`;
          if (pillEl) {
            pillEl.hidden = true;
            pillEl.textContent = "";
          }
          live.hidden = false;
          continue;
        }
        if (!d.rateByCount && sample <= 0) {
          live.hidden = true;
          continue;
        }
        const dr = QB.Scoring.defectRating(count, sample, d);
        const pctEl = live.querySelector(".defect-live-pct");
        const pillEl = live.querySelector(".pill");
        if (pctEl) {
          if (d.rateByCount) pctEl.textContent = `${count} bayas`;
          else if (d.invert) pctEl.textContent = `${dr.countPct.toFixed(2)}% buena`;
          else pctEl.textContent = `${dr.countPct.toFixed(2)}%`;
        }
        if (pillEl) {
          if (d.noRate || !dr.cal) {
            pillEl.hidden = true;
            pillEl.textContent = "";
          } else {
            pillEl.hidden = false;
            pillEl.className = `pill ${QB.Scoring.pillClass(dr.cal)}`;
            pillEl.textContent = dr.cal;
          }
        }
        live.hidden = false;
      }
      return;
    }

    if (state.type === "caida" || state.type === "planta") {
      const live = root.querySelector('[data-live="promedio"]');
      if (!live) return;
      const plantasRaw = root.querySelector('[name="plantas_evaluadas"]')?.value;
      const hasPlantas = plantasRaw !== undefined && plantasRaw !== null && String(plantasRaw).trim() !== "";
      const plantas = Number(plantasRaw) || 0;
      if (!hasPlantas || plantas <= 0) {
        live.hidden = true;
        return;
      }
      let frutos = 0;
      let key = "promedio_planta";
      let hasFrutos = false;
      if (state.type === "caida") {
        const caidosRaw = root.querySelector('[name="frutos_caidos"]')?.value;
        const verdesRaw = root.querySelector('[name="frutos_caidos_verdes"]')?.value;
        hasFrutos =
          (caidosRaw !== undefined && caidosRaw !== null && String(caidosRaw).trim() !== "") ||
          (verdesRaw !== undefined && verdesRaw !== null && String(verdesRaw).trim() !== "");
        const caidos = Number(caidosRaw) || 0;
        const verdes = Number(verdesRaw) || 0;
        frutos = caidos + verdes;
        key = "promedio_caida";
      } else {
        const frutosRaw = root.querySelector('[name="frutos_planta"]')?.value;
        hasFrutos = frutosRaw !== undefined && frutosRaw !== null && String(frutosRaw).trim() !== "";
        frutos = Number(frutosRaw) || 0;
      }
      if (!hasFrutos) {
        live.hidden = true;
        return;
      }
      const promedio = QB.Scoring.round2(frutos / plantas);
      const cal = QB.Scoring.rate(promedio, key);
      const pctEl = live.querySelector(".defect-live-pct");
      const pillEl = live.querySelector(".pill");
      if (pctEl) pctEl.textContent = `${promedio.toFixed(2)} frutos/planta`;
      if (pillEl) {
        pillEl.className = `pill ${QB.Scoring.pillClass(cal)}`;
        pillEl.textContent = cal;
      }
      live.hidden = false;
    }
  }

  function renderForm() {
    const evalDef = QB.EVALS[state.type];
    const form = $("#form-root");
    syncFechaHoy();
    $("#form-title").textContent = evalDef.title;
    $("#form-desc").textContent = EVAL_CODES[state.type] || evalDef.desc;
    $("#screen-form").style.setProperty("--accent", accentColor(state.type));
    $("#progress-fill").style.width = "45%";
    updateStatusUI();

    let detalle = "";
    let defects = "";
    let comentario = "";

    if (state.type === "calidad") {
      detalle = `
        ${fieldHtml("cosechador", "Cosechador", { precise: true, required: true, placeholder: "Seleccionar..." })}
        ${fieldHtml("tamano_muestra", "Tamaño de muestra", {
          type: "number",
          min: 1,
          max: 999,
          maxlength: 3,
          maxDigits: 3,
          inputmode: "numeric",
          pattern: "[0-9]{1,3}",
          required: true,
          placeholder: "00",
        })}
      `;
      defects = defectsHtml("calidad");
      comentario = fieldHtml("comentario", "Comentario adicional", { type: "textarea", placeholder: "Opcional..." });
    } else if (state.type === "descarte") {
      detalle = `
        ${fieldHtml("tamano_muestra", "Tamaño de muestra", {
          type: "number",
          min: 1,
          max: 999,
          maxlength: 3,
          maxDigits: 3,
          inputmode: "numeric",
          pattern: "[0-9]{1,3}",
          required: true,
          placeholder: "00",
        })}
      `;
      defects = defectsHtml("descarte");
      comentario = fieldHtml("comentario", "Comentario", { type: "textarea", placeholder: "Opcional..." });
    } else if (state.type === "caida") {
      detalle = `
        ${fieldHtml("cosechador", "Cosechador", { precise: true, required: true, placeholder: "Seleccionar..." })}
        ${fieldHtml("momento", "Evaluación", { precise: true, required: true, placeholder: "Antes / Después..." })}
        <div class="caida-counts">
          ${fieldHtml("plantas_evaluadas", "Plantas evaluadas", { type: "number", min: 1, inputmode: "numeric", required: true, placeholder: "00" })}
          <div class="field-row">
            ${fieldHtml("frutos_caidos", "Cantidad de frutos caídos", { type: "number", min: 0, inputmode: "numeric", required: true, placeholder: "00" })}
            ${fieldHtml("frutos_caidos_verdes", "Cantidad de frutos caídos verdes", { type: "number", min: 0, inputmode: "numeric", placeholder: "00" })}
          </div>
          <div class="defect-live metric-live" data-live="promedio" hidden>
            <span class="defect-live-pct">—</span>
            <span class="pill na">—</span>
          </div>
        </div>
      `;
      comentario = fieldHtml("comentario", "Comentario", { type: "textarea", placeholder: "Opcional..." });
    } else if (state.type === "planta") {
      detalle = `
        ${fieldHtml("cosechador", "Cosechador", { precise: true, required: true, placeholder: "Seleccionar..." })}
        <div class="field-row">
          ${fieldHtml("plantas_evaluadas", "Plantas evaluadas", { type: "number", min: 1, inputmode: "numeric", required: true })}
          ${fieldHtml("frutos_planta", "N° de frutos en planta", { type: "number", min: 0, inputmode: "numeric", required: true })}
        </div>
        <div class="defect-live metric-live" data-live="promedio" hidden>
          <span class="defect-live-pct">—</span>
          <span class="pill na">—</span>
        </div>
      `;
      comentario = fieldHtml("comentario", "Comentar", { type: "textarea", placeholder: "Opcional..." });
    }

    form.innerHTML = `
      <div class="section-card">
        <div class="section-head">
          <div class="section-title">Datos generales</div>
          <p class="section-sub">Información base de la evaluación.</p>
        </div>
        ${fieldHtml("fecha", "Fecha", { type: "date", required: true })}
        ${fieldHtml("evaluador", "Evaluador", { precise: true, required: true, placeholder: "Seleccionar..." })}
        ${fieldHtml("supervisor", "Supervisor", { precise: true, required: true, placeholder: "Seleccionar..." })}
        ${fieldHtml("variedad", "Variedad", { precise: true, required: true, placeholder: "Elegir..." })}
        <div class="lote-block">
          ${fieldHtml("lote", "Lote", { precise: true, required: true, placeholder: "Seleccionar lote..." })}
          <div class="field-row field-row-auto">
            ${fieldHtml("modulo", "Módulo", { readonly: true, required: true, placeholder: "Según lote" })}
            ${fieldHtml("turno", "Turno", { readonly: true, required: true, placeholder: "Según lote" })}
          </div>
        </div>
      </div>
      <div class="section-card">
        <div class="section-head">
          <div class="section-title">Detalle</div>
          <p class="section-sub">Complete los datos del protocolo.</p>
        </div>
        ${detalle}
      </div>
      ${defects}
      <div class="section-card compact">
        <div class="section-head">
          <div class="section-title">Comentario</div>
          <p class="section-sub">Opcional — observaciones de campo.</p>
        </div>
        ${comentario}
      </div>
    `;

    bindPreciseFields();
    // Fecha del día: bloqueada, no se abre calendario
    bindLiveValidation();
  }

  function bindDateField() {
    // Fecha siempre = hoy (campo bloqueado). No bind de DatePicker.
  }

  function accentColor(type) {
    return (
      {
        calidad: "var(--qb-red)",
        descarte: "var(--qb-green)",
        caida: "var(--qb-orange)",
        planta: "var(--qb-lime)",
      }[type] || "var(--qb-green)"
    );
  }

  function setLockedField(name, value) {
    const hidden = $(`#field-${name}`);
    const trig = $(`#trig-${name}`);
    if (hidden) {
      hidden.value = value || "";
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (trig) {
      const span = trig.querySelector(".value, .placeholder");
      if (!span) return;
      if (value) {
        span.className = "value";
        span.textContent = value;
      } else {
        span.className = "placeholder";
        span.textContent = "Según lote";
      }
    }
  }

  function applyLote(opt) {
    const lote = (opt && opt.raw) || (QB.Data && QB.Data.findLote(opt?.id || opt));
    if (!lote) return;
    setLockedField("modulo", lote.modulo || "");
    setLockedField("turno", lote.turno != null && lote.turno !== "" ? String(lote.turno) : "");
    refreshFieldError("modulo");
    refreshFieldError("turno");
    refreshFieldError("lote");
    if (state.data) {
      state.data.modulo = lote.modulo || "";
      state.data.turno = lote.turno != null && lote.turno !== "" ? String(lote.turno) : "";
      state.data.lote = String(lote.lote);
      state.data.etapa = lote.etapa || "";
      state.data.codLote = lote.codLote || "";
    }
    const varId = QB.Data.mapVariedad(lote.variedad);
    if (varId) {
      const vHidden = $("#field-variedad");
      const vTrig = $("#trig-variedad");
      if (vHidden) {
        vHidden.value = varId;
        vHidden.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (vTrig) {
        const span = vTrig.querySelector(".value, .placeholder");
        if (span) {
          span.className = "value";
          span.textContent = varId;
        }
      }
    }
  }

  function personStore(opt) {
    const dni = opt.dni || opt.id;
    const short = opt.nombreCorto || (QB.Data && QB.Data.shortName(opt.nombre || opt.label)) || opt.label || "";
    if (/^\d+$/.test(String(dni))) return QB.Data.personLabel(dni, opt.nombre || short);
    return QB.Data.formatStoredPerson(String(opt.id || short));
  }

  function personResolve(val) {
    if (!val) return null;
    const shown = QB.Data ? QB.Data.formatStoredPerson(val) : val;
    const m = String(val).match(/^(\d+)\s*[—\-]\s*(.+)$/);
    if (m) return { id: m[1], label: shown, meta: `DNI ${m[1]}` };
    return { id: val, label: shown };
  }

  function personDisplay(val) {
    if (val == null || val === "") return "";
    const shown = QB.Data ? QB.Data.formatStoredPerson(val) : String(val);
    return shown || String(val).trim();
  }

  /** Lee persona del hidden, del trigger visible o del state (evita meta vacío) */
  function readPersonField_(name) {
    const hidden = $(`#field-${name}`);
    let v = hidden && hidden.value != null ? String(hidden.value).trim() : "";
    if (!v) {
      const trig = $(`#trig-${name}`);
      const span = trig?.querySelector(".value");
      if (span) v = String(span.textContent || "").trim();
    }
    if (!v && state.data && state.data[name]) {
      v = String(state.data[name]).trim();
    }
    return v;
  }

  function buildCustomPerson(dni, nombre) {
    const d = String(dni || "").replace(/\D/g, "").trim();
    const n = String(nombre || "").trim();
    const short = QB.Data ? QB.Data.shortName(n) : n;
    return {
      id: QB.Data ? QB.Data.personLabel(d, n) : `${d} — ${short}`,
      label: n,
      meta: "Local · emergencia",
      dni: d,
      nombre: n,
      nombreCorto: short,
      local: true,
    };
  }

  function mergeOpts(...lists) {
    const seen = new Set();
    const out = [];
    lists.flat().forEach((o) => {
      if (!o) return;
      const k = String(o.id || o.label || "").toLowerCase();
      if (!k || seen.has(k)) return;
      seen.add(k);
      out.push(o);
    });
    return out;
  }

  function filterCatalog(list, q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return list || [];
    return (list || []).filter(
      (o) =>
        String(o.label || "").toLowerCase().includes(s) ||
        String(o.id || "").toLowerCase().includes(s) ||
        String(o.meta || "").toLowerCase().includes(s)
    );
  }

  function bindPreciseFields() {
    const binds = {
      lote: {
        title: "Elegir lote",
        searchPlaceholder: "Buscar lote / etapa / módulo…",
        placeholder: "Seleccionar lote...",
        dynamic: true,
        inputmode: "numeric",
        minQuery: 0,
        minHint: "Sin lotes cargados",
        allowCustom: "text",
        customKind: "lote",
        getOptions: (q) =>
          mergeOpts(
            QB.API?.customValueOptions?.("lote", q) || [],
            QB.Data ? QB.Data.loteOptions(q) : []
          ),
        storeValue: (opt) => String(opt?.raw?.codLote || opt?.id || ""),
        resolveOption: (val) => {
          const l = QB.Data && QB.Data.findLote(val);
          if (!l) return val ? { id: val, label: `Lote ${val}` } : null;
          return {
            id: String(l.codLote || l.lote),
            label: QB.Data.loteLabel(l),
            meta: `${l.modulo || "—"} · Turno ${l.turno ?? "—"}`,
            raw: l,
          };
        },
        formatValue: (_opt, val) => {
          const l = QB.Data && QB.Data.findLote(val);
          return l ? QB.Data.loteLabel(l) : val;
        },
        onChange: (opt) => applyLote(opt),
      },
      variedad: {
        title: "Elegir variedad",
        searchPlaceholder: "Buscar variedad...",
        dynamic: true,
        allowCustom: "text",
        customKind: "variedad",
        getOptions: (q) =>
          mergeOpts(
            QB.API?.customValueOptions?.("variedad", q) || [],
            filterCatalog(QB.CATALOG.variedades, q)
          ),
      },
      momento: {
        title: "Elegir evaluación",
        searchPlaceholder: "Buscar...",
        dynamic: true,
        allowCustom: "text",
        customKind: "momento",
        getOptions: (q) =>
          mergeOpts(
            QB.API?.customValueOptions?.("momento", q) || [],
            filterCatalog(QB.CATALOG.evaluacionCaida, q)
          ),
      },
      evaluador: {
        title: "Elegir evaluador",
        searchPlaceholder: "Buscar nombre o código…",
        placeholder: "Seleccionar...",
        dynamic: true,
        minQuery: 0,
        allowCustom: "person",
        customKind: "evaluador",
        buildCustomPerson,
        getOptions: (q) => {
          if (!QB.Data) return [];
          const list = QB.Data.evaluadorOptions(q) || [];
          return list;
        },
        storeValue: personStore,
        resolveOption: personResolve,
        formatValue: (_opt, val) => personDisplay(val),
      },
      supervisor: {
        title: "Elegir supervisor",
        searchPlaceholder: "Buscar DNI o nombre…",
        placeholder: "Seleccionar...",
        dynamic: true,
        minQuery: 0,
        minHint: "Sin supervisores cargados",
        allowCustom: "person",
        customKind: "supervisor",
        buildCustomPerson,
        getOptions: (q) =>
          mergeOpts(
            QB.API?.customPeopleOptions?.("supervisor", q) || [],
            QB.Data ? QB.Data.searchSupervisores(q) : []
          ),
        storeValue: personStore,
        resolveOption: personResolve,
        formatValue: (_opt, val) => personDisplay(val),
      },
      cosechador: {
        title: "Elegir cosechador",
        searchPlaceholder: "Buscar DNI o nombre…",
        placeholder: "Seleccionar...",
        dynamic: true,
        minQuery: 0,
        minHint: "Sin cosechadores cargados",
        listColumns: false,
        allowCustom: "person",
        customKind: "cosechador",
        buildCustomPerson,
        getOptions: (q) =>
          mergeOpts(
            QB.API?.customPeopleOptions?.("cosechador", q) || [],
            QB.Data ? QB.Data.searchTrabajadores(q) : []
          ),
        storeValue: personStore,
        resolveOption: personResolve,
        formatValue: (_opt, val) => personDisplay(val),
      },
    };

    Object.entries(binds).forEach(([name, cfg]) => {
      const trig = $(`#trig-${name}`);
      const hidden = $(`#field-${name}`);
      if (!trig || !hidden || trig.classList.contains("is-locked")) return;
      QB.PreciseSelect.bind(trig, hidden, cfg);
    });

    if (state.data.codLote || state.data.lote) applyLote({ id: state.data.codLote || state.data.lote });
  }

  function readForm() {
    const data = {};
    $$("#form-root [name]").forEach((el) => {
      if (el.type === "number") {
        data[el.name] = el.value === "" ? "" : Number(el.value);
      } else {
        data[el.name] = el.value.trim();
      }
    });
    // Personas: no perder valor si el hidden quedó vacío pero el trigger/state sí lo tiene
    ["evaluador", "supervisor", "cosechador"].forEach((name) => {
      const v = readPersonField_(name);
      if (v) data[name] = v;
    });
    // Lote en formulario guarda codLote único → expandir a lote/módulo/turno/etapa
    if (data.lote && QB.Data?.findLote) {
      const L = QB.Data.findLote(data.lote);
      if (L) {
        data.codLote = L.codLote || data.lote;
        data.lote = String(L.lote);
        data.modulo = L.modulo || data.modulo || "";
        data.turno = L.turno != null && L.turno !== "" ? String(L.turno) : data.turno || "";
        data.etapa = L.etapa || "";
      }
    }
    return data;
  }

  function requiredNames() {
    const required = ["fecha", "evaluador", "supervisor", "variedad", "lote", "modulo", "turno"];
    if (state.type === "calidad") required.push("cosechador", "tamano_muestra");
    else if (state.type === "descarte") required.push("tamano_muestra");
    else if (state.type === "caida") required.push("cosechador", "momento", "plantas_evaluadas", "frutos_caidos");
    else if (state.type === "planta") required.push("cosechador", "plantas_evaluadas", "frutos_planta");
    return required;
  }

  /** Defectos nunca son obligatorios */
  function isDefectField(name) {
    const defs = QB.DEFECTS[state.type] || [];
    return defs.some((d) => d.id === name);
  }

  function applyLoteMetaToData(data) {
    if ((data.codLote || data.lote) && QB.Data?.loteMeta) {
      const meta = QB.Data.loteMeta(data.codLote || data.lote);
      if (meta.modulo) data.modulo = meta.modulo;
      if (meta.turno) data.turno = meta.turno;
      if (meta.lote) data.lote = meta.lote;
      if (meta.etapa) data.etapa = meta.etapa;
      if (meta.codLote) data.codLote = meta.codLote;
    }
    return data;
  }

  function isEmptyRequired(name, val) {
    const empty = val === "" || val == null || (typeof val === "number" && Number.isNaN(val));
    const zeroBad =
      (name === "tamano_muestra" || name === "plantas_evaluadas") && Number(val) <= 0;
    return empty || zeroBad;
  }

  function refreshFieldError(name) {
    if (isDefectField(name)) return;
    const field = $(`#form-root [data-field="${name}"]`);
    if (!field) return;
    const data = readForm();
    if (!requiredNames().includes(name)) {
      field.classList.remove("error");
      return;
    }
    if (isEmptyRequired(name, data[name])) field.classList.add("error");
    else field.classList.remove("error");
  }

  function clampDigitsInput_(el) {
    if (!el || el.tagName !== "INPUT") return;
    const maxDigits = Number(el.dataset.maxDigits || el.getAttribute("maxlength") || 0);
    if (!maxDigits && el.name !== "tamano_muestra") return;
    const limit = maxDigits || (el.name === "tamano_muestra" ? 3 : 0);
    if (!limit) return;
    const digits = String(el.value || "").replace(/\D/g, "").slice(0, limit);
    if (el.value !== digits) el.value = digits;
  }

  function bindLiveValidation() {
    const root = $("#form-root");
    if (!root) return;
    const onUpdate = (e) => {
      const el = e.target;
      if (!el || !el.name) return;
      clampDigitsInput_(el);
      refreshFieldError(el.name);
      if (el.name === "lote") {
        refreshFieldError("modulo");
        refreshFieldError("turno");
      }
      refreshDefectLiveRatings();
      saveDraft_();
    };
    root.addEventListener("input", onUpdate);
    root.addEventListener("change", onUpdate);
    refreshDefectLiveRatings();
  }

  function validate(data, { feedback: showFeedback = true, markFields = true } = {}) {
    const d = data ? { ...data } : readForm();
    let ok = true;
    const required = requiredNames();

    if (markFields && $("#form-root")) {
      $$("#form-root .field").forEach((f) => f.classList.remove("error"));
      for (const name of required) {
        if (isEmptyRequired(name, d[name])) {
          ok = false;
          const field = $(`#form-root [data-field="${name}"]`);
          if (field) field.classList.add("error");
        }
      }
    } else {
      for (const name of required) {
        if (isEmptyRequired(name, d[name])) ok = false;
      }
    }

    if (!ok && showFeedback) {
      toast("Completa los campos obligatorios", "error");
      feedback({
        title: "Campos incompletos",
        text: "Revisa los campos obligatorios antes de guardar.",
        type: "error",
        confirmText: "Entendido",
      });
    }
    return ok ? applyLoteMetaToData(d) : null;
  }

  function goResumen() {
    syncFechaHoy();
    const data = validate(readForm(), { feedback: true, markFields: true });
    if (!data) return;
    data.fecha = todayISO();
    state.data = data;
    state.score = QB.Scoring.compute(state.type, data);
    // Mismo clientId en editar→resumen: evita duplicar conteo / filas
    if (!state.clientId) state.clientId = QB.API.newClientId();
    state.saving = false;
    $("#progress-fill").style.width = "100%";
    renderResumen();
    showScreen("resumen");
    saveDraft_();
  }

  function renderResumen() {
    const evalDef = QB.EVALS[state.type];
    const s = state.score;
    const d = state.data;

    $("#resumen-title").textContent = evalDef.title;
    $("#resumen-sub").textContent = "Resumen · Exportable campo";
    updateStatusUI();

    const metaRows = [
      d.evaluador ? ["Evaluador", personDisplay(d.evaluador)] : null,
      d.supervisor ? ["Supervisor", personDisplay(d.supervisor)] : null,
      d.cosechador ? ["Cosechador", personDisplay(d.cosechador)] : null,
      ["Fecha y hora", nowStamp()],
      d.variedad ? ["Variedad", d.variedad] : null,
      (d.lote || d.modulo || d.turno)
        ? [
            "Lote · Módulo · Turno",
            [
              QB.Data?.loteShortLabel?.(QB.Data.findLote(d.codLote || d.lote)) ||
                (d.lote != null && d.lote !== "" ? `Lote ${d.lote}` : null),
              d.modulo,
              d.turno != null && d.turno !== "" ? `T${d.turno}` : null,
            ]
              .filter((x) => x != null && x !== "")
              .join(" · "),
          ]
        : null,
      d.momento ? ["Momento", d.momento] : null,
      d.tamano_muestra != null && d.tamano_muestra !== ""
        ? ["Tamaño muestra", d.tamano_muestra]
        : null,
    ].filter(Boolean);

    $("#resumen-meta").innerHTML = metaRows
      .map(
        ([k, v]) => `
      <div class="meta-row"><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></div>`
      )
      .join("");

    $("#score-hero").innerHTML = `
      <div>
        <div class="label">Nota final</div>
        <div class="nota">${s.nota}</div>
        <div class="sub">${
          s.promedio != null
            ? `Promedio ${s.promedio} / planta`
            : evalDef.short
        }</div>
      </div>
      <div class="score-badge">
        <strong>${s.calidadGlobal}</strong>
      </div>
    `;

    const box = $("#formula-box");
    if (box) {
      box.hidden = true;
      box.innerHTML = "";
    }

    const showCalc = state.type === "calidad" || state.type === "descarte";
    const head = showCalc
      ? `<tr><th>Ítem</th><th>Cálculo</th><th>Calificación</th></tr>`
      : `<tr><th>Ítem</th><th>Valor</th><th>Calificación</th></tr>`;

    const filtered = s.rows.filter((r) => {
      if (r.grupo === "SUM") return false;
      const item = String(r.item || "").toLowerCase();
      return !item.includes("suma def") && !item.includes("tot. defectos");
    });

    const rowHtml = (r) => {
      const calc =
        r.pct != null
          ? Number(r.pct).toFixed(2)
          : r.count != null
            ? r.count
            : "—";
      let pillHtml = "";
      if (r.calificacion) {
        pillHtml = `<span class="pill ${QB.Scoring.pillClass(r.calificacion)}">${r.calificacion}</span>`;
      }
      return `<tr>
        <td>${escapeHtml(r.item)}</td>
        <td>${calc}</td>
        <td>${pillHtml}</td>
      </tr>`;
    };

    const always = [];
    const bueno = [];
    const excelente = [];
    for (const r of filtered) {
      if (r.calificacion === "Bueno") bueno.push(r);
      else if (r.calificacion === "Excelente") excelente.push(r);
      else always.push(r);
    }

    const accBlock = (key, label, rows, pillClass) => {
      // Solo acordeón si hay varios (ayuda a capturar); 1 ítem se muestra directo
      if (!rows.length) return "";
      if (rows.length === 1) {
        return `<table><tbody>${rows.map(rowHtml).join("")}</tbody></table>`;
      }
      return `
        <div class="resumen-acc" data-acc="${key}">
          <button type="button" class="resumen-acc-btn" aria-expanded="false">
            <span class="resumen-acc-left">
              <span class="pill ${pillClass}">${label}</span>
              <span class="resumen-acc-count">${rows.length} ítem${rows.length === 1 ? "" : "s"}</span>
            </span>
            <span class="resumen-acc-chevron" aria-hidden="true">${ICONS.caret}</span>
          </button>
          <div class="resumen-acc-panel" hidden>
            <table><tbody>${rows.map(rowHtml).join("")}</tbody></table>
          </div>
        </div>`;
    };

    $("#resumen-table").innerHTML = `
      <table>
        <thead>${head}</thead>
        <tbody>${always.map(rowHtml).join("") || `<tr><td colspan="3" class="resumen-empty-hint">Sin ítems críticos</td></tr>`}</tbody>
      </table>
      ${accBlock("bueno", "Bueno", bueno, "bueno")}
      ${accBlock("excelente", "Excelente", excelente, "excelente")}
    `;

    $("#resumen-table").querySelectorAll(".resumen-acc-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wrap = btn.closest(".resumen-acc");
        const panel = wrap?.querySelector(".resumen-acc-panel");
        if (!panel) return;
        const open = panel.hidden;
        panel.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        wrap.classList.toggle("is-open", open);
      });
    });
  }

  async function save() {
    if (!state.score || !state.type || state.saving) return;

    syncFechaHoy();
    if (state.data) state.data.fecha = todayISO();

    const data = validate(state.data, { feedback: true, markFields: false });
    if (!data) {
      showScreen("form");
      renderForm();
      validate(readForm(), { feedback: false, markFields: true });
      return;
    }
    state.data = data;

    state.saving = true;
    const saveBtn = $("#btn-save");
    if (saveBtn) saveBtn.disabled = true;

    setLoading(true, "Guardando evaluación...");

    function exitToHome() {
      setLoading(false);
      clearEvalSession();
      goHome();
      renderHome();
      renderOpsPanel();
      updateStatusUI();
    }

    try {
      const payload = {
        type: state.type,
        sheet: QB.EVALS[state.type].sheet,
        clientId: state.clientId,
        data: state.data,
        score: {
          nota: state.score.nota,
          calidadGlobal: state.score.calidadGlobal,
          pctCalidad: state.score.pctCalidad,
          sumaDefectos: state.score.sumaDefectos,
          sumaDefCal: state.score.sumaDefCal,
          sumaDefCon: state.score.sumaDefCon,
          ptsTot: state.score.ptsTot,
          ptsPromedio: state.score.ptsPromedio,
          promedio: state.score.promedio,
          rows: state.score.rows,
        },
      };
      const res = await QB.API.submit(payload);
      exitToHome();
      if (res.mode === "demo") {
        toast("Guardado solo en el celular", "warn");
      } else {
        toast("Evaluación enviada ✓", "ok");
      }
    } catch (err) {
      exitToHome();
      toast("Sin red — quedó en cola", "info");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function bindChrome() {
    const goHomeSafe = async () => {
      if (state.screen === "form" || state.screen === "resumen") {
        saveDraft_();
        const ok = await confirmCancel();
        if (!ok) return;
      }
      goHome();
      renderHome();
    };

    $("#btn-back-form").addEventListener("click", goHomeSafe);
    $("#btn-cancel")?.addEventListener("click", goHomeSafe);
    $("#btn-back-resumen").addEventListener("click", () => {
      renderForm();
      showScreen("form");
      $("#progress-fill").style.width = "45%";
      saveDraft_();
    });
    $("#btn-review").addEventListener("click", goResumen);
    $("#btn-save").addEventListener("click", save);
    $("#btn-uploads")?.addEventListener("click", openUploadsHistory);
    $("#btn-sync-info")?.addEventListener("click", openSyncModal);
    $("#qb-sync-close")?.addEventListener("click", closeSyncModal);
    $("#qb-sync-done")?.addEventListener("click", closeSyncModal);
    $("#qb-sync-update")?.addEventListener("click", updateApp);
    $("#qb-sync-clear")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearAppCache();
    });
    $("#btn-install-app")?.addEventListener("click", promptInstallApp_);
    $("#btn-install-dismiss")?.addEventListener("click", () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
      const banner = $("#install-banner");
      if (banner) banner.hidden = true;
    });
    $("#qb-sync-tips")?.addEventListener("click", (e) => {
      const tip = e.target.closest("[data-tip]");
      if (!tip) return;
      showTipAdvice(tip.dataset.tip);
    });
    $("#qb-sync")?.addEventListener("click", (e) => {
      if (e.target === $("#qb-sync")) closeSyncModal();
    });
    $("#btn-back-uploads")?.addEventListener("click", goHome);
    $("#uploads-prev")?.addEventListener("click", () => {
      if (state.uploadsPage > 0) {
        state.uploadsPage -= 1;
        renderUploadsHistory();
        document.querySelector("#screen-uploads .panel-scroll")?.scrollTo(0, 0);
      }
    });
    $("#uploads-next")?.addEventListener("click", () => {
      state.uploadsPage += 1;
      renderUploadsHistory();
      document.querySelector("#screen-uploads .panel-scroll")?.scrollTo(0, 0);
    });
    $("#btn-edit").addEventListener("click", () => {
      renderForm();
      showScreen("form");
      $("#progress-fill").style.width = "45%";
      saveDraft_();
    });

    document.querySelectorAll("#chip-pending, [data-chip-pending]").forEach((btn) => {
      btn.addEventListener("click", () => syncPending(true));
    });

    window.addEventListener("online", async () => {
      updateStatusUI();
      await syncPending(false);
    });
    window.addEventListener("offline", () => {
      updateStatusUI();
    });
    window.addEventListener("qb:queue", () => {
      updateStatusUI();
      renderOpsPanel();
      if (state.screen === "uploads") renderUploadsHistory();
    });
    window.addEventListener("qb:activity", () => {
      renderOpsPanel();
      if (state.screen === "uploads") renderUploadsHistory();
    });
    updateStatusUI();
  }

  function init() {
    if (!allowMobileOrTablet_()) {
      document.documentElement.classList.add("is-desktop");
      document.body.classList.add("is-desktop");
      return;
    }
    document.documentElement.classList.remove("is-desktop");
    document.body.classList.remove("is-desktop");
    renderHome();
    bindChrome();
    setupInstallPrompt_();
    lockDrag();
    resetViewportLayout();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resetViewportLayout);
      window.visualViewport.addEventListener("scroll", resetViewportLayout);
    }
    window.addEventListener("resize", resetViewportLayout);
    window.addEventListener("orientationchange", () => setTimeout(resetViewportLayout, 120));
    document.addEventListener("focusin", (e) => {
      if (!isTypingField_(e.target)) return;
      setKeyboardUi_(true);
      // iOS y Android abren el teclado a ritmos distintos
      [50, 150, 350].forEach((ms) => setTimeout(resetViewportLayout, ms));
    });
    document.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!isKeyboardOpen_()) {
          setKeyboardUi_(false);
          const app = document.querySelector(".app");
          if (app) app.style.transform = "";
        }
        resetViewportLayout();
      }, 150);
    });
    // Android Chrome a veces dispara resize de window al abrir teclado
    window.addEventListener("resize", () => {
      if (isKeyboardOpen_()) setTimeout(resetViewportLayout, 30);
    });

    // Si la app queda abierta y cambia el día → refrescar fecha
    const refreshFechaIfNeeded = () => {
      if (state.screen === "form" || state.screen === "resumen") {
        syncFechaHoy();
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveDraft_();
      if (document.visibilityState === "visible") refreshFechaIfNeeded();
    });
    window.addEventListener("pagehide", saveDraft_);
    window.addEventListener("focus", refreshFechaIfNeeded);
    window.addEventListener("pageshow", refreshFechaIfNeeded);

    updateStatusUI();
    renderOpsPanel();
    const foot = $("#home-foot");
    if (foot) foot.textContent = `Q Berries · Quality Ops · v${QB.CONFIG.VERSION || ""}`;
    if (QB.Data) {
      QB.Data.load().then((ok) => {
        if (!ok) toast("No se cargaron lotes / DNI", "error");
        // Re-pintar con módulo/turno ya disponibles
        renderOpsPanel();
      });
    } else {
      renderOpsPanel();
    }
    if (navigator.onLine) syncPending(false).catch(() => {});
  }

  /** Celular / tablet sí · PC de escritorio no */
  function allowMobileOrTablet_() {
    const ua = navigator.userAgent || "";
    const touch = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
    const w = Math.min(window.innerWidth || 0, screen.width || 9999);
    const h = Math.min(window.innerHeight || 0, screen.height || 9999);
    const shortSide = Math.min(w, h);
    const longSide = Math.max(w, h);

    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Kindle|Silk/i.test(ua)) {
      return true;
    }
    // iPadOS que se hace pasar por Mac
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
    // Tablet táctil sin UA móvil (no basta con achicar la ventana del PC)
    if (touch && shortSide <= 900 && longSide <= 1400) return true;
    return false;
  }

  function lockDrag() {
    // Solo evita arrastrar imágenes/elementos; no bloquea el scroll
    document.addEventListener(
      "dragstart",
      (e) => {
        const t = e.target;
        if (!t) return;
        if (t.closest("input, textarea")) return;
        if (t.tagName === "IMG" || t.closest("button, a, .eval-card, .corp-header")) {
          e.preventDefault();
        }
      },
      { capture: true }
    );

    // Anti rubber-band (iOS / Android): no jalar más allá del scroll
    let touchStartY = 0;
    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches && e.touches.length === 1) {
          touchStartY = e.touches[0].clientY;
        }
      },
      { passive: true, capture: true }
    );

    document.addEventListener(
      "touchmove",
      (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        // Chrome marca algunos touchmove como no cancelables (scroll ya en curso)
        if (!e.cancelable) return;
        const target = e.target;
        if (!target || !target.closest) return;
        if (target.closest("input, textarea, [contenteditable=true]")) return;
        // Con teclado abierto no bloquear gestos (iOS necesita mover el caret/scroll)
        if (document.body.classList.contains("kb-open")) return;

        const dy = e.touches[0].clientY - touchStartY;
        const scrollEl = target.closest(".panel-scroll, .overlay-body, .qb-sync-sheet, .precise-list");

        if (!scrollEl) {
          e.preventDefault();
          return;
        }

        const atTop = scrollEl.scrollTop <= 0;
        const atBottom =
          scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;

        // Jalando hacia abajo en el tope, o hacia arriba al final → bloquear rebote
        if ((atTop && dy > 0) || (atBottom && dy < 0)) {
          e.preventDefault();
        }
      },
      { passive: false, capture: true }
    );

    // Mouse drag rubber-band en algunos browsers
    document.addEventListener(
      "wheel",
      (e) => {
        if (document.body.classList.contains("kb-open")) return;
        const scrollEl = e.target?.closest?.(".panel-scroll, .overlay-body, .qb-sync-sheet, .precise-list");
        if (!scrollEl) {
          e.preventDefault();
          return;
        }
        const atTop = scrollEl.scrollTop <= 0;
        const atBottom =
          scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 1;
        if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
          e.preventDefault();
        }
      },
      { passive: false, capture: true }
    );
  }

  return { init, goHome, startEval };
})();

document.addEventListener("DOMContentLoaded", () => QB.App.init());
