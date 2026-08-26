/** PreciseSelect — modal buscable (lote / DNI / catálogos) */
window.QB = window.QB || {};

QB.PreciseSelect = (() => {
  let overlay, modal, titleEl, searchEl, listEl, addBtn, addPanel, addDniEl, addNameEl, addSaveBtn, addErrEl;
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
    buildCustomPerson: null,
    title: "",
    placeholder: "Buscar...",
    inputmode: "",
    listColumns: false,
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
        <div class="precise-add-panel" id="precise-add-panel" hidden>
          <p class="precise-add-note">No encontrado — agregar solo en este dispositivo</p>
          <label class="precise-add-field">
            <span>DNI / Código</span>
            <input type="text" id="precise-add-dni" inputmode="numeric" maxlength="8" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" />
          </label>
          <label class="precise-add-field">
            <span>Nombre completo</span>
            <input type="text" id="precise-add-name" autocomplete="off" enterkeyhint="done" />
          </label>
          <p class="precise-add-error" id="precise-add-error" hidden></p>
          <button type="button" class="precise-add-save" id="precise-add-save">Guardar y usar</button>
        </div>
        <button type="button" class="precise-add" id="precise-add" hidden>Agregar uno</button>
      </div>
    `;
    document.body.appendChild(overlay);

    modal = overlay.querySelector(".precise-modal");
    titleEl = overlay.querySelector("#precise-title");
    searchEl = overlay.querySelector("#precise-search");
    listEl = overlay.querySelector("#precise-list");
    addBtn = overlay.querySelector("#precise-add");
    addPanel = overlay.querySelector("#precise-add-panel");
    addDniEl = overlay.querySelector("#precise-add-dni");
    addNameEl = overlay.querySelector("#precise-add-name");
    addSaveBtn = overlay.querySelector("#precise-add-save");
    addErrEl = overlay.querySelector("#precise-add-error");

    overlay.querySelector("#precise-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    searchEl.addEventListener("input", () => {
      filter(searchEl.value);
      updateAddUi();
    });
    addDniEl.addEventListener("input", () => {
      addDniEl.value = String(addDniEl.value || "").replace(/\D/g, "").slice(0, 8);
    });
    addBtn.addEventListener("click", submitCustomText);
    addSaveBtn.addEventListener("click", submitCustomPerson);
    addNameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitCustomPerson();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.open) close();
    });
  }

  function resetAddForm() {
    if (addDniEl) addDniEl.value = "";
    if (addNameEl) addNameEl.value = "";
    if (addErrEl) {
      addErrEl.hidden = true;
      addErrEl.textContent = "";
    }
    if (addPanel) addPanel.hidden = true;
    if (addBtn) addBtn.hidden = true;
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
      if (s) {
        state.emptyHint = state.allowCustom
          ? "Sin resultados — puedes agregar abajo"
          : "Sin resultados";
      } else if (state.minQuery > 0) {
        state.emptyHint =
          state.minHint || `Escribe al menos ${state.minQuery} caracteres`;
      } else {
        state.emptyHint = state.minHint || "Sin datos en el catálogo";
      }
      renderList();
      return;
    }

    state.options = resolveOptions(raw);
    state.filtered = !s
      ? [...state.options]
      : state.options.filter(
          (o) =>
            String(o.label).toLowerCase().includes(s) ||
            String(o.meta || "").toLowerCase().includes(s) ||
            String(o.id).toLowerCase().includes(s)
        );
    state.emptyHint = s
      ? state.allowCustom
        ? "Sin resultados — puedes agregar abajo"
        : "Sin resultados"
      : "Sin resultados";
    renderList();
  }

  function canShowAdd(q) {
    if (!state.allowCustom || !q) return false;
    if (state.filtered.length) return false;
    if (state.minQuery) {
      const digits = q.replace(/\D/g, "");
      const qLen = state.inputmode === "numeric" ? digits.length : q.length;
      if (qLen < state.minQuery) return false;
    }
    return true;
  }

  function updateAddUi() {
    const q = searchEl.value.trim();
    const show = canShowAdd(q);

    if (state.allowCustom === "person") {
      addBtn.hidden = true;
      addPanel.hidden = !show;
      if (show) {
        const digits = q.replace(/\D/g, "").slice(0, 8);
        if (digits && !addDniEl.value) addDniEl.value = digits;
        else if (!digits && q && !addNameEl.value && !/^\d/.test(q)) addNameEl.value = q;
      }
      return;
    }

    if (state.allowCustom === "text") {
      addPanel.hidden = true;
      addBtn.hidden = !show;
      addBtn.textContent = show ? `Agregar “${q}” (local)` : "Agregar uno";
      return;
    }

    addPanel.hidden = true;
    addBtn.hidden = true;
  }

  function submitCustomText() {
    const q = searchEl.value.trim();
    if (!q) return;
    pick({ id: q, label: q, meta: "Local · emergencia", customText: true });
  }

  function submitCustomPerson() {
    const dni = String(addDniEl.value || "").replace(/\D/g, "").slice(0, 8).trim();
    const nombre = String(addNameEl.value || "").trim();
    if (!dni || dni.length !== 8) {
      addErrEl.textContent = "El DNI / código debe tener 8 dígitos.";
      addErrEl.hidden = false;
      addDniEl.focus();
      return;
    }
    if (!nombre || nombre.length < 3) {
      addErrEl.textContent = "Ingresa el nombre completo.";
      addErrEl.hidden = false;
      addNameEl.focus();
      return;
    }
    addErrEl.hidden = true;
    const opt =
      typeof state.buildCustomPerson === "function"
        ? state.buildCustomPerson(dni, nombre)
        : {
            id: `${dni} — ${nombre}`,
            label: nombre,
            meta: "Local · emergencia",
            dni,
            nombre,
            local: true,
          };
    pick({ ...opt, local: true });
  }

  function renderList() {
    listEl.classList.toggle("has-columns", !!state.listColumns);
    if (!state.filtered.length) {
      listEl.innerHTML = `<div class="precise-empty">${escapeHtml(state.emptyHint || "Sin resultados")}</div>`;
      updateAddUi();
      return;
    }
    const head = state.listColumns
      ? `<div class="precise-columns-head" aria-hidden="true">
          <span class="col-name">Nombre</span>
          <span class="col-dni">DNI</span>
        </div>`
      : "";
    listEl.innerHTML =
      head +
      state.filtered
        .map((o) => {
          const sel = state.selected && String(state.selected) === String(o.id);
          if (state.listColumns) {
            const dni = o.dni || String(o.id).replace(/\D.*/, "") || o.id;
            return `<button type="button" class="precise-option precise-row${sel ? " selected" : ""}" data-id="${escapeAttr(o.id)}">
          <span class="opt-title col-name">${escapeHtml(o.label)}</span>
          <span class="opt-dni col-dni">${escapeHtml(String(dni))}</span>
        </button>`;
          }
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
    updateAddUi();
  }

  function pick(opt) {
    state.selected = opt.id;
    if (typeof state.onSelect === "function") state.onSelect(opt);
    close();
  }

  function open(opts) {
    ensureDom();
    resetAddForm();
    state.open = true;
    state.getOptions = opts.getOptions || null;
    state.dynamic = !!opts.dynamic || typeof opts.getOptions === "function";
    state.options = state.dynamic ? [] : opts.options || [];
    state.selected = opts.value ?? null;
    state.allowCustom = opts.allowCustom || false;
    state.buildCustomPerson = opts.buildCustomPerson || null;
    state.onSelect = opts.onSelect || null;
    state.title = opts.title || "Buscar";
    state.placeholder = opts.placeholder || "Buscar...";
    state.minQuery = opts.minQuery || 0;
    state.minHint = opts.minHint || "";
    state.emptyHint = opts.emptyHint || "Sin resultados";
    state.inputmode = opts.inputmode || "";
    state.listColumns = !!opts.listColumns;

    titleEl.textContent = state.title;
    if (modal) modal.classList.toggle("has-columns", state.listColumns);
    searchEl.placeholder = state.placeholder;
    searchEl.value = "";
    if (state.inputmode) searchEl.setAttribute("inputmode", state.inputmode);
    else searchEl.removeAttribute("inputmode");

    if (!state.dynamic) {
      state.options = opts.options || [];
    }
    filter("");
    overlay.classList.add("open");

    // Si el listado sale vacío, reintentar catálogos y refrescar
    if (!state.filtered.length && window.QB?.Data) {
      listEl.innerHTML = `<div class="precise-empty">Cargando listado…</div>`;
      Promise.resolve(QB.Data.ensureCatalogs ? QB.Data.ensureCatalogs() : QB.Data.load()).then(
        () => {
          if (!state.open) return;
          filter(searchEl.value || "");
        }
      );
    }
  }

  let activeTrigger = null;

  function close() {
    state.open = false;
    if (searchEl && document.activeElement === searchEl) searchEl.blur();
    resetAddForm();
    if (overlay) overlay.classList.remove("open");
    if (modal) modal.classList.remove("has-columns");
    if (listEl) listEl.classList.remove("has-columns");
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
        listColumns: config.listColumns,
        buildCustomPerson: config.buildCustomPerson,
        onSelect: (opt) => {
          if (config.customKind) {
            if (opt?.local && opt.dni && opt.nombre) {
              QB.API?.rememberCustomPerson?.(config.customKind, opt.dni, opt.nombre);
            } else if (opt?.customText) {
              QB.API?.rememberCustomValue?.(config.customKind, opt.id || opt.label);
            }
          }
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
