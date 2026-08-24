/** Catálogos de campo: lotes, trabajadores (DNI), supervisores (DNI) */
window.QB = window.QB || {};

QB.Data = (() => {
  let ready = false;
  let loading = null;
  let lotes = [];
  let lotesById = {};
  let trabajadores = {};
  let supervisores = {};

  const VARIEDAD_MAP = {
    "SEKOYA POP": "S. Pop",
    "S. POP": "S. Pop",
    "S. Pop": "S. Pop",
    MAGICA: "Mágica",
    MÁGICA: "Mágica",
    Mágica: "Mágica",
  };

  async function load() {
    if (ready) return true;
    if (loading) return loading;
    loading = Promise.all([
      fetch("./data/lotes-licapa.json").then((r) => r.json()),
      fetch("./data/trabajadores.json").then((r) => r.json()),
      fetch("./data/supervisores-cosecha.json").then((r) => r.json()),
    ])
      .then(([lotesJson, trabJson, supJson]) => {
        lotes = Array.isArray(lotesJson) ? lotesJson : [];
        lotesById = {};
        lotes.forEach((l) => {
          lotesById[String(l.lote)] = l;
          if (l.codLote) lotesById[String(l.codLote)] = l;
        });
        trabajadores = trabJson?.byDni || {};
        supervisores = supJson?.byDni || {};
        ready = true;
        loading = null;
        return true;
      })
      .catch(() => {
        loading = null;
        return false;
      });
    return loading;
  }

  function mapVariedad(raw) {
    if (!raw) return "";
    return VARIEDAD_MAP[String(raw).trim()] || String(raw).trim();
  }

  /**
   * Solo primer apellido + primer nombre.
   * "AGUIRRE NORIEGA MARCO ANTONIO" → "AGUIRRE MARCO"
   */
  function shortName(nombre) {
    const parts = String(nombre || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length <= 1) return parts[0] || "";
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
    // APELLIDO1 APELLIDO2 NOMBRE1 [NOMBRE2...]
    return `${parts[0]} ${parts[2]}`;
  }

  function personLabel(dni, nombre) {
    const short = shortName(nombre) || String(nombre || "").trim() || dni;
    return dni ? `${dni} — ${short}` : short;
  }

  function loteOptions(query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    const list = lotes.map((l) => ({
      id: String(l.lote),
      label: `Lote ${l.lote}`,
      meta: `${l.modulo} · Turno ${l.turno} · ${l.variedad}`,
      raw: l,
    }));
    if (!q) return list;
    return list.filter(
      (o) =>
        o.id.includes(q) ||
        o.label.toLowerCase().includes(q) ||
        String(o.raw.codLote || "")
          .toLowerCase()
          .includes(q) ||
        o.meta.toLowerCase().includes(q)
    );
  }

  function findLote(id) {
    const raw = String(id ?? "").trim();
    if (!raw) return null;
    if (lotesById[raw]) return lotesById[raw];
    const digits = raw.replace(/^lote\s*/i, "").replace(/^q/i, "").trim();
    if (digits && lotesById[digits]) return lotesById[digits];
    if (digits && lotesById[`Q${digits}`]) return lotesById[`Q${digits}`];
    return (
      lotes.find(
        (l) =>
          String(l.lote) === raw ||
          String(l.lote) === digits ||
          String(l.codLote || "") === raw ||
          String(l.codLote || "") === `Q${digits}`
      ) || null
    );
  }

  /** Módulo + turno siempre desde catálogo de lotes */
  function loteMeta(loteId) {
    const L = findLote(loteId);
    if (!L) return { modulo: "", turno: "", lote: String(loteId || "") };
    return {
      lote: String(L.lote),
      modulo: L.modulo || "",
      turno: L.turno != null && L.turno !== "" ? String(L.turno) : "",
      variedad: L.variedad || "",
      raw: L,
    };
  }

  function searchDni(map, query, limit = 40) {
    const digits = String(query || "").replace(/\D/g, "");
    if (digits.length < 3) return [];
    const out = [];
    for (const dni of Object.keys(map)) {
      if (!dni.includes(digits)) continue;
      const p = map[dni];
      const full = (p.nombre || "").trim();
      out.push({
        id: dni,
        label: full || dni,
        meta: `DNI ${dni}${p.cargo ? ` · ${p.cargo}` : ""}`,
        nombre: full,
        nombreCorto: shortName(full),
        cargo: p.cargo || "",
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  function personOptions(map, query, opts = {}) {
    const metaLabel = opts.metaLabel || "";
    const minList = opts.minList || 12;
    const limit = opts.limit || 40;
    const q = String(query || "").trim().toLowerCase();
    const digits = String(query || "").replace(/\D/g, "");
    const out = [];

    const push = (dni, p) => {
      const full = (p.nombre || "").trim();
      out.push({
        id: dni,
        label: full || dni,
        meta: metaLabel
          ? `${metaLabel} · DNI ${dni}`
          : `DNI ${dni}${p.cargo ? ` · ${p.cargo}` : ""}`,
        nombre: full,
        nombreCorto: shortName(full),
        cargo: p.cargo || "",
      });
    };

    // Sin búsqueda: listado mínimo para que el select se vea lleno
    if (!q) {
      for (const dni of Object.keys(map)) {
        push(dni, map[dni]);
        if (out.length >= minList) break;
      }
      return out;
    }

    for (const dni of Object.keys(map)) {
      const p = map[dni];
      const nombre = (p.nombre || "").toLowerCase();
      const byDni = digits.length >= 2 && dni.includes(digits);
      const byName = q.length >= 2 && nombre.includes(q);
      if (byDni || byName) {
        push(dni, p);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  function searchTrabajadores(q) {
    return personOptions(trabajadores, q, { metaLabel: "Cosecha", minList: 12 });
  }

  function searchSupervisores(q) {
    return personOptions(supervisores, q, { metaLabel: "Supervisor", minList: 12 });
  }

  function mapToOpts(map, limit, metaLabel) {
    const out = [];
    for (const dni of Object.keys(map)) {
      const p = map[dni];
      const full = (p.nombre || "").trim();
      out.push({
        id: personLabel(dni, full),
        label: full || dni,
        meta: metaLabel ? `${metaLabel} · DNI ${dni}` : `DNI ${dni}`,
        nombre: full,
        nombreCorto: shortName(full),
        dni,
      });
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Cualquiera puede evaluar: lista inicial (≥10) + búsqueda por nombre/DNI + Agregar */
  function evaluadorOptions(query, recent = []) {
    const q = String(query || "").trim().toLowerCase();
    const digits = String(query || "").replace(/\D/g, "");
    const seen = new Set();
    const out = [];

    const push = (o) => {
      const key = String(o.id).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(o);
    };

    (recent || []).forEach((n) => {
      if (!n) return;
      push({ id: n, label: formatStoredPerson(n), meta: "Reciente" });
    });

    if (!q) {
      mapToOpts(supervisores, 12, "Supervisor").forEach(push);
      if (out.length < 12) mapToOpts(trabajadores, 12 - out.length, "Campo").forEach(push);
      return out.slice(0, Math.max(12, out.length));
    }

    const scan = (map, metaLabel) => {
      for (const dni of Object.keys(map)) {
        const p = map[dni];
        const nombre = (p.nombre || "").toLowerCase();
        const short = shortName(p.nombre);
        if (
          nombre.includes(q) ||
          short.toLowerCase().includes(q) ||
          (digits.length >= 2 && dni.includes(digits))
        ) {
          push({
            id: personLabel(dni, p.nombre),
            label: (p.nombre || "").trim() || dni,
            meta: `${metaLabel} · DNI ${dni}`,
            nombre: p.nombre || "",
            nombreCorto: short,
            dni,
          });
        }
        if (out.length >= 40) break;
      }
    };
    scan(supervisores, "Supervisor");
    if (out.length < 40) scan(trabajadores, "Campo");
    return out;
  }

  /** "18851808 — AGUIRRE NORIEGA MARCO ANTONIO" → "18851808 — AGUIRRE MARCO" */
  function formatStoredPerson(val) {
    if (!val) return "";
    const m = String(val).match(/^(\d+)\s*[—\-]\s*(.+)$/);
    if (m) return personLabel(m[1], m[2]);
    return shortName(val) || String(val).trim();
  }

  function personByDni(kind, dni) {
    const map = kind === "supervisor" ? supervisores : trabajadores;
    return map[String(dni)] || null;
  }

  function isReady() {
    return ready;
  }

  return {
    load,
    isReady,
    loteOptions,
    findLote,
    loteMeta,
    mapVariedad,
    shortName,
    personLabel,
    formatStoredPerson,
    searchTrabajadores,
    searchSupervisores,
    evaluadorOptions,
    personByDni,
  };
})();
