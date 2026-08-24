/** DatePicker — calendario modal “Elegir fecha” */
window.QB = window.QB || {};

QB.DatePicker = (() => {
  const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  const DOW = ["LU", "MA", "MI", "JU", "VI", "SA", "DO"];

  let overlay, monthLabel, gridEl;
  let state = {
    open: false,
    viewYear: 0,
    viewMonth: 0,
    selected: null, // YYYY-MM-DD
    onSelect: null,
  };

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toISO(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  function parseISO(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const [y, m, d] = iso.split("-").map(Number);
    return { y, m: m - 1, d };
  }

  function formatDisplay(iso) {
    const p = parseISO(iso);
    if (!p) return "";
    return `${pad(p.d)}/${pad(p.m + 1)}/${p.y}`;
  }

  function todayISO() {
    const n = new Date();
    return toISO(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "overlay date-overlay";
    overlay.id = "date-overlay";
    overlay.innerHTML = `
      <div class="date-modal" role="dialog" aria-modal="true" aria-label="Elegir fecha">
        <div class="date-modal-head">
          <h3>Elegir fecha</h3>
          <button type="button" class="date-close" id="date-close" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="date-nav">
          <button type="button" class="date-nav-btn" id="date-prev" aria-label="Mes anterior">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div class="date-month" id="date-month">—</div>
          <button type="button" class="date-nav-btn" id="date-next" aria-label="Mes siguiente">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </div>
        <div class="date-dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="date-grid" id="date-grid"></div>
        <div class="date-foot">
          <button type="button" class="date-clear" id="date-clear">Borrar</button>
          <button type="button" class="date-today" id="date-today">Hoy</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    monthLabel = overlay.querySelector("#date-month");
    gridEl = overlay.querySelector("#date-grid");

    overlay.querySelector("#date-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector("#date-prev").addEventListener("click", () => {
      state.viewMonth -= 1;
      if (state.viewMonth < 0) {
        state.viewMonth = 11;
        state.viewYear -= 1;
      }
      renderGrid();
    });
    overlay.querySelector("#date-next").addEventListener("click", () => {
      state.viewMonth += 1;
      if (state.viewMonth > 11) {
        state.viewMonth = 0;
        state.viewYear += 1;
      }
      renderGrid();
    });
    overlay.querySelector("#date-clear").addEventListener("click", () => {
      pick(null);
    });
    overlay.querySelector("#date-today").addEventListener("click", () => {
      const t = todayISO();
      const p = parseISO(t);
      state.viewYear = p.y;
      state.viewMonth = p.m;
      pick(t);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.open) close();
    });
  }

  function renderGrid() {
    monthLabel.textContent = `${MONTHS[state.viewMonth]} ${state.viewYear}`;
    const first = new Date(state.viewYear, state.viewMonth, 1);
    let startDow = first.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // Monday first
    const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    const prevDays = new Date(state.viewYear, state.viewMonth, 0).getDate();
    const today = todayISO();
    const cells = [];

    for (let i = 0; i < 42; i++) {
      let y = state.viewYear;
      let m = state.viewMonth;
      let d;
      let muted = false;

      if (i < startDow) {
        d = prevDays - startDow + i + 1;
        m -= 1;
        if (m < 0) {
          m = 11;
          y -= 1;
        }
        muted = true;
      } else if (i >= startDow + daysInMonth) {
        d = i - startDow - daysInMonth + 1;
        m += 1;
        if (m > 11) {
          m = 0;
          y += 1;
        }
        muted = true;
      } else {
        d = i - startDow + 1;
      }

      const iso = toISO(y, m, d);
      const classes = ["date-cell"];
      if (muted) classes.push("muted");
      if (state.selected === iso) classes.push("selected");
      if (iso === today) classes.push("today");

      cells.push(
        `<button type="button" class="${classes.join(" ")}" data-iso="${iso}" tabindex="-1">${d}</button>`
      );
    }

    gridEl.innerHTML = cells.join("");
    gridEl.querySelectorAll(".date-cell").forEach((btn) => {
      btn.addEventListener("click", () => pick(btn.dataset.iso));
    });
  }

  function pick(iso) {
    state.selected = iso;
    if (typeof state.onSelect === "function") state.onSelect(iso);
    close();
  }

  function open(opts) {
    ensureDom();
    state.open = true;
    state.selected = opts.value || null;
    state.onSelect = opts.onSelect || null;
    const p = parseISO(state.selected) || parseISO(todayISO());
    state.viewYear = p.y;
    state.viewMonth = p.m;
    renderGrid();
    overlay.classList.add("open");
  }

  function close() {
    state.open = false;
    if (overlay) overlay.classList.remove("open");
  }

  function bind(trigger, hiddenInput) {
    const sync = () => {
      const val = hiddenInput.value;
      const span = trigger.querySelector(".value, .placeholder");
      if (!span) return;
      if (val) {
        span.className = "value";
        span.textContent = formatDisplay(val);
      } else {
        span.className = "placeholder";
        span.textContent = "Elegir fecha...";
      }
    };

    trigger.addEventListener("click", () => {
      trigger.classList.add("open");
      open({
        value: hiddenInput.value || todayISO(),
        onSelect: (iso) => {
          hiddenInput.value = iso || "";
          hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
          sync();
          trigger.classList.remove("open");
        },
      });
    });

    sync();
    return { sync, formatDisplay };
  }

  return { open, close, bind, formatDisplay, todayISO };
})();
