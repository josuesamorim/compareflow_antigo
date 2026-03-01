// StoreComparisonChart.js

"use client";

import React, { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Importação dinâmica para evitar erros de Hidratação/SSR no Next.js
const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-slate-50 animate-pulse rounded-[2.5rem]" />,
});

// Normaliza condições vindas do backend (new/open_box/refurbished/used etc)
// e também tolera variações antigas (Open Box, Certified Refurbished, etc)
const normalizeCondition = (condition) => {
  const raw = (condition ?? "").toString().trim();
  if (!raw) return "NEW";

  const c = raw.toLowerCase();

  if (c === "new" || c === "brand new" || c === "novo") return "NEW";
  if (c.includes("open box") || c.includes("open-box") || c.includes("openbox")) return "OPEN_BOX";
  if (c.includes("open_box")) return "OPEN_BOX";
  if (c.includes("refurb") || c.includes("reconditioned") || c.includes("certified")) return "REFURBISHED";
  if (c.includes("refurbished")) return "REFURBISHED";
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned") || c.includes("seminovo")) return "USED";

  // Se vier qualquer outra string, transforma em um label estável
  return c.replace(/\s+/g, "_").replace(/[^\w_]/g, "").toUpperCase();
};

// Formata label amigável no select
const prettyConditionLabel = (cond) => {
  const c = (cond || "NEW").toUpperCase();
  if (c === "NEW") return "New";
  if (c === "OPEN_BOX") return "Open Box";
  if (c === "REFURBISHED") return "Refurbished";
  if (c === "USED") return "Used";
  return c
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
};

// Extrai condição de vários formatos possíveis:
// - novo backend pode não mandar no histórico -> inferimos via offer/listing/rawDetails
// - se tiver item.condition, usamos diretamente
const extractConditionFromHistoryItem = (item) => {
  if (!item || typeof item !== "object") return "NEW";

  // 1) Se já vier explícito no history
  if (item.condition != null) return normalizeCondition(item.condition);

  // 2) Alguns formatos antigos podem guardar em "listing.condition"
  if (item.listing && item.listing.condition != null) return normalizeCondition(item.listing.condition);

  // 3) Se vier com offer/listingId e você já juntou isso no client (opcional)
  if (item.offer && item.offer.condition != null) return normalizeCondition(item.offer.condition);

  // 4) Se vier rawDetails (raríssimo em histórico), tenta achar
  if (item.rawDetails) {
    if (item.rawDetails.condition != null) return normalizeCondition(item.rawDetails.condition);
    if (item.rawDetails.bby && item.rawDetails.bby.condition != null) return normalizeCondition(item.rawDetails.bby.condition);
  }

  // fallback
  return "NEW";
};

export default function StoreComparisonChart({ history }) {
  const [days, setDays] = useState(30);
  const [viewMode, setViewMode] = useState("all_stores");
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  /**
   * ✅ MUITO IMPORTANTE (compatível com a mudança do backend):
   * Agora as condições ficam separadas nas OFFERS (store+condition).
   * Mas seu "history" pode vir sem condition, então este componente:
   * - Lê item.condition se existir
   * - Senão tenta inferir de campos alternativos
   * - E, se mesmo assim não existir, assume NEW
   */

  // 1. Extração de Condições Disponíveis
  const CONDITION_ORDER = ["NEW", "OPEN_BOX", "REFURBISHED", "USED"];

const availableConditions = useMemo(() => {
  if (!history || !Array.isArray(history) || history.length === 0) return ["NEW"];

  const conds = history.map((item) => extractConditionFromHistoryItem(item));
  const unique = [...new Set(conds)].filter(Boolean);

  const sorted = unique.sort((a, b) => {
    const ia = CONDITION_ORDER.indexOf(a);
    const ib = CONDITION_ORDER.indexOf(b);
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    return ra - rb || a.localeCompare(b);
  });

  return sorted.length > 0 ? sorted : ["NEW"];
}, [history]);

  const [activeCondition, setActiveCondition] = useState("NEW");

  useEffect(() => {
    if (availableConditions.length > 0 && !availableConditions.includes(activeCondition)) {
      setActiveCondition(availableConditions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableConditions]);

  // 2. Filtro por Condição Ativa
  const historyByCondition = useMemo(() => {
    if (!history || !Array.isArray(history)) return [];
    return history.filter((item) => extractConditionFromHistoryItem(item) === activeCondition);
  }, [history, activeCondition]);

  // 3. Extração das Lojas Disponíveis para esta Condição
  const availableStores = useMemo(() => {
    const stores = historyByCondition
      .map((item) => item.store || (item.listing && item.listing.store))
      .filter(Boolean);
    return [...new Set(stores)];
  }, [historyByCondition]);

  // 4. Processamento Robusto de Dados (Mapeamento de Linha do Tempo)
  const processedData = useMemo(() => {
    if (historyByCondition.length === 0) {
      return { categories: [], bestPrice: [], bestStoreNames: [], storeData: {} };
    }

    const dailyMap = {};
    const allDates = new Set();
    const now = new Date();

    // Organiza todos os preços por data e loja
    historyByCondition.forEach((item) => {
      const rawDate =
        item.date ||
        item.capturedAt ||
        item.captured_at ||
        item.createdAt ||
        item.created_at;

      const storeName = item.store || (item.listing && item.listing.store) || "Retailer";

      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return;

      const dateKey = d.toISOString().split("T")[0];
      allDates.add(dateKey);

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { stores: {} };
      }

      const price = Number(item.price);
      if (!Number.isFinite(price) || price <= 0) return;

      // Mantém sempre o menor preço daquela loja naquele dia específico
      if (!dailyMap[dateKey].stores[storeName] || price < dailyMap[dateKey].stores[storeName]) {
        dailyMap[dateKey].stores[storeName] = price;
      }
    });

    const sortedDateKeys = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

    // Se por algum motivo não ficou nenhuma data válida
    if (sortedDateKeys.length === 0) {
      return { categories: [], bestPrice: [], bestStoreNames: [], storeData: {} };
    }

    // Filtra as datas pelo seletor (7D, 30D, 90D)
    const filteredDateKeys = sortedDateKeys.filter((dateKey) => {
      if (days === "all") return true;
      const diff = (now - new Date(dateKey)) / (1000 * 60 * 60 * 24);
      return diff <= Number(days) + 1;
    });

    const finalDateKeys = filteredDateKeys.length > 0 ? filteredDateKeys : sortedDateKeys;

    // Constrói as séries de dados
    const categories = finalDateKeys.map((key) => {
      const d = new Date(key);
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    });

    // Identifica qual loja é a melhor para cada dia da categoria
    const bestStoreNames = [];
    const bestPrices = finalDateKeys.map((key) => {
      const day = dailyMap[key];
      const storesInDay = (day && day.stores) || {};
      let minPrice = Infinity;
      let winningStore = "Retailer";

      Object.entries(storesInDay).forEach(([name, price]) => {
        if (price < minPrice) {
          minPrice = price;
          winningStore = name;
        }
      });

      bestStoreNames.push(winningStore);
      return minPrice === Infinity ? null : minPrice;
    });

    const storeData = {};
    availableStores.forEach((store) => {
      storeData[store] = finalDateKeys.map((key) => {
        const day = dailyMap[key];
        return day && day.stores && day.stores[store] != null ? day.stores[store] : null;
      });
    });

    return { categories, bestPrice: bestPrices, bestStoreNames, storeData };
  }, [historyByCondition, days, availableStores]);

  if (!isMounted) {
    return <div className="h-[400px] w-full bg-slate-50 animate-pulse rounded-[2.5rem]" />;
  }

  // 5. Configuração das Séries do Apex
  const series =
    viewMode === "all_stores"
      ? [{ name: "Market Best Price", data: processedData.bestPrice }]
      : [{ name: viewMode, data: processedData.storeData[viewMode] || [] }];

  const primaryColor = "#3b82f6";
  const storeColors = ["#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#06b6d4"];
  const activeColor =
    viewMode === "all_stores"
      ? primaryColor
      : storeColors[availableStores.indexOf(viewMode) % storeColors.length];

  const options = {
    chart: {
      type: "area",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: "easeinout", speed: 800 },
      sparkline: { enabled: false },
    },
    colors: [activeColor],
    stroke: {
      curve: "smooth",
      width: 3,
      connectNulls: true,
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 100],
      },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: "#f1f5f9",
      strokeDashArray: 4,
      padding: { left: 0, right: 10 },
    },
    xaxis: {
      categories: processedData.categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: "#000000", fontSize: "9px", fontWeight: 900 },
        rotate: 0,
        hideOverlappingLabels: true,
      },
    },
    yaxis: {
      labels: {
        formatter: (val) => {
          if (val == null || !Number.isFinite(val)) return "";
          return `$${Number(val).toFixed(0)}`;
        },
        style: { colors: "#000000", fontSize: "9px", fontWeight: 900 },
        offsetX: -10,
      },
    },
    tooltip: {
      theme: "light",
      shared: true,
      y: {
        formatter: (val) => (val != null ? `$${Number(val).toFixed(2)}` : "N/A"),
        title: {
          // Substitui o nome da série pelo nome da loja vencedora
          formatter: (seriesName, { dataPointIndex }) => {
            if (viewMode === "all_stores" && processedData.bestStoreNames[dataPointIndex]) {
              return processedData.bestStoreNames[dataPointIndex] + ": ";
            }
            return seriesName + ": ";
          },
        },
      },
    },
    markers: { size: 0, hover: { size: 6, strokeWidth: 0 } },
  };

  return (
    <div className="bg-white p-4 md:p-10 rounded-[1rem] border border-slate-100 shadow-sm relative overflow-hidden">
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
            Price Evolution
          </h3>
          <div className="flex gap-4">
            <div className="flex gap-1.5 items-center bg-emerald-50 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[9px] font-black uppercase text-emerald-600">
                Live Market
              </span>
            </div>

            <select
              value={activeCondition}
              onChange={(e) => setActiveCondition(e.target.value)}
              className="bg-slate-50 border-none text-[9px] font-black uppercase text-slate-600 rounded-lg px-2 outline-none cursor-pointer"
              disabled={!availableConditions || availableConditions.length === 0}
            >
              {availableConditions.map((cond) => (
                <option key={cond} value={cond}>
                  {prettyConditionLabel(cond)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
          {[7, 30, 90, "all"].map((range) => (
            <button
              key={range}
              onClick={() => setDays(range)}
              className={`flex-1 md:flex-none whitespace-nowrap px-3 md:px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all duration-300 ${
                days === range ? "bg-white text-blue-600 shadow-sm scale-105" : "text-slate-400"
              }`}
            >
              {range === "all" ? "Max" : `${range}D`}
            </button>
          ))}
        </div>
      </div>

      {/* GRÁFICO */}
      <div className="h-[250px] md:h-[350px] w-full">
        <Chart options={options} series={series} type="area" height="100%" />
      </div>

      {/* LEGENDA */}
      <div className="mt-4 pt-6 border-t border-slate-50 flex flex-wrap gap-4 justify-center">
        <div
          onClick={() => setViewMode("all_stores")}
          className={`flex items-center gap-2 cursor-pointer transition-all ${
            viewMode === "all_stores" ? "opacity-100 scale-105" : "opacity-40"
          }`}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: primaryColor }}></span>
          <span className="text-[8px] md:text-[9px] font-black uppercase text-slate-600">
            All Stores
          </span>
        </div>

        {availableStores.map((store, i) => (
          <div
            key={store}
            onClick={() => setViewMode(store)}
            className={`flex items-center gap-2 cursor-pointer transition-all ${
              viewMode === store ? "opacity-100 scale-105" : "opacity-40"
            }`}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: storeColors[i % storeColors.length] }}
            ></span>
            <span className="text-[8px] md:text-[9px] font-black uppercase text-slate-600">
              {store}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}