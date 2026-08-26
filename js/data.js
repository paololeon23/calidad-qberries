/** Catálogos de campo: lotes, trabajadores (DNI), supervisores (DNI) */
window.QB = window.QB || {};

QB.Data = (() => {
  let ready = false;
  let loading = null;
  let lotes = [];
  let lotesById = {};
  let trabajadores = {};
  let supervisores = {};
  /** Catálogo fijo embebido — siempre disponible (no depende de fetch) */
  let evaluadores = {
    "18078464": { nombre: "LOYOLA DOMINGUEZ OSWALDO ELMER" },
    "40354659": { nombre: "REYES JAVE LOURDES LIZETH" },
    "44262821": { nombre: "CHAVEZ CABRERA MARIBEL VICENTA" },
    "45123552": { nombre: "LINARES CERNA OSCAR PAUL" },
    "45305359": { nombre: "URTEAGA SHIMIZU YEHAN EVELYN" },
    "45608103": { nombre: "GAVIDIA RAMIREZ LUIGI ANDERSON" },
    "46819781": { nombre: "PEREZ LEON SALLY ELIZABETH" },
    "47188311": { nombre: "PEREIRA VASQUEZ LUCELIA LEONORA" },
    "47407697": { nombre: "ROLDAN PEREZ JULIO ANTONIO" },
    "48962428": { nombre: "CALVANAPON LOPEZ CARLOS MAGNO" },
    "60036529": { nombre: "CHUAN MIRANDA DANIELA MILAGRITOS" },
    "60293807": { nombre: "QUIROZ MEDINA QUELUBIA" },
    "60412486": { nombre: "LEON CARRANZA YHULEISY ALEXANDRA" },
    "60412552": { nombre: "TAMARIZ LOPEZ VICTOR JANPIER" },
    "60412805": { nombre: "DIAZ SOTO SANDRA GRABIELA" },
    "60461272": { nombre: "NOE LEZAMA DANNER JANO" },
    "60461291": { nombre: "PAISIG ALFARO WILMER MANUEL" },
    "60461308": { nombre: "ALCANTARA VIGO DANIEL ELIAS" },
    "60532091": { nombre: "CARRANZA MAMANI LUIS ANDERSON" },
    "60554649": { nombre: "CARRANZA DIAZ ARIANA JESUSANITA" },
    "60600072": { nombre: "VIGO PAREDES GABRIELA ANAIS" },
    "60633034": { nombre: "SANGAY CABANILLAS RICARDO FRANCO" },
    "60740851": { nombre: "HORNA JUAREZ ROSALINA NOEMI" },
    "61256413": { nombre: "SALDANA POEMAPE JULEISY ALEXANDRA" },
    "61256447": { nombre: "RUMAY DIAZ LAZARO RENE" },
    "61669930": { nombre: "SEGURA NEYRA YENNY LISET" },
    "62162097": { nombre: "LLANOS SANCHEZ DAYANA NICOLE" },
    "62585049": { nombre: "RODRIGUEZ DAGA ERICKA ELIZABETH" },
    "62749305": { nombre: "ARANDA SOLIS VALERIA YAMILET" },
    "62894779": { nombre: "VILLALOBOS CARRANZA YURICO NATALY" },
    "70134863": { nombre: "RIMACHE RAVINES GERSON ELIEZER" },
    "70142292": { nombre: "YRRIBARREN MERCEDES PEDRO JESUS" },
    "70550707": { nombre: "REYES SANGAY JUAN SAMUEL" },
    "70650830": { nombre: "LIMA PALOMINO MAURICIO RENATO" },
    "70658198": { nombre: "FLORES MARINOS ELIZA GIANELLA" },
    "70667311": { nombre: "ALCANTARA VIGO BELCY GABRIELITA" },
    "70735997": { nombre: "DIAZ SOTO MARIA FERNANDA" },
    "71149417": { nombre: "CABRERA PEREZ CARLOS SAUL" },
    "71327899": { nombre: "MURGA CASTILLO KEVIN WILLIAMS" },
    "71327907": { nombre: "HUACCHA TERRONES FRANCO EMANUEL" },
    "71367059": { nombre: "MELON VILLANUEVA KARINA ELIZABETH" },
    "71509838": { nombre: "CANO OLIVARES FATIMA DANIELA" },
    "72743323": { nombre: "VILLANUEVA CAYPO ELIZABETH NOEMI" },
    "72795195": { nombre: "QUISPE ZERPA MARIA ELENA" },
    "72799496": { nombre: "VASQUEZ CARDENAS CRISTIAN OLIVER" },
    "72967660": { nombre: "LLANOS SANCHEZ NAYELI DE LOS ANGELES" },
    "74292255": { nombre: "ESTACIO HUAMAN CLAUDIA LUCIA" },
    "74662085": { nombre: "OLGUIN OVALLE BRAYAN GIOVANI" },
    "74969230": { nombre: "MONTALVO PEREZ SAIDY PATRICIA" },
    "75023790": { nombre: "BUENO VELEZMORO DEYSI ELIZABETH" },
    "75023887": { nombre: "SIPIRAN BAUTISTA OSCAR RUBEN" },
    "75078526": { nombre: "LOZADA PAJARES JOSE JULIAN" },
    "75138175": { nombre: "RUGEL AVILA CYNTHIA ELIZABETH" },
    "75278098": { nombre: "MACHUCA ALVAREZ LUIGUI JANPIER" },
    "75501379": { nombre: "SALVADOR FLOREANO LUZ DEL ROCIO" },
    "75901806": { nombre: "PLASENCIA GASTOPE ESMERALDA ALEXANDRA" },
    "76173220": { nombre: "GUTIERREZ VALQUI ETHEL YAMELI" },
    "76313065": { nombre: "RODRIGUEZ AGUILAR ARIANA MILAGROS" },
    "76371313": { nombre: "CORTEZ PAJARES PERLA MABEL" },
    "76418254": { nombre: "BALERIO CARRANZA ERICK IVAN" },
    "76977945": { nombre: "CASTRO SANCHEZ MARIA VALENTINA" },
    "77418497": { nombre: "DIAZ SOTO ROXANA" },
    "77679860": { nombre: "COTRINA ABANTO ESMELA LIZBETH" },
    "77799828": { nombre: "ZAVALETA IGLESIAS KAHORY MARIANELA" },
  };

  /** Semilla embebida (supervisores / preview cosecha) si falla fetch */
  function applySeed_() {
    const seed = (window.QB && window.QB.SEED) || {};
    if (seed.evaluadores) {
      for (const dni of Object.keys(seed.evaluadores)) {
        if (!evaluadores[dni]) evaluadores[dni] = seed.evaluadores[dni];
      }
    }
    if (seed.supervisores && Object.keys(supervisores).length === 0) {
      supervisores = Object.assign({}, seed.supervisores);
    }
    if (seed.trabajadoresPreview && Object.keys(trabajadores).length === 0) {
      trabajadores = Object.assign({}, seed.trabajadoresPreview);
    }
  }
  applySeed_();

  function dataUrl_(rel) {
    try {
      return new URL(rel, document.baseURI || location.href).href;
    } catch {
      return rel;
    }
  }

  const VARIEDAD_MAP = {
    "SEKOYA POP": "S. Pop",
    "S. POP": "S. Pop",
    "S. Pop": "S. Pop",
    "Sekoya Pop": "S. Pop",
    MAGICA: "M\u00e1gica",
    "MAGICA": "M\u00e1gica",
    "M\u00c1GICA": "M\u00e1gica",
    "M\u00e1gica": "M\u00e1gica",
    Magica: "M\u00e1gica",
  };

  function etapaKind(etapa) {
    const e = String(etapa || "")
      .trim()
      .toUpperCase();
    if (e.includes("II")) return "II";
    if (e.includes("I") || e.includes("LICAPA")) return "I";
    return "";
  }

  /** Un lote por número: si hay I+II → etiqueta Licapa I/II y datos de Licapa I */
  function buildLoteCatalog(raw) {
    const all = Array.isArray(raw) ? raw : [];
    const groups = new Map();
    all.forEach((l) => {
      const n = String(l.lote ?? "").trim();
      if (!n) return;
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(l);
    });

    lotesById = {};
    lotes = [];

    all.forEach((l) => {
      const cod = String(l.codLote || "").trim();
      if (cod) lotesById[cod] = l;
    });

    groups.forEach((group, num) => {
      const licapaI = group.find((l) => etapaKind(l.etapa) === "I");
      const licapaII = group.find((l) => etapaKind(l.etapa) === "II");
      let pick;
      let etapaLabel;
      if (licapaI && licapaII) {
        pick = licapaI;
        etapaLabel = "Licapa I/II";
      } else if (licapaI) {
        pick = licapaI;
        etapaLabel = "Licapa I";
      } else if (licapaII) {
        pick = licapaII;
        etapaLabel = "Licapa II";
      } else {
        pick = group[0];
        etapaLabel = String(pick.etapa || "").trim();
      }
      const entry = { ...pick, lote: num, etapa: etapaLabel };
      lotes.push(entry);
      lotesById[num] = entry;
      lotesById[`Q${num}`] = entry;
      if (pick.codLote) lotesById[String(pick.codLote)] = entry;
      group.forEach((l) => {
        const cod = String(l.codLote || "").trim();
        if (cod) lotesById[cod] = entry;
      });
    });

    lotes.sort((a, b) => {
      const na = Number(a.lote) || 0;
      const nb = Number(b.lote) || 0;
      return na !== nb ? na - nb : String(a.etapa).localeCompare(String(b.etapa));
    });
  }

  async function load() {
    if (ready) return true;
    if (loading) return loading;

    applySeed_();

    const fetchJson = (url, fallback) =>
      fetch(dataUrl_(url), { cache: "no-cache" })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .catch(() => fallback);

    loading = Promise.all([
      fetchJson("./data/lotes-licapa.json", []),
      fetchJson("./data/trabajadores.json", null),
      fetchJson("./data/supervisores-cosecha.json", null),
      fetchJson("./data/evaluadores.json", null),
    ])
      .then(([lotesJson, trabJson, supJson, evalJson]) => {
        buildLoteCatalog(lotesJson);
        // Solo reemplazar si el fetch trajo datos reales
        if (trabJson?.byDni && Object.keys(trabJson.byDni).length) {
          trabajadores = trabJson.byDni;
        }
        if (supJson?.byDni && Object.keys(supJson.byDni).length) {
          supervisores = { ...supervisores, ...supJson.byDni };
        }
        if (evalJson?.byDni && Object.keys(evalJson.byDni).length) {
          // Fusionar, no reemplazar (nunca dejar vacío el catálogo embebido)
          evaluadores = Object.assign({}, evaluadores, evalJson.byDni);
        }
        // Si el fetch falló, conservar la semilla embebida
        applySeed_();
        ready = true;
        loading = null;
        return (
          Object.keys(evaluadores).length > 0 ||
          Object.keys(trabajadores).length > 0 ||
          lotes.length > 0
        );
      })
      .catch(() => {
        applySeed_();
        ready = true;
        loading = null;
        return Object.keys(evaluadores).length > 0;
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

  function loteLabel(l) {
    if (!l) return "";
    const etapa = String(l.etapa || "").trim();
    const n = String(l.lote ?? "").trim();
    return etapa ? `Lote ${n} - ${etapa}` : `Lote ${n}`;
  }

  function loteShortLabel(l) {
    if (!l) return "";
    const n = String(l.lote ?? "").trim();
    return n ? `Lote ${n}` : "";
  }

  function loteOptions(query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    const list = lotes.map((l) => ({
      id: String(l.codLote || l.lote),
      label: loteLabel(l),
      meta: `${l.modulo || "—"} · Turno ${l.turno ?? "—"}`,
      raw: l,
    }));
    if (!q) {
      // Previsualización: primeros lotes (el resto se busca)
      return list.slice(0, 80);
    }
    return list
      .filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q) ||
          String(o.raw.lote || "")
            .toLowerCase()
            .includes(q) ||
          String(o.raw.etapa || "")
            .toLowerCase()
            .includes(q) ||
          String(o.raw.modulo || "")
            .toLowerCase()
            .includes(q) ||
          o.meta.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }

  function findLote(id) {
    const raw = String(id ?? "").trim();
    if (!raw) return null;
    if (lotesById[raw]) return lotesById[raw];
    // "Lote 6 - Licapa I" o "6"
    const fromLabel = raw.match(/^lote\s*([^\s-]+)/i);
    const digits = raw.replace(/^lote\s*/i, "").replace(/^q/i, "").split(/\s*-\s*/)[0].trim();
    const loteNum = fromLabel ? fromLabel[1] : digits;
    if (loteNum && lotesById[loteNum]) return lotesById[loteNum];
    return (
      lotes.find(
        (l) =>
          String(l.codLote || "") === raw ||
          String(l.lote) === raw ||
          String(l.lote) === loteNum ||
          loteLabel(l).toLowerCase() === raw.toLowerCase()
      ) || null
    );
  }

  /** Módulo + turno (+ etapa) siempre desde catálogo de lotes */
  function loteMeta(loteId) {
    const L = findLote(loteId);
    if (!L) return { modulo: "", turno: "", lote: String(loteId || ""), etapa: "" };
    return {
      lote: String(L.lote),
      modulo: L.modulo || "",
      turno: L.turno != null && L.turno !== "" ? String(L.turno) : "",
      etapa: L.etapa || "",
      variedad: L.variedad || "",
      codLote: L.codLote || "",
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
    const minList = opts.minList || 40;
    const limit = opts.limit || 60;
    const q = String(query || "").trim().toLowerCase();
    const digits = String(query || "").replace(/\D/g, "");
    const out = [];

    const push = (dni, p) => {
      const full = (p.nombre || "").trim();
      out.push({
        id: dni,
        label: full || dni,
        meta: metaLabel
          ? `${metaLabel} · DNI - ${dni}`
          : `DNI - ${dni}`,
        nombre: full,
        nombreCorto: shortName(full),
        cargo: p.cargo || "",
        dni: String(dni),
      });
    };

    const dnis = Object.keys(map || {});

    // Sin búsqueda: listado de previsualización (ordenado por nombre)
    if (!q) {
      const preview = dnis
        .map((dni) => ({ dni, p: map[dni], nom: (map[dni]?.nombre || "").trim() }))
        .sort((a, b) => a.nom.localeCompare(b.nom, "es") || a.dni.localeCompare(b.dni));
      for (const row of preview) {
        push(row.dni, row.p);
        if (out.length >= minList) break;
      }
      return out;
    }

    for (const dni of dnis) {
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
    return personOptions(trabajadores, q, {
      minList: 50,
      limit: 80,
    });
  }

  function searchSupervisores(q) {
    return personOptions(supervisores, q, {
      minList: 40,
      limit: 60,
    });
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

  /** Lista fija de evaluadores (código + nombre). Solo catálogo oficial. */
  function evaluadorOptions(query) {
    applySeed_();
    const q = String(query || "").trim().toLowerCase();
    const digits = String(query || "").replace(/\D/g, "");
    const out = [];
    const map = evaluadores || {};

    const dnis = Object.keys(map).sort(function (a, b) {
      const na = ((map[a] && map[a].nombre) || "").localeCompare((map[b] && map[b].nombre) || "", "es");
      return na || a.localeCompare(b);
    });
    for (let i = 0; i < dnis.length; i++) {
      const dni = dnis[i];
      const p = map[dni] || {};
      const full = String(p.nombre || "").trim();
      if (!full || full === dni) continue;
      const nombre = full.toLowerCase();
      const short = shortName(full).toLowerCase();
      if (
        q &&
        nombre.indexOf(q) === -1 &&
        short.indexOf(q) === -1 &&
        !(digits.length >= 2 && dni.indexOf(digits) !== -1)
      ) {
        continue;
      }
      out.push({
        id: personLabel(dni, full),
        label: full || dni,
        meta: "DNI - " + dni,
        nombre: full,
        nombreCorto: shortName(full),
        dni: String(dni),
      });
    }
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
    if (kind === "evaluador") return evaluadores[String(dni)] || null;
    const map = kind === "supervisor" ? supervisores : trabajadores;
    return map[String(dni)] || null;
  }

  function isReady() {
    return ready;
  }

  /** Reintenta cargar catálogos si quedaron vacíos */
  async function ensureEvaluadores() {
    applySeed_();
    if (Object.keys(evaluadores).length > 0) return true;
    ready = false;
    loading = null;
    const ok = await load();
    return ok && Object.keys(evaluadores).length > 0;
  }

  async function ensureCatalogs() {
    applySeed_();
    if (
      Object.keys(evaluadores).length > 0 ||
      Object.keys(trabajadores).length > 0 ||
      Object.keys(supervisores).length > 0
    ) {
      return true;
    }
    ready = false;
    loading = null;
    return load();
  }

  return {
    load,
    isReady,
    ensureEvaluadores,
    ensureCatalogs,
    loteOptions,
    findLote,
    loteMeta,
    loteLabel,
    loteShortLabel,
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
