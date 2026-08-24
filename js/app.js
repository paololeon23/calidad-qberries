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

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
      title: "¿Cancelar evaluación?",
      text: "Se perderán los datos no guardados.",
      type: "warn",
      confirmText: "Sí, salir",
      cancelText: "Seguir",
    });
  }

  function todayISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /** Día local (no UTC) — evita que de noche “Hoy” quede en 0 */
  function localDayISO(iso) {
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
    document.querySelectorAll(".form-actions").forEach((el) => {
      el.classList.toggle("kb-hidden", !!open);
    });
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
    state.type = null;
    state.data = {};
    state.score = null;
    state.clientId = null;
    state.saving = false;
  }

  async function startEval(type) {
    state.type = type;
    state.data = { fecha: todayISO() };
    state.score = null;
    state.clientId = null;
    state.saving = false;
    if (QB.Data && !QB.Data.isReady()) {
      setLoading(true, "Cargando catálogos...");
      await QB.Data.load();
      setLoading(false);
    }
    renderForm();
    showScreen("form");
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
    const grid = $("#eval-grid");
    grid.innerHTML = Object.values(QB.EVALS)
      .map(
        (e, i) => `
      <button type="button" class="eval-card" data-type="${e.id}" style="--i:${i}">
        <div class="eval-icon">${ICONS[e.id]}</div>
        <div class="eval-meta">
          <h2>${e.title}</h2>
          <p>${e.desc}</p>
          <span class="eval-code">${EVAL_CODES[e.id] || ""}</span>
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

    const now = new Date();
    dateEl.textContent = now.toLocaleDateString("es-PE", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });

    const today = todayISO();
    // Enviados + pendientes de HOY (hora local Perú)
    const todayItems = QB.API.getUploadHistory().filter(
      (a) => localDayISO(a.at) === today
    );
    const sentToday = todayItems.filter((a) => a.status !== "pending");
    const notas = sentToday
      .map((a) => Number(a.nota))
      .filter((n) => !Number.isNaN(n));
    const avg = notas.length
      ? Math.round((notas.reduce((s, n) => s + n, 0) / notas.length) * 10) / 10
      : null;
    const pend = QB.API.pendingCount();

    $("#kpi-hoy").textContent = String(todayItems.length);
    $("#kpi-nota").textContent =
      avg != null && QB.Scoring?.gradeLabel ? QB.Scoring.gradeLabel(avg) : "—";
    $("#kpi-pend").textContent = String(pend);
    $("#kpi-pend").parentElement?.classList.toggle("warn", pend > 0);

    const lastWrap = $("#ops-last");
    const last = todayItems[0] || QB.API.getUploadHistory()[0];
    if (!last) {
      const tips = [
        "Tip: usa el select con búsqueda para ir más rápido.",
        "Tip: sin red, los registros se reenvían al volver la señal.",
        "Tip: el resumen muestra nota y calificación al instante.",
      ];
      const tip = tips[now.getHours() % tips.length];
      lastWrap.innerHTML = `
        <div class="ops-brief">
          <div class="ops-brief-row"><span>Estado</span><strong>Listo para evaluar</strong></div>
          <div class="ops-brief-row"><span>Conexión</span><strong>${navigator.onLine ? "En línea" : "Sin conexión"}</strong></div>
          <p class="ops-tip">${tip}</p>
        </div>`;
      return;
    }

    const evalDef = QB.EVALS[last.type];
    const title = evalDef ? evalDef.title : last.type;
    const who = personDisplay(last.cosechador || last.evaluador || "—");
    const meta = last.variedad || "";
    const time = last.at
      ? new Date(last.at).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" })
      : "";
    const loteBig =
      last.lote != null && last.lote !== "" ? `Lote ${last.lote}` : "—";
    let modSm = "—";
    let turSm = "—";
    if (last.lote && QB.Data?.loteMeta) {
      const meta = QB.Data.loteMeta(last.lote);
      modSm = meta.modulo || last.modulo || "—";
      turSm = meta.turno ? `T${meta.turno}` : last.turno ? `T${last.turno}` : "—";
    } else {
      modSm = last.modulo || "—";
      turSm = last.turno != null && last.turno !== "" ? `T${last.turno}` : "—";
    }

    lastWrap.innerHTML = `
      <div class="ops-last-card">
        <div class="ops-last-top">
          <span class="ops-last-tag">Última evaluación</span>
          <span class="ops-last-time">${escapeHtml(time)}</span>
        </div>
        <div class="ops-last-body">
          <div class="ops-last-info">
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(who)}${meta ? ` · ${escapeHtml(meta)}` : ""}</p>
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
    const syncInstall = $("#qb-sync-install");
    const title = $("#install-banner-title");
    const text = $("#install-banner-text");
    const btn = $("#btn-install-app");
    const syncSub = $("#qb-sync-install-sub");
    const dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";

    if (installed) {
      if (banner) banner.hidden = true;
      if (syncInstall) syncInstall.hidden = true;
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
    if (syncInstall) {
      syncInstall.hidden = false;
      syncInstall.innerHTML = `${ios ? "Anclar a inicio" : "Instalar app"}<small>${
        ios ? "Safari → Compartir → Agregar a inicio" : "Agregar a la pantalla de inicio"
      }</small>`;
    }

    // Banner: Android con prompt nativo, o tip iOS (si no lo cerraron)
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
    const ok = await feedback({
      title: "¿Borrar caché?",
      text: "Limpia formularios temporales. No borra pendientes por enviar ni el historial local.",
      type: "warn",
      confirmText: "Borrar",
      cancelText: "Cancelar",
    });
    if (!ok) return;

    setLoading(true, "Limpiando…");
    try {
      // No tocar cola pendiente ni activity
      const keep = new Set(["qb_pending_queue", "qb_activity", "qb_people_history"]);
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !keep.has(k) && (k.startsWith("qb_") || k.startsWith("QB_"))) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
      // Limpiar sessionStorage de drafts
      try {
        sessionStorage.clear();
      } catch (_) {}
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (_) {
      /* ignore */
    }
    setLoading(false);
    closeSyncModal();
    toast("Caché limpia ✓", "ok");
    setTimeout(() => window.location.reload(), 400);
  }

  function showTipAdvice(tip) {
    const tips = {
      lote: {
        title: "Lote primero",
        text: "Elige el lote y el app completa módulo y turno. Así evitas errores en campo.",
      },
      offline: {
        title: "Trabajo sin red",
        text: "Puedes GUARDAR sin internet. Queda en cola (pend.) y se envía solo al recuperar señal.",
      },
      resumen: {
        title: "Ver tus registros",
        text: "En el inicio pulsa Resumen para ver enviados y pendientes, 10 por página.",
      },
      una: {
        title: "Una a la vez",
        text: "Completa, Ver resumen, GUARDAR. Vuelves al inicio listo para la siguiente evaluación.",
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
    if (item.lote && QB.Data?.loteMeta) {
      const meta = QB.Data.loteMeta(item.lote);
      if (meta.modulo) modSm = meta.modulo;
      if (meta.turno) turSm = `T${meta.turno}`;
      if (meta.lote) loteBig = `Lote ${meta.lote}`;
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
    const val = state.data[name] ?? opts.value ?? "";
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
            <span class="${val ? "value" : "placeholder"}">${val || opts.placeholder || "Seleccionar..."}</span>
            ${ICONS.caret}
          </button>
          <input type="hidden" name="${name}" id="field-${name}" value="${escapeAttr(val)}" ${opts.required ? "required" : ""} />
          <span class="field-hint">Campo obligatorio</span>
        </div>`;
    }
    if (type === "date") {
      const shown = val && QB.DatePicker ? QB.DatePicker.formatDisplay(val) : val;
      return `
        <div class="field" data-field="${name}">
          <label>${label}${req}</label>
          <button type="button" class="precise-trigger date-trigger" id="trig-${name}">
            <span class="${val ? "value" : "placeholder"}">${shown || "Elegir fecha..."}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="5" width="18" height="16" rx="2"/>
              <path d="M3 10h18M8 3v4M16 3v4"/>
            </svg>
          </button>
          <input type="hidden" name="${name}" id="field-${name}" value="${escapeAttr(val)}" ${opts.required ? "required" : ""} />
          <span class="field-hint">Campo obligatorio</span>
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
    return `
      <div class="field" data-field="${name}">
        <label>${label}${req}</label>
        <input type="${type}" name="${name}" id="field-${name}" value="${escapeAttr(val)}"
          ${opts.min != null ? `min="${opts.min}"` : ""}
          ${opts.step != null ? `step="${opts.step}"` : ""}
          ${opts.inputmode ? `inputmode="${opts.inputmode}"` : ""}
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
          <p class="section-sub">Ingrese la cantidad encontrada en la muestra.</p>
        </div>
        <div class="defect-grid">
          ${defs
            .map((d) => {
              const raw = state.data[d.id];
              const hasVal = raw !== undefined && raw !== null && raw !== "";
              const v = hasVal ? raw : "";
              return `
              <div class="defect-item">
                <label for="field-${d.id}">${d.label}</label>
                <input type="number" min="0" step="1" inputmode="numeric"
                  name="${d.id}" id="field-${d.id}" value="${escapeAttr(v)}"
                  placeholder="00" />
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  function renderForm() {
    const evalDef = QB.EVALS[state.type];
    const form = $("#form-root");
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
        ${fieldHtml("tamano_muestra", "Tamaño de muestra", { type: "number", min: 1, inputmode: "numeric", required: true })}
      `;
      defects = defectsHtml("calidad");
      comentario = fieldHtml("comentario", "Comentario adicional", { type: "textarea", placeholder: "Opcional..." });
    } else if (state.type === "descarte") {
      detalle = `
        ${fieldHtml("tamano_muestra", "Tamaño de muestra", { type: "number", min: 1, inputmode: "numeric", required: true })}
      `;
      defects = defectsHtml("descarte");
      comentario = fieldHtml("comentario", "Comentario", { type: "textarea", placeholder: "Opcional..." });
    } else if (state.type === "caida") {
      detalle = `
        ${fieldHtml("cosechador", "Cosechador", { precise: true, required: true, placeholder: "Seleccionar..." })}
        ${fieldHtml("momento", "Evaluación", { precise: true, required: true, placeholder: "Antes / Después..." })}
        <div class="field-row">
          ${fieldHtml("plantas_evaluadas", "Plantas evaluadas", { type: "number", min: 1, inputmode: "numeric", required: true })}
          ${fieldHtml("frutos_caidos", "Cantidad de frutos caidos", { type: "number", min: 0, inputmode: "numeric", required: true })}
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
        ${fieldHtml("evaluador", "Evaluador", { precise: true, allowCustom: true, required: true, placeholder: "Seleccionar..." })}
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
    bindDateField();
    bindLiveValidation();
  }

  function bindDateField() {
    const trig = $("#trig-fecha");
    const hidden = $("#field-fecha");
    if (!trig || !hidden || !QB.DatePicker) return;
    QB.DatePicker.bind(trig, hidden);
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
    return QB.Data ? QB.Data.formatStoredPerson(val) : val;
  }

  function bindPreciseFields() {
    const binds = {
      lote: {
        title: "Elegir lote",
        searchPlaceholder: "Buscar lote / Q…",
        placeholder: "Seleccionar lote...",
        dynamic: true,
        inputmode: "numeric",
        getOptions: (q) => (QB.Data ? QB.Data.loteOptions(q) : []),
        resolveOption: (val) => {
          const l = QB.Data && QB.Data.findLote(val);
          if (!l) return val ? { id: val, label: `Lote ${val}` } : null;
          return {
            id: String(l.lote),
            label: `Lote ${l.lote}`,
            meta: `${l.modulo} · Turno ${l.turno}`,
            raw: l,
          };
        },
        onChange: (opt) => applyLote(opt),
      },
      variedad: {
        title: "Elegir variedad",
        searchPlaceholder: "Buscar variedad...",
        getOptions: () => QB.CATALOG.variedades,
      },
      momento: {
        title: "Elegir evaluación",
        searchPlaceholder: "Buscar...",
        getOptions: () => QB.CATALOG.evaluacionCaida,
      },
      evaluador: {
        title: "Elegir evaluador",
        searchPlaceholder: "Buscar nombre o DNI…",
        placeholder: "Seleccionar...",
        allowCustom: true,
        dynamic: true,
        minQuery: 0,
        getOptions: (q) =>
          QB.Data
            ? QB.Data.evaluadorOptions(q, (QB.API.peopleOptions("evaluador") || []).map((o) => o.label))
            : QB.API.peopleOptions("evaluador"),
        formatValue: (_opt, val) => personDisplay(val),
      },
      supervisor: {
        title: "Elegir supervisor",
        searchPlaceholder: "Buscar DNI o nombre…",
        placeholder: "Seleccionar...",
        dynamic: true,
        minQuery: 0,
        getOptions: (q) => (QB.Data ? QB.Data.searchSupervisores(q) : []),
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
        getOptions: (q) => (QB.Data ? QB.Data.searchTrabajadores(q) : []),
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

    if (state.data.lote) applyLote({ id: state.data.lote });
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

  function isEmptyRequired(name, val) {
    const empty = val === "" || val == null || (typeof val === "number" && Number.isNaN(val));
    const zeroBad =
      (name === "tamano_muestra" || name === "plantas_evaluadas") && Number(val) <= 0;
    return empty || zeroBad;
  }

  function refreshFieldError(name) {
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

  function bindLiveValidation() {
    const root = $("#form-root");
    if (!root) return;
    const onUpdate = (e) => {
      const el = e.target;
      if (!el || !el.name) return;
      refreshFieldError(el.name);
      if (el.name === "lote") {
        refreshFieldError("modulo");
        refreshFieldError("turno");
      }
    };
    root.addEventListener("input", onUpdate);
    root.addEventListener("change", onUpdate);
  }

  function validate() {
    const data = readForm();
    let ok = true;
    const required = requiredNames();

    $$("#form-root .field").forEach((f) => f.classList.remove("error"));

    for (const name of required) {
      if (isEmptyRequired(name, data[name])) {
        ok = false;
        const field = $(`#form-root [data-field="${name}"]`);
        if (field) field.classList.add("error");
      }
    }

    if (!ok) {
      toast("Completa los campos obligatorios", "error");
      feedback({
        title: "Campos incompletos",
        text: "Revisa los campos marcados en rojo.",
        type: "error",
        confirmText: "Entendido",
      });
    }
    return ok ? data : null;
  }

  function goResumen() {
    const data = validate();
    if (!data) return;
    // Asegurar módulo/turno desde lote antes de calcular
    if (data.lote && QB.Data?.loteMeta) {
      const meta = QB.Data.loteMeta(data.lote);
      if (meta.modulo) data.modulo = meta.modulo;
      if (meta.turno) data.turno = meta.turno;
    }
    state.data = data;
    state.score = QB.Scoring.compute(state.type, data);
    state.clientId = QB.API.newClientId();
    state.saving = false;
    $("#progress-fill").style.width = "100%";
    renderResumen();
    showScreen("resumen");
  }

  function renderResumen() {
    const evalDef = QB.EVALS[state.type];
    const s = state.score;
    const d = state.data;

    $("#resumen-title").textContent = evalDef.title;
    $("#resumen-sub").textContent = "Resumen · Exportable campo";
    updateStatusUI();

    const metaRows = [
      ["Evaluador", personDisplay(d.evaluador)],
      ["Supervisor", personDisplay(d.supervisor)],
      d.cosechador ? ["Cosechador", personDisplay(d.cosechador)] : null,
      ["Fecha y hora", nowStamp()],
      ["Variedad", d.variedad],
      (d.lote || d.modulo || d.turno)
        ? [
            "Lote · Módulo · Turno",
            [d.lote, d.modulo, d.turno].filter((x) => x != null && x !== "").join(" · "),
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
          s.pctCalidad != null
            ? `% Calidad ${s.pctCalidad} · Def. ${s.sumaDefectos}%`
            : s.promedio != null
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

    const body = s.rows
      .map((r) => {
        const isSum = r.grupo === "SUM";
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
        return `<tr class="${isSum ? "total" : ""}">
          <td>${escapeHtml(r.item)}</td>
          <td>${calc}</td>
          <td>${pillHtml}</td>
        </tr>`;
      })
      .join("");

    $("#resumen-table").innerHTML = `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  async function save() {
    if (!state.score || !state.type || state.saving) return;
    state.saving = true;
    const saveBtn = $("#btn-save");
    if (saveBtn) saveBtn.disabled = true;

    setLoading(true, "Guardando evaluación...");

    function exitToHome() {
      setLoading(false);
      clearEvalSession();
      goHome();
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
        const ok = await confirmCancel();
        if (!ok) return;
      }
      goHome();
    };

    $("#btn-back-form").addEventListener("click", goHomeSafe);
    $("#btn-cancel")?.addEventListener("click", goHomeSafe);
    $("#btn-back-resumen").addEventListener("click", () => {
      showScreen("form");
      $("#progress-fill").style.width = "45%";
    });
    $("#btn-review").addEventListener("click", goResumen);
    $("#btn-save").addEventListener("click", save);
    $("#btn-uploads")?.addEventListener("click", openUploadsHistory);
    $("#btn-sync-info")?.addEventListener("click", openSyncModal);
    $("#qb-sync-close")?.addEventListener("click", closeSyncModal);
    $("#qb-sync-done")?.addEventListener("click", closeSyncModal);
    $("#qb-sync-update")?.addEventListener("click", updateApp);
    $("#qb-sync-install")?.addEventListener("click", () => {
      closeSyncModal();
      setTimeout(() => promptInstallApp_(), 220);
    });
    $("#btn-install-app")?.addEventListener("click", promptInstallApp_);
    $("#btn-install-dismiss")?.addEventListener("click", () => {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
      const banner = $("#install-banner");
      if (banner) banner.hidden = true;
    });
    $("#qb-sync-cache")?.addEventListener("click", clearAppCache);
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
      showScreen("form");
      $("#progress-fill").style.width = "45%";
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
      document.body.classList.add("is-desktop");
      const gate = document.getElementById("desktop-gate");
      if (gate) gate.hidden = false;
      return;
    }
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

  /** Celular / tablet sí · PC de escritorio no (modo responsive del navegador sí) */
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
    // Ventana estrecha (DevTools móvil) o tablet táctil
    if (shortSide <= 900) return true;
    if (touch && longSide <= 1366) return true;
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
