/**
 * Cálculos automáticos (estilo Excel).
 * Fórmula base de %:  (conteo ÷ tamaño_muestra) × 100
 * Igual que: % COL = CANT_COL / TOTAL × 100
 */
window.QB = window.QB || {};

QB.Scoring = (() => {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  /** % = (parte / total) × 100 — misma lógica que columnas % del Sheet */
  function pct(count, sample) {
    const s = Number(sample) || 0;
    const c = Number(count) || 0;
    if (s <= 0) return 0;
    return round2((c / s) * 100);
  }

  function formulaPct(count, sample) {
    const c = Number(count) || 0;
    const s = Number(sample) || 0;
    const p = pct(c, s);
    if (s <= 0) return { text: "Sin muestra", detail: "Falta tamaño de muestra" };
    return {
      text: `${p.toFixed(2)}%`,
      detail: `${c} ÷ ${s} × 100 = ${p.toFixed(2)}%`,
      expr: `(${c}/${s})*100`,
    };
  }

  function inBand_(v, band) {
    if (!band) return false;
    const [min, max] = band;
    return v >= min && v <= max;
  }

  function resolveThreshold_(key) {
    const t = QB.THRESHOLDS[key] || QB.THRESHOLDS.default_cal;
    return t;
  }

  /** Calificación por bandas oficiales (% o conteo según threshold) */
  function rate(value, key) {
    const t = resolveThreshold_(key);
    const v = Number(value) || 0;

    // Conteo por bayas / promedio planta (legacy buenoMax/regularMax)
    if (t.byCount) {
      if (v <= 0) return "Excelente";
      if (v <= t.buenoMax) return "Bueno";
      if (v <= t.regularMax) return "Regular";
      return "Malo";
    }

    if (t.invert) {
      if (v >= t.buenoMax) return "Excelente";
      if (v >= t.regularMax) return "Bueno";
      if (v >= t.regularMax * 0.85) return "Regular";
      return "Malo";
    }

    if (v <= 0) return "Excelente";

    const [bMin, bMax] = t.bueno || [0, 0];
    const [rMin, rMax] = t.regular || [999, 999];
    const [mMin, mMax] = t.malo || [999, 999];

    // Solape en límite (ej. suma cal 12): prioriza Bueno
    if (t.overlapBuenoWins && inBand_(v, t.regular) && inBand_(v, t.bueno)) {
      return "Bueno";
    }

    // Solape en límite (ej. blando en 2): prioriza peor (Malo)
    if (t.overlapWorst && inBand_(v, t.regular) && inBand_(v, t.malo)) {
      return "Malo";
    }

    if (inBand_(v, t.malo)) return "Malo";
    if (inBand_(v, t.regular)) return "Regular";
    if (inBand_(v, t.bueno)) return "Bueno";

    // Entre bueno y regular (ej. desgarro 2.33%): Bueno
    if (t.gapAsBueno && v > bMax && v < rMin) return "Bueno";

    // Entre regular y malo (ej. picadura 1.5%, desgarro 5.5%)
    if (v > rMax && v < mMin) return "Regular";

    // > 0 pero por debajo del mínimo bueno (solo bueno desde 1)
    if (v > 0 && v < bMin) return "Bueno";

    return "Malo";
  }

  function bandLabel_(band) {
    if (!band) return "—";
    const [min, max] = band;
    return min === max ? String(min) : `${min} a ${max}`;
  }

  function rateWhy(value, key) {
    const t = resolveThreshold_(key);
    const v = Number(value) || 0;
    const cal = rate(v, key);

    if (t.byCount) {
      return `${cal}: 0 Excelente · ≤${t.buenoMax} Bueno · ≤${t.regularMax} Regular · >${t.regularMax} Malo`;
    }
    if (t.invert) {
      return `${cal}: ≥${t.buenoMax}% Excelente · ≥${t.regularMax}% Bueno`;
    }
    return `${cal}: 0 Excelente · ${bandLabel_(t.bueno)}% Bueno · ${bandLabel_(t.regular)}% Regular · ${bandLabel_(t.malo)}% Malo`;
  }

  function pillClass(cal) {
    const m = {
      Excelente: "excelente",
      Bueno: "bueno",
      Regular: "regular",
      Malo: "malo",
      Pobre: "malo",
    };
    return m[cal] || "na";
  }

  function pointsFromRate(cal) {
    return { Excelente: 20, Bueno: 16, Regular: 10, Malo: 4, Pobre: 4 }[cal] ?? 0;
  }

  const GRADE_RANK = { Excelente: 4, Bueno: 3, Regular: 2, Malo: 1, Pobre: 1 };

  function worstGrade(...grades) {
    let worst = "Excelente";
    for (const g of grades) {
      if (!g || !GRADE_RANK[g]) continue;
      if (GRADE_RANK[g] < GRADE_RANK[worst]) worst = g;
    }
    return worst;
  }

  /** % mostrado + calificación (fruta buena en descarte = por bayas/conteo) */
  function defectRating(count, sample, def) {
    const countPct = pct(count, sample);
    if (def.noRate) {
      return {
        countPct,
        ratePct: countPct,
        cal: null,
        why: "",
        byCount: !!def.rateByCount,
      };
    }
    const rateKey = def.thresholdKey || def.id;
    if (def.rateByCount) {
      const cal = rate(count, rateKey);
      return {
        countPct,
        ratePct: count,
        cal,
        why: rateWhy(count, rateKey),
        byCount: true,
      };
    }
    const ratePct = def.invert ? round2(Math.max(0, 100 - countPct)) : countPct;
    const key = def.invert ? def.thresholdKey || "default" : rateKey;
    const cal = rate(ratePct, key);
    return {
      countPct,
      ratePct,
      cal,
      why: rateWhy(ratePct, key),
      byCount: false,
    };
  }

  /** Nota 0–20 según % total de defectos */
  function notaFromTotalDefect(totalPct) {
    const t = Number(totalPct) || 0;
    if (t <= 2) return 20;
    if (t <= 4) return 18;
    if (t <= 6) return 16;
    if (t <= 8) return 14;
    if (t <= 10) return 12;
    if (t <= 14) return 10;
    if (t <= 18) return 8;
    if (t <= 25) return 6;
    return 4;
  }

  function notaWhy(totalPct, nota) {
    return `Nota ${nota}: según % tot. defectos (${round2(totalPct)}%). Escala: ≤2→20 · ≤4→18 · ≤6→16 · ≤8→14 · ≤10→12 · ≤14→10 · ≤18→8 · ≤25→6 · >25→4`;
  }

  function gradeLabel(nota) {
    if (nota >= 18) return "Excelente";
    if (nota >= 14) return "Bueno";
    if (nota >= 10) return "Regular";
    return "Malo";
  }

  function scoreDefectForm(type, data) {
    const defs = QB.DEFECTS[type] || [];
    const sample = Number(data.tamano_muestra) || 0;
    const rows = [];
    let sumaCal = 0;
    let sumaCon = 0;
    let sumaOk = 0;
    let ptsSum = 0;
    let ptsCount = 0;

    for (const d of defs) {
      const count = Number(data[d.id]) || 0;
      const f = formulaPct(count, sample);
      const dr = defectRating(count, sample, d);
      const p = dr.countPct;
      const cal = dr.cal;
      const pts = cal ? pointsFromRate(cal) : 0;
      const itemLabel = d.rateByCount
        ? d.label
        : d.invert
          ? `% ${d.label}`
          : `${d.grupo}-% ${d.label}`;

      rows.push({
        id: d.id,
        item: itemLabel,
        count,
        pct: d.rateByCount ? count : p,
        calc: d.rateByCount ? String(count) : f.text,
        formula: d.rateByCount
          ? `${count} bayas${dr.why ? ` · ${dr.why}` : ""}`
          : d.invert
            ? `${p.toFixed(2)}% buena · ${dr.ratePct.toFixed(2)}% no buena`
            : f.detail,
        calificacion: cal,
        why: dr.why,
        puntos: pts,
        grupo: d.grupo,
        invert: !!d.invert,
      });

      if (d.invert) sumaOk += p;
      else if (d.rateByCount) {
        /* conteo por bayas (fruta buena / pedicelo): no suma a % defectos */
      } else if (d.grupo === "CAL") sumaCal += p;
      else if (d.grupo === "CON") sumaCon += p;

      if (cal) {
        ptsSum += pts;
        ptsCount += 1;
      }
    }

    const sumaDefCal = round2(sumaCal);
    const sumaDefCon = round2(sumaCon);
    const sumaDefectos = round2(sumaCal + sumaCon);
    const pctCalidad = round2(Math.max(0, 100 - sumaDefectos));
    const ptsPromedio = ptsCount ? round2(ptsSum / ptsCount) : 0;
    const calSumaCal = rate(sumaDefCal, "suma_cal");
    const calSumaCon = rate(sumaDefCon, "suma_con");
    const calidadGlobal = worstGrade(calSumaCal, calSumaCon);
    const nota = pointsFromRate(calidadGlobal);
    // Sumas se calculan para Sheet / nota, pero NO se muestran en el resumen
    // (evitar que condicionen la captura en campo).

    return {
      sample,
      rows,
      sumaDefCal,
      sumaDefCon,
      sumaDefectos,
      pctCalidad,
      ptsPromedio,
      ptsTot: round2(ptsSum),
      nota,
      calidadGlobal,
      sumaOk: round2(sumaOk),
      explain: {
        base: `% = (conteo ÷ tamaño muestra) × 100`,
        muestra: `Tamaño de muestra = ${sample}`,
        tot: `% Tot. defectos = ${sumaDefCal.toFixed(2)} + ${sumaDefCon.toFixed(2)} = ${sumaDefectos.toFixed(2)}%`,
        calidad: `% Calidad = máx(0, 100 − ${sumaDefectos.toFixed(2)}) = ${pctCalidad.toFixed(2)}%`,
        nota: `Nota ${nota} (${calidadGlobal}): suma cal. ${calSumaCal} · suma con. ${calSumaCon}`,
        tip: "Si un fruto tiene varios defectos, la suma de % puede pasar de 100%.",
      },
    };
  }

  function scoreCaida(data) {
    const plantas = Number(data.plantas_evaluadas) || 0;
    const frutos = Number(data.frutos_caidos) || 0;
    const frutosVerdes = Number(data.frutos_caidos_verdes) || 0;
    const frutosTot = frutos + frutosVerdes;
    const promedio = plantas > 0 ? round2(frutosTot / plantas) : 0;
    const cal = rate(promedio, "promedio_caida");
    const pts = pointsFromRate(cal);
    const nota = pointsFromRate(cal);

    return {
      plantas,
      frutos,
      frutosVerdes,
      frutosTot,
      promedio,
      rows: [
        {
          id: "plantas",
          item: "Plantas evaluadas",
          count: plantas,
          pct: null,
          calc: String(plantas),
          formula: "Dato ingresado",
          calificacion: null,
          puntos: null,
        },
        {
          id: "frutos",
          item: "Cantidad de frutos caidos",
          count: frutos,
          pct: null,
          calc: String(frutos),
          formula: "Dato ingresado",
          calificacion: null,
          puntos: null,
        },
        {
          id: "frutos_verdes",
          item: "Cantidad de frutos caidos verdes",
          count: frutosVerdes,
          pct: null,
          calc: String(frutosVerdes),
          formula: "Dato ingresado",
          calificacion: null,
          puntos: null,
        },
        {
          id: "promedio",
          item: "Promedio frutos/planta",
          count: null,
          pct: promedio,
          calc: promedio.toFixed(2),
          formula:
            plantas > 0
              ? `(${frutos} + ${frutosVerdes}) ÷ ${plantas} = ${promedio.toFixed(2)}`
              : "Sin plantas",
          calificacion: cal,
          why: rateWhy(promedio, "promedio_caida"),
          puntos: pts,
        },
      ],
      nota,
      calidadGlobal: cal,
      ptsTot: pts,
      pctCalidad: null,
      sumaDefectos: promedio,
      explain: {
        base: `Promedio = (frutos caídos + frutos caídos verdes) ÷ plantas`,
        muestra: `Plantas = ${plantas} · Caídos = ${frutos} · Verdes = ${frutosVerdes}`,
        tot: `Promedio = ${promedio.toFixed(2)}`,
        calidad: null,
        nota: `Nota ${nota} (${cal}): ${rateWhy(promedio, "promedio_caida")}`,
        tip: "Menor promedio = mejor calificación.",
      },
    };
  }

  function scorePlanta(data) {
    const plantas = Number(data.plantas_evaluadas) || 0;
    const frutos = Number(data.frutos_planta) || 0;
    const promedio = plantas > 0 ? round2(frutos / plantas) : 0;
    const cal = rate(promedio, "promedio_planta");
    const pts = pointsFromRate(cal);
    const nota = pointsFromRate(cal);

    return {
      plantas,
      frutos,
      promedio,
      rows: [
        {
          id: "plantas",
          item: "Plantas evaluadas",
          count: plantas,
          pct: null,
          calc: String(plantas),
          formula: "Dato ingresado",
          calificacion: null,
          puntos: null,
        },
        {
          id: "frutos",
          item: "N° de frutos en planta",
          count: frutos,
          pct: null,
          calc: String(frutos),
          formula: "Dato ingresado",
          calificacion: null,
          puntos: null,
        },
        {
          id: "promedio",
          item: "Promedio frutos/planta",
          count: null,
          pct: promedio,
          calc: promedio.toFixed(2),
          formula: plantas > 0 ? `${frutos} ÷ ${plantas} = ${promedio.toFixed(2)}` : "Sin plantas",
          calificacion: cal,
          why: rateWhy(promedio, "promedio_planta"),
          puntos: pts,
        },
      ],
      nota,
      calidadGlobal: cal,
      ptsTot: pts,
      pctCalidad: null,
      sumaDefectos: promedio,
      explain: {
        base: `Promedio = N° frutos en planta ÷ plantas evaluadas`,
        muestra: `Plantas = ${plantas} · Frutos = ${frutos}`,
        tot: `Promedio = ${promedio.toFixed(2)}`,
        calidad: null,
        nota: `Nota ${nota} (${cal}): ${rateWhy(promedio, "promedio_planta")}`,
        tip: "Menor promedio = mejor calificación.",
      },
    };
  }

  function compute(type, data) {
    if (type === "calidad" || type === "descarte") return scoreDefectForm(type, data);
    if (type === "caida") return scoreCaida(data);
    if (type === "planta") return scorePlanta(data);
    return { rows: [], nota: 0, calidadGlobal: "Malo", explain: null };
  }

  return { pct, rate, pillClass, compute, round2, gradeLabel, formulaPct, defectRating };
})();
