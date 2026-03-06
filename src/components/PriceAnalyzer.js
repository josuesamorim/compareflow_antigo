// PriceAnalyzer.js
"use client";

import React, { useState, useMemo, useEffect } from "react";

/**
 * PriceAnalyzer Component - V26 (Condition-aware, Mobile-friendly, Confidence-safe)
 *
 * ✅ Compatível com seu schema novo:
 * - history items: { price, date|capturedAt, store, condition }
 *
 * ✅ Objetivo de UX:
 * - Desktop: painel completo (snapshot + métricas)
 * - Mobile: resumo “buyer-friendly” + detalhes colapsáveis (sem sopa de letrinhas)
 *
 * ✅ FIX PRINCIPAL (anti “enganado”):
 * - NÃO chama de "Overpriced" quando o histórico é raso.
 * - Com poucos pontos, vira "Baseline / Limited data" (e o texto explica).
 */

const safeNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ✅ Tuning de confiança (UX)
const MIN_POINTS_FOR_ANY_LABEL = 2; // abaixo disso: baseline
const MIN_POINTS_FOR_STRONG_LABEL = 5; // abaixo disso: nunca "Overpriced/Excellent", só "Baseline / Limited data"
const MIN_POINTS_FOR_OVERPRICED = 6; // para permitir Overpriced com segurança

// Normaliza condição em labels estáveis (mesmo padrão do app)
// ✅ Padronização final usada aqui:
// NEW | OPEN-BOX | REFURBISHED | PRE-OWNED | (fallback)
const normalizeCondition = (condition) => {
  const raw = (condition ?? "").toString().trim();
  if (!raw) return "NEW";

  const c = raw.toLowerCase();

  if (c === "new" || c === "brand new" || c === "novo") return "NEW";

  // Open Box (aceita open_box / open-box / open box / openbox)
  if (c.includes("open box") || c.includes("open-box") || c.includes("openbox") || c.includes("open_box")) {
    return "OPEN-BOX";
  }

  // Refurbished / Renewed / Certified
  if (c.includes("refurb") || c.includes("renewed") || c.includes("reconditioned") || c.includes("certified")) {
    return "REFURBISHED";
  }

  // Used / Pre-Owned
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned") || c.includes("seminovo")) {
    return "PRE-OWNED";
  }

  // fallback
  return c.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").toUpperCase() || "NEW";
};

const getCurrentForCondition = (cond, offers, normalizedHistory, currentPrice) => {
  // 1) offers (melhor preço ATUAL para essa condição)
  if (Array.isArray(offers) && offers.length > 0) {
    const minForCond = offers
      .map((o) => ({
        price: safeNumber(o?.currentPrice),
        condition: normalizeCondition(o?.condition),
      }))
      .filter((x) => x.price != null && x.price > 0)
      .filter((x) => x.condition === cond)
      .reduce((min, x) => (min == null || x.price < min ? x.price : min), null);

    if (minForCond != null) return minForCond;
  }

  // 2) last history of that condition (último ponto do histórico para essa condição)
  const lastHist = [...(normalizedHistory || [])]
    .reverse()
    .find((h) => h.condition === cond && h.price != null && h.price > 0);

  if (lastHist?.price != null) return lastHist.price;

  // 3) fallback
  return safeNumber(currentPrice) ?? 0;
};

const prettyConditionLabel = (cond) => {
  const c = (cond || "NEW").toUpperCase();
  if (c === "NEW") return "New";
  if (c === "OPEN-BOX") return "Open Box";
  if (c === "REFURBISHED") return "Refurbished";
  if (c === "PRE-OWNED") return "Pre-Owned";
  return c
    .toLowerCase()
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
};

const shortConditionPillLabel = (cond) => {
  const c = (cond || "NEW").toUpperCase();
  if (c === "NEW") return "New";
  if (c === "OPEN-BOX") return "Open Box";
  if (c === "REFURBISHED") return "Refurbished";
  if (c === "PRE-OWNED") return "Pre-Owned";
  return prettyConditionLabel(c);
};

const getDateFromHistoryItem = (h) => {
  const d = h?.date ?? h?.capturedAt ?? h?.captured_at ?? h?.createdAt ?? h?.created_at;
  const dt = d ? new Date(d) : null;
  return dt && !isNaN(dt.getTime()) ? dt : null;
};

const median = (arr) => {
  if (!arr || arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const stddev = (arr) => {
  if (!arr || arr.length < 2) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
};

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const formatMoney = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "N/A";
  return `$${v.toFixed(2)}`;
};

const formatPct = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "N/A";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
};

// Classifica a “qualidade” do preço atual vs mercado (baseado na mediana)
// ✅ Agora respeita confiança: com histórico raso, nunca mostra "Overpriced/Excellent"
const getDealLabel = ({ diffFromMedianPct, sampleCount }) => {
  const n = Number(sampleCount ?? 0);

  // Sem base confiável
  if (!Number.isFinite(diffFromMedianPct) || n < MIN_POINTS_FOR_ANY_LABEL) {
    return {
      label: "Baseline",
      color: "text-indigo-600",
      dot: "bg-indigo-500",
      desc: "we’re establishing a baseline",
    };
  }

  // Histórico ainda raso (evita "Overpriced" enganoso)
  if (n < MIN_POINTS_FOR_STRONG_LABEL) {
    return {
      label: "Limited Data",
      color: "text-slate-700",
      dot: "bg-slate-400",
      desc: "based on limited price history",
    };
  }

  // A partir daqui, permitimos rótulos fortes
  if (diffFromMedianPct <= -10) {
    return {
      label: "Excellent Deal",
      color: "text-emerald-700",
      dot: "bg-emerald-500",
      desc: "well below typical market price",
    };
  }
  if (diffFromMedianPct <= -5) {
    return {
      label: "Great Deal",
      color: "text-emerald-600",
      dot: "bg-emerald-500",
      desc: "below typical market price",
    };
  }
  if (diffFromMedianPct < 0) {
    return {
      label: "Good Price",
      color: "text-blue-600",
      dot: "bg-blue-500",
      desc: "slightly below typical market price",
    };
  }

  // Overpriced só com confiança maior
  if (diffFromMedianPct >= 10 && n >= MIN_POINTS_FOR_OVERPRICED) {
    return {
      label: "Overpriced",
      color: "text-rose-600",
      dot: "bg-rose-500",
      desc: "well above typical market price",
    };
  }
  if (diffFromMedianPct > 5) {
    return {
      label: "Above Average",
      color: "text-rose-600",
      dot: "bg-rose-500",
      desc: "above typical market price",
    };
  }

  return {
    label: "Fair Price",
    color: "text-slate-700",
    dot: "bg-slate-400",
    desc: "in line with the market",
  };
};

// Tendência simples: compara média dos últimos 3 com 3 anteriores (quando possível)
const computeTrend = (series) => {
  if (!series || series.length < 4) return { label: "Stable", detail: "Not enough data", color: "text-slate-500" };

  const last = series.slice(-3);
  const prev = series.slice(-6, -3);

  if (prev.length < 3) return { label: "Stable", detail: "Limited history", color: "text-slate-500" };

  const lastAvg = last.reduce((a, b) => a + b, 0) / last.length;
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;

  const pct = prevAvg > 0 ? ((lastAvg - prevAvg) / prevAvg) * 100 : 0;

  if (pct <= -3) return { label: "Falling", detail: `${formatPct(pct)} vs prior`, color: "text-emerald-600" };
  if (pct >= 3) return { label: "Rising", detail: `${formatPct(pct)} vs prior`, color: "text-rose-600" };
  return { label: "Stable", detail: `${formatPct(pct)} vs prior`, color: "text-slate-500" };
};

const getConfidenceLabel = (n) => (n >= 12 ? "High" : n >= 6 ? "Medium" : n >= 2 ? "Low" : "Very Low");

const getBuyerCopy = ({ currentPriceByCondition, med, diffPct, conditionLabel, sampleCount }) => {
  const n = Number(sampleCount ?? 0);

  // Texto curto e “comprador-friendly”
  if (!Number.isFinite(diffPct) || !Number.isFinite(med) || med <= 0) {
    if (n < MIN_POINTS_FOR_ANY_LABEL) {
      return `Current price is ${formatMoney(currentPriceByCondition)} for ${conditionLabel}. We’re still collecting price history for a reliable baseline.`;
    }
    return `Current price is ${formatMoney(currentPriceByCondition)} for ${conditionLabel}.`;
  }

  // Histórico raso: não use linguagem "overpriced" / "great deal"
  if (n < MIN_POINTS_FOR_STRONG_LABEL) {
    return `Current price is ${formatMoney(currentPriceByCondition)} for ${conditionLabel}. Typical price (${formatMoney(
      med,
    )}) is estimated from limited history.`;
  }

  const abs = Math.abs(diffPct);
  const direction = diffPct < 0 ? "below" : "above";
  const intensity = abs >= 10 ? "well" : abs >= 5 ? "noticeably" : "slightly";

  return `Current price is ${intensity} ${direction} the typical price (${formatMoney(med)}) for ${conditionLabel}.`;
};

const PriceAnalyzer = ({ currentPrice, history, offers = [], initialCondition = "NEW" }) => {
  // 1) Normaliza histórico (preço/date/store/condition)
  const normalizedHistory = useMemo(() => {
    if (!history || !Array.isArray(history)) return [];

    return history
      .map((h) => {
        const price = safeNumber(h?.price);
        const dt = getDateFromHistoryItem(h);
        const store = (h?.store || h?.listing?.store || "Retailer").toString();
        const condition = normalizeCondition(h?.condition ?? h?.listing?.condition);

        if (!Number.isFinite(price) || price <= 0 || !dt) return null;

        return { price, date: dt, store, condition };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);
  }, [history]);

  // ✅ Também considera condições existentes nas ofertas atuais
  const offerConditions = useMemo(() => {
    if (!Array.isArray(offers) || offers.length === 0) return [];
    return [...new Set(offers.map((o) => normalizeCondition(o?.condition)))].filter(Boolean);
  }, [offers]);

  // 2) Descobre quais condições existem (history + offers)
  const availableConditions = useMemo(() => {
    const set = new Set();

    // from history
    (normalizedHistory || []).forEach((h) => set.add(h.condition));

    // from offers
    (offerConditions || []).forEach((c) => set.add(c));

    const unique = [...set].filter(Boolean);

    const order = ["NEW", "OPEN-BOX", "REFURBISHED", "PRE-OWNED"];
    unique.sort(
      (a, b) =>
        (order.indexOf(a) === -1 ? 999 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 999 : order.indexOf(b)),
    );

    return unique.length ? unique : ["NEW"];
  }, [normalizedHistory, offerConditions]);

  // 3) Estado da condição ativa
  const [activeCondition, setActiveCondition] = useState(() => {
    const init = normalizeCondition(initialCondition);
    return availableConditions.includes(init) ? init : availableConditions[0];
  });

  // ✅ Current price REAL por condition (não mistura new/refurb)
  // prioridade: offers -> último preço do histórico -> fallback prop currentPrice
  const currentPriceByCondition = useMemo(
    () => getCurrentForCondition(activeCondition, offers, normalizedHistory, currentPrice),
    [offers, normalizedHistory, currentPrice, activeCondition],
  );

  useEffect(() => {
    const init = normalizeCondition(initialCondition);
    if (availableConditions.includes(init)) setActiveCondition(init);
    else if (!availableConditions.includes(activeCondition)) setActiveCondition(availableConditions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCondition, availableConditions]);

  // 4) Stats por condição
  const computeStatsForCondition = (cond, currPrice) => {
    const rows = normalizedHistory.filter((h) => h.condition === cond);
    const series = rows.map((h) => h.price);
    const uniqueStores = [...new Set(rows.map((h) => h.store))];

    const n = series.length;
    const curr = safeNumber(currPrice);

    const avg = n ? series.reduce((a, b) => a + b, 0) / n : null;
    const med = n ? median(series) : null;
    const min = n ? Math.min(...series) : null;
    const max = n ? Math.max(...series) : null;

    const sd = n >= 2 ? stddev(series) : null;
    const volPct = sd != null && avg ? (sd / avg) * 100 : null;

    const diffFromMedianPct = med && curr != null && med > 0 ? ((curr - med) / med) * 100 : NaN;
    const trend = computeTrend(series);
    const confidence = getConfidenceLabel(n);

    let lowBand = null;
    let highBand = null;
    if (med != null && sd != null) {
      lowBand = Math.max(0, med - sd);
      highBand = med + sd;
    } else if (min != null && max != null) {
      lowBand = min;
      highBand = max;
    }

    return {
      condition: cond,
      n,
      uniqueStores: uniqueStores.length,
      avg,
      med,
      min,
      max,
      sd,
      volPct,
      diffFromMedianPct,
      trend,
      confidence,
      lowBand,
      highBand,
      series,
    };
  };

  const activeStats = useMemo(
    () => computeStatsForCondition(activeCondition, currentPriceByCondition),
    [activeCondition, normalizedHistory, currentPriceByCondition],
  );

  const snapshot = useMemo(
    () =>
      availableConditions.map((c) =>
        computeStatsForCondition(c, getCurrentForCondition(c, offers, normalizedHistory, currentPrice)),
      ),
    [availableConditions, normalizedHistory, offers, currentPrice],
  );

  const deal = useMemo(
    () => getDealLabel({ diffFromMedianPct: activeStats?.diffFromMedianPct, sampleCount: activeStats?.n }),
    [activeStats?.diffFromMedianPct, activeStats?.n],
  );

  const isBaseline = useMemo(() => {
    const n = Number(activeStats?.n ?? 0);
    if (!Number.isFinite(activeStats?.diffFromMedianPct)) return true;
    return n < MIN_POINTS_FOR_ANY_LABEL;
  }, [activeStats?.diffFromMedianPct, activeStats?.n]);

  const barPos = useMemo(() => {
    if (!Number.isFinite(activeStats?.diffFromMedianPct)) return "50%";
    const x = clamp(activeStats.diffFromMedianPct, -20, 20);
    const pct = 50 + (x / 20) * 40; // -20 => 10%, +20 => 90%
    return `${pct}%`;
  }, [activeStats?.diffFromMedianPct]);

  const conditionLabel = prettyConditionLabel(activeCondition);

  const buyerCopy = useMemo(() => {
    const curr = safeNumber(currentPriceByCondition);
    const med = safeNumber(activeStats?.med);
    const diff = safeNumber(activeStats?.diffFromMedianPct);
    return getBuyerCopy({
      currentPriceByCondition: curr,
      med,
      diffPct: diff,
      conditionLabel,
      sampleCount: activeStats?.n,
    });
  }, [currentPriceByCondition, activeStats?.med, activeStats?.diffFromMedianPct, conditionLabel, activeStats?.n]);

  // Snapshot reduzido (mobile): NEW vs condição ativa (se não for NEW)
  const newStats = useMemo(() => snapshot.find((x) => x.condition === "NEW"), [snapshot]);

  const compactCompare = useMemo(() => {
    if (!newStats?.med || activeCondition === "NEW" || !activeStats?.med) return null;
    const pct = ((activeStats.med - newStats.med) / newStats.med) * 100;
    const delta = activeStats.med - newStats.med;
    return { pct, delta };
  }, [newStats?.med, activeCondition, activeStats?.med]);

  const showToggle = availableConditions.length > 1;

  return (
    <div className="w-full bg-white p-4 md:p-6 rounded-[1rem] border border-slate-100 shadow-sm my-6 block overflow-hidden">
      {/* =========================
          MOBILE (Compact + Details)
         ========================= */}
      <div className="md:hidden">
        {/* Header compact */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${deal.dot}`} />
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Market Insight</div>
              <div className="text-sm font-black text-slate-900 leading-tight">
                <span className={deal.color}>{deal.label}</span>{" "}
                <span className="text-slate-500 font-bold">· {conditionLabel}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Current</div>
            <div className="text-lg font-black text-slate-900">{formatMoney(currentPriceByCondition)}</div>
          </div>
        </div>

        {/* Condição: select (mobile) */}
        {showToggle && (
          <div className="mt-3">
            <select
              value={activeCondition}
              onChange={(e) => setActiveCondition(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-[10px] font-black uppercase text-slate-600 rounded-xl px-3 py-2 outline-none"
              aria-label="Select condition"
            >
              {availableConditions.map((cond) => (
                <option key={cond} value={cond}>
                  {prettyConditionLabel(cond)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Buyer-friendly copy */}
        <div className="mt-3 text-sm text-slate-600 leading-relaxed">{buyerCopy}</div>

        {/* “Typical price” highlight */}
        <div className="mt-3 flex gap-2">
          <div className="flex-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Typical</div>
            <div className="text-base font-black text-slate-900">{formatMoney(activeStats?.med)}</div>
            <div className="text-[10px] font-bold text-slate-500">median price</div>
          </div>

          <div className="flex-1 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trend</div>
            <div className={`text-base font-black ${activeStats?.trend?.color || "text-slate-700"}`}>
              {activeStats?.trend?.label || "Stable"}
            </div>
            <div className="text-[10px] font-bold text-slate-500">{activeStats?.trend?.detail || "—"}</div>
          </div>
        </div>

        {/* Savings vs New (compact) */}
        {compactCompare && (
          <div className="mt-3 p-3 rounded-2xl border border-slate-100 bg-white">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Compared to New</div>
            <div className="mt-1 text-sm font-bold text-slate-700">
              Typical is{" "}
              <span className={`${compactCompare.pct < 0 ? "text-emerald-700" : "text-rose-700"} font-black`}>
                {formatPct(compactCompare.pct)}
              </span>{" "}
              ({compactCompare.delta < 0 ? "save" : "pay"}{" "}
              <span className="font-black">{formatMoney(Math.abs(compactCompare.delta))}</span>)
            </div>
          </div>
        )}

        {/* Details (collapsible) */}
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            View details
          </summary>

          {/* Chips (compact labels) */}
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Price checks: <span className="text-slate-800">{activeStats?.n ?? 0}</span>
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Stores: <span className="text-slate-800">{activeStats?.uniqueStores ?? 0}</span>
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Confidence: <span className="text-slate-800">{activeStats?.confidence ?? "Very Low"}</span>
              </span>
            </div>
            {Number.isFinite(activeStats?.volPct) && (
              <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-500">
                  Price swings: <span className="text-slate-800">{formatPct(activeStats.volPct)}</span>
                </span>
              </div>
            )}
          </div>

          {/* Bar + range */}
          {!isBaseline && (
            <div className="mt-4 px-1 relative">
              <div className="relative h-[6px] w-full bg-slate-200/50 rounded-full">
                <div className="absolute inset-0 flex rounded-full opacity-20 overflow-hidden">
                  <div className="h-full w-1/3 bg-emerald-400"></div>
                  <div className="h-full w-1/3 bg-blue-400"></div>
                  <div className="h-full w-1/3 bg-rose-400"></div>
                </div>

                <div
                  className={`absolute top-1/2 w-4 h-4 rounded-full border-4 border-white shadow-md transition-all duration-700 ease-in-out z-20 ${deal.dot}`}
                  style={{ left: barPos, transform: "translate(-50%, -50%)" }}
                ></div>
              </div>

              <div className="flex justify-between w-full mt-3">
                <span className="text-[10px] font-bold text-slate-300 uppercase">Under</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase">Typical</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase">Over</span>
              </div>

              {activeStats?.lowBand != null && activeStats?.highBand != null && (
                <div className="mt-2 text-[11px] font-bold text-slate-500">
                  Typical range: <span className="text-slate-800">{formatMoney(activeStats.lowBand)}</span> —{" "}
                  <span className="text-slate-800">{formatMoney(activeStats.highBand)}</span>
                </div>
              )}
            </div>
          )}

          {/* Full Snapshot (mobile: under details) */}
          {snapshot.length > 1 && (
            <div className="mt-5">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
                Snapshot by Condition
              </h4>

              <div className="space-y-3">
                {snapshot.map((s) => {
                  const vsNewPct =
                    s.condition !== "NEW" && newStats?.med && s.med ? ((s.med - newStats.med) / newStats.med) * 100 : null;

                  return (
                    <div
                      key={s.condition}
                      className={`p-4 rounded-2xl border ${
                        s.condition === activeCondition ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-[11px] font-black uppercase text-slate-700">
                          {prettyConditionLabel(s.condition)}
                        </div>
                        <div className="text-[10px] font-black uppercase text-slate-400">
                          {s.n} pts · {s.uniqueStores} stores
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-[11px] font-bold text-slate-500">
                          Typical <span className="text-slate-900 font-black">{formatMoney(s.med)}</span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          Avg <span className="text-slate-900 font-black">{formatMoney(s.avg)}</span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          Low <span className="text-slate-900 font-black">{formatMoney(s.min)}</span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-500">
                          High <span className="text-slate-900 font-black">{formatMoney(s.max)}</span>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500">
                          Trend: <span className={s.trend.color}>{s.trend.label}</span>
                        </span>

                        {Number.isFinite(vsNewPct) && (
                          <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500">
                            vs New:{" "}
                            <span className={`${vsNewPct < 0 ? "text-emerald-600" : "text-rose-600"} font-black`}>
                              {formatPct(vsNewPct)}
                            </span>
                          </span>
                        )}

                        {Number.isFinite(s.volPct) && (
                          <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500">
                            Swings: <span className="text-slate-800 font-black">{formatPct(s.volPct)}</span>
                          </span>
                        )}
                      </div>

                      {s.condition !== activeCondition && (
                        <button
                          onClick={() => setActiveCondition(s.condition)}
                          className="mt-3 w-full bg-slate-900 text-white rounded-xl py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors"
                        >
                          Analyze {shortConditionPillLabel(s.condition)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </details>
      </div>

      {/* =========================
          DESKTOP (Full panel)
         ========================= */}
      <div className="hidden md:block">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full animate-pulse ${deal.dot}`} />
            <h3 className="text-sm md:text-base font-semibold text-slate-800 tracking-tight">
              Market Insight ({conditionLabel}): <span className={deal.color}>{deal.label}</span>
            </h3>
          </div>

          {/* Toggle por condição (desktop: pills) */}
          {showToggle && (
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
              {availableConditions.map((cond) => (
                <button
                  key={cond}
                  onClick={() => setActiveCondition(cond)}
                  className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${
                    activeCondition === cond ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  }`}
                  aria-label={`Analyze ${prettyConditionLabel(cond)} market`}
                >
                  {shortConditionPillLabel(cond)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Texto principal */}
        <div className="mb-5">
          <p className="text-sm md:text-base text-slate-500 leading-relaxed">
            {isBaseline ? (
              <span>
                We’re still building a reliable baseline for{" "}
                <span className="text-slate-700 font-bold">{conditionLabel}</span>. Current price{" "}
                <span className="text-slate-700 font-bold">{formatMoney(currentPriceByCondition)}</span>.
              </span>
            ) : activeStats?.n < MIN_POINTS_FOR_STRONG_LABEL ? (
              <span>
                Current price <span className="text-slate-800 font-black">{formatMoney(currentPriceByCondition)}</span>{" "}
                is compared against a limited history for{" "}
                <span className="text-slate-700 font-bold">{conditionLabel}</span>. Typical (median) is{" "}
                <span className="text-slate-800 font-black">{formatMoney(activeStats.med)}</span>.
              </span>
            ) : (
              <span>
                Current price <span className="text-slate-800 font-black">{formatMoney(currentPriceByCondition)}</span>{" "}
                is <span className="text-slate-700">{deal.desc}</span> for{" "}
                <span className="text-slate-700 font-bold">{conditionLabel}</span> (median{" "}
                <span className="text-slate-800 font-black">{formatMoney(activeStats.med)}</span>, avg{" "}
                <span className="text-slate-800 font-black">{formatMoney(activeStats.avg)}</span>).
              </span>
            )}
          </p>

          {/* Chips */}
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Data points: <span className="text-slate-800">{activeStats.n}</span>
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Stores: <span className="text-slate-800">{activeStats.uniqueStores}</span>
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Trend: <span className={`${activeStats.trend.color} font-black`}>{activeStats.trend.label}</span>
                <span className="text-slate-400 font-black"> · </span>
                <span className="text-slate-600 font-black">{activeStats.trend.detail}</span>
              </span>
            </div>
            <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
              <span className="text-[10px] font-black uppercase text-slate-500">
                Confidence: <span className="text-slate-800">{activeStats.confidence}</span>
              </span>
            </div>
            {Number.isFinite(activeStats.volPct) && (
              <div className="px-3 py-1 rounded-full bg-slate-50 border border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-500">
                  Volatility: <span className="text-slate-800">{formatPct(activeStats.volPct)}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Barra */}
        {!isBaseline && (
          <div className="px-1 relative mb-6">
            <div className="relative h-[6px] w-full bg-slate-200/50 rounded-full">
              <div className="absolute inset-0 flex rounded-full opacity-20 overflow-hidden">
                <div className="h-full w-1/3 bg-emerald-400"></div>
                <div className="h-full w-1/3 bg-blue-400"></div>
                <div className="h-full w-1/3 bg-rose-400"></div>
              </div>

              <div
                className={`absolute top-1/2 w-4 h-4 md:w-5 md:h-5 rounded-full border-4 border-white shadow-md transition-all duration-700 ease-in-out z-20 ${deal.dot}`}
                style={{ left: barPos, transform: "translate(-50%, -50%)" }}
              ></div>
            </div>

            <div className="flex justify-between w-full mt-4">
              <span className="text-[10px] font-bold text-slate-300 uppercase">Under</span>
              <span className="text-[10px] font-bold text-slate-300 uppercase">Typical</span>
              <span className="text-[10px] font-bold text-slate-300 uppercase">Over</span>
            </div>

            {activeStats?.lowBand != null && activeStats?.highBand != null && (
              <div className="mt-3 text-[11px] font-bold text-slate-500">
                Typical range: <span className="text-slate-800">{formatMoney(activeStats.lowBand)}</span> —{" "}
                <span className="text-slate-800">{formatMoney(activeStats.highBand)}</span>
              </div>
            )}
          </div>
        )}

        {/* Snapshot completo (desktop) */}
        {snapshot.length > 1 && (
          <div className="mt-2">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">
              Market Snapshot by Condition
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {snapshot.map((s) => {
                const vsNewPct =
                  s.condition !== "NEW" && newStats?.med && s.med ? ((s.med - newStats.med) / newStats.med) * 100 : null;

                return (
                  <div
                    key={s.condition}
                    className={`p-4 rounded-2xl border transition-all ${
                      s.condition === activeCondition ? "border-slate-200 bg-slate-50" : "border-slate-100 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-[11px] font-black uppercase text-slate-700">
                        {prettyConditionLabel(s.condition)}
                      </div>
                      <div className="text-[10px] font-black uppercase text-slate-400">
                        {s.n} pts · {s.uniqueStores} stores
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-[11px] font-bold text-slate-500">
                        Median <span className="text-slate-900 font-black">{formatMoney(s.med)}</span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        Avg <span className="text-slate-900 font-black">{formatMoney(s.avg)}</span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        Low <span className="text-slate-900 font-black">{formatMoney(s.min)}</span>
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        High <span className="text-slate-900 font-black">{formatMoney(s.max)}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500">
                        Trend: <span className={s.trend.color}>{s.trend.label}</span>
                      </span>

                      {Number.isFinite(vsNewPct) && (
                        <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500">
                          vs New:{" "}
                          <span className={`${vsNewPct < 0 ? "text-emerald-600" : "text-rose-600"} font-black`}>
                            {formatPct(vsNewPct)}
                          </span>
                        </span>
                      )}

                      {Number.isFinite(s.volPct) && (
                        <span className="px-2 py-1 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-black uppercase text-slate-500">
                          Vol: <span className="text-slate-800 font-black">{formatPct(s.volPct)}</span>
                        </span>
                      )}
                    </div>

                    {s.condition !== activeCondition && (
                      <button
                        onClick={() => setActiveCondition(s.condition)}
                        className="mt-3 w-full bg-slate-900 text-white rounded-xl py-2 text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors"
                      >
                        Analyze {shortConditionPillLabel(s.condition)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceAnalyzer;