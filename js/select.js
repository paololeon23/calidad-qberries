/** PreciseSelect — modal buscable (lote / DNI / catálogos) */
window.QB = window.QB || {};

QB.PreciseSelect = (() => {
  let overlay, modal, titleEl, searchEl, listEl, addBtn;
  let state = {
    open: false,
    options: [],
    filtered: [],
    selected: null,
    allowCustom: false,
    dynamic: false,
    minQuery: 0,
    emptyHint: "Sin resultados",
    getOptions: null,
    onSelect: null,
    title: "",
    placeholder: "Buscar...",
    inputmode: "",
  };

  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.id = "precise-overlay";
    overlay.innerHTML = `
      <div class="precise-modal" role="dialog" aria-modal="true">
        <div class="precise-modal-head">
          <h3 id="precise-title">Buscar</h3>
          <button type="button" class="icon-btn" id="precise-close" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="precise-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="search" id="precise-search" placeholder="Buscar..." autocomplete="off" enterkeyhint="search" />
        </div>
        <div class="precise-list" id="precise-list"></div>
        <button type="button" class="precise-add" id="precise-add" hidden>Agregar uno</button>
      </div>
    `;
    document.body.appendChild(overlay);

    modal = overlay.querySelector(".precise-modal");
    titleEl = overlay.querySelector("#precise-title");
    searchEl = overlay.querySelector("#precise-search");
    listEl = overlay.querySelector("#precise-list");
    addBtn = overlay.querySelector("#precise-add");

    overlay.querySelector("#precise-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    searchEl.addEventListener("input", () => {
      filter(searchEl.value);
      updateAddVisibility();
    });
    addBtn.addEventListener("click", () => {
      const q = searchEl.value.trim();
      if (!q) return;
      pick({ id: q, label: q, meta: "Nuevo" });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.open) close();
    });
  }

  function resolveOptions(q) {
    if (typeof state.getOptions === "function") {
      return state.getOptions(q) || [];
    }
    return state.options || [];
  }

  function filter(q) {
    const raw = q || "";
    const s = raw.trim().toLowerCase();

    if (state.dynamic) {
      const digits = s.replace(/\D/g, "");
      const qLen = state.inputmode === "numeric" ? digits.length : s.length;
      if (state.minQuery && qLen < state.minQuery) {
        state.filtered = [];
        state.emptyHint =
          state.minHint || `Escribe al menos ${state.minQuery} caracteres`;
        renderList();
        return;
      }
      state.options = resolveOptions(raw);
      state.filtered = [...state.options];
      state.emptyHint = s
        ? state.allowCustom
          ? "Sin resultados — usa Agregar"
          : "Sin resultados"
        : state.minHint || "Escribe para buscar";
      renderList();
      return;
    }

    state.filtered = !s
      ? [...state.options]
      : state.options.filter(
          (o) =>
            String(o.label).toLowerCase().includes(s) ||
            String(o.meta || "").toLowerCase().includes(s) ||
            String(o.id).toLowerCase().includes(s)
        );
    state.emptyHint = "Sin resultados";
    renderList();
  }

  function updateAddVisibility() {
    const q = searchEl.value.trim();
    const exists = (state.options || []).some(
      (o) => String(o.label).toLowerCase() === q.toLowerCase() || String(o.id) === q
    );
    addBtn.hidden = !(state.allowCustom && q && !exists);
    addBtn.textContent = q ? `Agregar “${q}”` : "Agregar uno";
  }

  function renderList() {
    if (!state.filtered.length) {
      listEl.innerHTML = `<div class="precise-empty">${escapeHtml(state.emptyHint || "Sin resultados")}</div>`;
      return;
    }
    listEl.innerHTML = state.filtered
      .map((o) => {
        const sel = state.selected && String(state.selected) === String(o.id);
        const meta = o.meta
          ? `<span class="opt-meta">${escapeHtml(o.meta)}</span>`
          : "";
        return `<button type="button" class="precise-option${sel ? " selected" : ""}" data-id="${escapeAttr(o.id)}">
          <span class="opt-title">${escapeHtml(o.label)}</span>${meta}
        </button>`;
      })
      .join("");

    listEl.querySelectorAll(".precise-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const opt =
          state.options.find((o) => String(o.id) === btn.dataset.id) ||
          state.filtered.find((o) => String(o.id) === btn.dataset.id);
        if (opt) pick(opt);
      });
    });
  }

  function pick(opt) {
    state.selected = opt.id;
    if (typeof state.onSelect === "function") state.onSelect(opt);
    close();
  }

  function open(opts) {
    ensureDom();
    state.open = true;
    state.getOptions = opts.getOptions || null;
    state.dynamic = !!opts.dynamic || typeof opts.getOptions === "function";
    state.options = state.dynamic ? [] : opts.options || [];
    state.selected = opts.value ?? null;
    state.allowCustom = !!opts.allowCustom;
    state.onSelect = opts.onSelect || null;
    state.title = opts.title || "Buscar";
    state.placeholder = opts.placeholder || "Buscar...";
    state.minQuery = opts.minQuery || 0;
    state.minHint = opts.minHint || "";
    state.emptyHint = opts.emptyHint || "Sin resultados";
    state.inputmode = opts.inputmode || "";

    titleEl.textContent = state.title;
    searchEl.placeholder = state.placeholder;
    searchEl.value = "";
    if (state.inputmode) searchEl.setAttribute("inputmode", state.inputmode);
    else searchEl.removeAttribute("inputmode");

    if (!state.dynamic) {
      state.options = opts.options || [];
    }
    filter("");
    updateAddVisibility();
    overlay.classList.add("open");
    // No auto-focus: en móvil abre el teclado y pestañea con visualViewport
  }

  let activeTrigger = null;

  function close() {
    state.open = false;
    if (searchEl && document.activeElement === searchEl) searchEl.blur();
    if (overlay) overlay.classList.remove("open");
    if (activeTrigger) {
      activeTrigger.classList.remove("open");
      activeTrigger.blur();
      activeTrigger = null;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, "&quot;");
  }

  /** Bind a trigger button + hidden input */
  function bind(trigger, hiddenInput, config) {
    const displayValue = (opt, val) => {
      if (config.formatValue) return config.formatValue(opt, val);
      if (opt) return opt.label;
      return val;
    };

    const sync = () => {
      const val = hiddenInput.value;
      let opt = null;
      if (config.resolveOption) opt = config.resolveOption(val);
      else if (typeof config.getOptions === "function" && !config.dynamic) {
        opt = (config.getOptions("") || []).find((o) => String(o.id) === val);
      } else if (config.getOptions && !config.dynamic) {
        opt = (config.getOptions() || []).find((o) => String(o.id) === val);
      }
      const span = trigger.querySelector(".value, .placeholder");
      if (!span) return;
      if (opt || val) {
        span.className = "value";
        span.textContent = displayValue(opt, val);
      } else {
        span.className = "placeholder";
        span.textContent = config.placeholder || "Seleccionar...";
      }
    };

    trigger.addEventListener("click", () => {
      if (trigger.disabled || trigger.classList.contains("is-locked")) return;
      activeTrigger = trigger;
      trigger.classList.add("open");
      open({
        title: config.title,
        placeholder: config.searchPlaceholder || "Buscar...",
        options: config.dynamic ? [] : typeof config.getOptions === "function" ? config.getOptions("") : config.getOptions?.() || [],
        getOptions: config.dynamic ? config.getOptions : null,
        dynamic: !!config.dynamic,
        minQuery: config.minQuery || 0,
        minHint: config.minHint || "",
        inputmode: config.inputmode || "",
        value: hiddenInput.value || null,
        allowCustom: config.allowCustom,
        onSelect: (opt) => {
          const store = config.storeValue ? config.storeValue(opt) : opt.id;
          hiddenInput.value = store;
          hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
          if (config.onChange) config.onChange(opt);
        },
      });
    });

    sync();
    return { sync };
  }

  return { open, close, bind };
})();
