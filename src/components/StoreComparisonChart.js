"use client";

import React, { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Importação dinâmica para evitar erros de hidratação/SSR no Next.js
const Chart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-[300px] w-full bg-slate-50 animate-pulse rounded-[2.5rem]" />,
});

// Normaliza condições vindas do backend
const normalizeCondition = (condition) => {
  const raw = (condition ?? "").toString().trim();
  if (!raw) return "NEW";

  const c = raw.toLowerCase();

  if (c === "new" || c === "brand new" || c === "novo") return "NEW";
  if (c.includes("open box") || c.includes("open-box") || c.includes("openbox")) return "OPEN_BOX";
  if (c.includes("open_box")) return "OPEN_BOX";
  if (c.includes("refurb") || c.includes("reconditioned") || c.includes("certified") || c.includes("renewed")) {
    return "REFURBISHED";
  }
  if (c.includes("refurbished")) return "REFURBISHED";
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned") || c.includes("seminovo")) {
    return "USED";
  }

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

// Extrai condição de vários formatos possíveis
const extractConditionFromHistoryItem = (item) => {
  if (!item || typeof item !== "object") return "NEW";

  if (item.condition != null) return normalizeCondition(item.condition);
  if (item.listing?.condition != null) return normalizeCondition(item.listing.condition);
  if (item.offer?.condition != null) return normalizeCondition(item.offer.condition);

  if (item.rawDetails) {
    if (item.rawDetails.condition != null) return normalizeCondition(item.rawDetails.condition);
    if (item.rawDetails.bby?.condition != null) return normalizeCondition(item.rawDetails.bby.condition);
  }

  return "NEW";
};

const getStoreName = (item) =>
  item?.store || item?.storeName || item?.listing?.store || item?.offer?.storeName || "Retailer";

const getRawDate = (item) =>
  item?.date || item?.capturedAt || item?.captured_at || item?.createdAt || item?.created_at || null;

const getNumericPrice = (item) => {
  const price = Number(item?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
};

export default function StoreComparisonChart({ history }) {
  const [days, setDays] = useState(30);
  const [viewMode, setViewMode] = useState("all_stores");
  const [isMounted, setIsMounted] = useState(false);
  const [activeCondition, setActiveCondition] = useState("NEW");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const CONDITION_ORDER = ["NEW", "OPEN_BOX", "REFURBISHED", "USED"];

  const normalizedHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];

    return history
      .map((item) => {
        const rawDate = getRawDate(item);
        const dateObj = rawDate ? new Date(rawDate) : null;
        const price = getNumericPrice(item);

        if (!dateObj || Number.isNaN(dateObj.getTime()) || price == null) return null;

        return {
          ...item,
          __condition: extractConditionFromHistoryItem(item),
          __store: getStoreName(item),
          __price: price,
          __dateObj: dateObj,
          __dateKey: dateObj.toISOString().split("T")[0],
          __timestamp: new Date(`${dateObj.toISOString().split("T")[0]}T00:00:00.000Z`).getTime(),
        };
      })
      .filter(Boolean);
  }, [history]);

  const availableConditions = useMemo(() => {
    if (normalizedHistory.length === 0) return ["NEW"];

    const unique = [...new Set(normalizedHistory.map((item) => item.__condition))].filter(Boolean);

    unique.sort((a, b) => {
      const ia = CONDITION_ORDER.indexOf(a);
      const ib = CONDITION_ORDER.indexOf(b);
      const ra = ia === -1 ? 999 : ia;
      const rb = ib === -1 ? 999 : ib;
      return ra - rb || a.localeCompare(b);
    });

    return unique.length > 0 ? unique : ["NEW"];
  }, [normalizedHistory]);

  useEffect(() => {
    if (availableConditions.length > 0 && !availableConditions.includes(activeCondition)) {
      setActiveCondition(availableConditions[0]);
    }
  }, [availableConditions, activeCondition]);

  const historyByCondition = useMemo(() => {
    return normalizedHistory.filter((item) => item.__condition === activeCondition);
  }, [normalizedHistory, activeCondition]);

  const availableStores = useMemo(() => {
    const stores = historyByCondition.map((item) => item.__store).filter(Boolean);
    return [...new Set(stores)];
  }, [historyByCondition]);

  useEffect(() => {
    if (viewMode !== "all_stores" && !availableStores.includes(viewMode)) {
      setViewMode("all_stores");
    }
  }, [availableStores, viewMode]);

  const processedData = useMemo(() => {
    if (historyByCondition.length === 0) {
      return {
        categories: [],
        timestamps: [],
        bestPrice: [],
        bestStoreNames: [],
        storeData: {},
        storeSeriesXY: {},
        bestSeriesXY: [],
      };
    }

    const dailyMap = {};
    const now = new Date();

    historyByCondition.forEach((item) => {
      const dateKey = item.__dateKey;
      const storeName = item.__store;
      const price = item.__price;

      if (!dateKey || !storeName || !Number.isFinite(price) || price <= 0) return;

      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { stores: {} };
      }

      if (
        dailyMap[dateKey].stores[storeName] == null ||
        price < dailyMap[dateKey].stores[storeName]
      ) {
        dailyMap[dateKey].stores[storeName] = price;
      }
    });

    const sortedDateKeys = Object.keys(dailyMap).sort((a, b) => new Date(a) - new Date(b));

    if (sortedDateKeys.length === 0) {
      return {
        categories: [],
        timestamps: [],
        bestPrice: [],
        bestStoreNames: [],
        storeData: {},
        storeSeriesXY: {},
        bestSeriesXY: [],
      };
    }

    const filteredDateKeys = sortedDateKeys.filter((dateKey) => {
      if (days === "all") return true;
      const diff = (now - new Date(`${dateKey}T00:00:00.000Z`)) / (1000 * 60 * 60 * 24);
      return diff <= Number(days) + 1;
    });

    const finalDateKeys = filteredDateKeys.length > 0 ? filteredDateKeys : sortedDateKeys;

    const categories = finalDateKeys.map((key) => {
      const d = new Date(`${key}T00:00:00.000Z`);
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    });

    const timestamps = finalDateKeys.map((key) => new Date(`${key}T00:00:00.000Z`).getTime());

    const bestStoreNames = [];
    const bestPrices = finalDateKeys.map((key) => {
      const storesInDay = dailyMap[key]?.stores || {};
      let minPrice = Infinity;
      let winningStore = "Retailer";

      Object.entries(storesInDay).forEach(([name, price]) => {
        if (Number.isFinite(price) && price < minPrice) {
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
        const val = dailyMap[key]?.stores?.[store];
        return Number.isFinite(val) ? val : null;
      });
    });

    const bestSeriesXY = finalDateKeys
      .map((key) => {
        const x = new Date(`${key}T00:00:00.000Z`).getTime();
        const y = bestPrices[finalDateKeys.indexOf(key)];
        return Number.isFinite(x) ? { x, y } : null;
      })
      .filter(Boolean);

    const storeSeriesXY = {};
    availableStores.forEach((store) => {
      storeSeriesXY[store] = finalDateKeys
        .map((key) => {
          const x = new Date(`${key}T00:00:00.000Z`).getTime();
          const y = dailyMap[key]?.stores?.[store];

          if (!Number.isFinite(x)) return null;
          if (!Number.isFinite(y) || y <= 0) return null;

          return { x, y };
        })
        .filter(Boolean);
    });

    return {
      categories,
      timestamps,
      bestPrice: bestPrices,
      bestStoreNames,
      storeData,
      storeSeriesXY,
      bestSeriesXY,
    };
  }, [historyByCondition, days, availableStores]);

  if (!isMounted) {
    return <div className="h-[400px] w-full bg-slate-50 animate-pulse rounded-[2.5rem]" />;
  }

  const series =
    viewMode === "all_stores"
      ? [{ name: "Market Best Price", data: processedData.bestSeriesXY || [] }]
      : [{ name: viewMode, data: processedData.storeSeriesXY?.[viewMode] || [] }];

  const primaryColor = "#3b82f6";
  const storeColors = ["#10b981", "#f59e0b", "#8b5cf6", "#f43f5e", "#06b6d4"];

  const storeIndex = availableStores.indexOf(viewMode);
  const activeColor =
    viewMode === "all_stores" || storeIndex < 0
      ? primaryColor
      : storeColors[storeIndex % storeColors.length];

  const options = {
    chart: {
      type: "area",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: "easeinout", speed: 800 },
      sparkline: { enabled: false },
    },
    colors: [activeColor],
    noData: {
      text: "No price history available",
      align: "center",
      verticalAlign: "middle",
      style: {
        color: "#64748b",
        fontSize: "14px",
        fontWeight: 700,
      },
    },
    stroke: {
      curve: "smooth",
      width: 3,
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
      type: "datetime",
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { colors: "#000000", fontSize: "9px", fontWeight: 900 },
        rotate: 0,
        hideOverlappingLabels: true,
        datetimeUTC: true,
        formatter: (value, timestamp) => {
          const t = typeof timestamp === "number" ? timestamp : Number(value);
          if (!Number.isFinite(t)) return "";
          const d = new Date(t);
          return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        },
      },
      tooltip: { enabled: false },
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
      shared: false,
      intersect: false,
      x: {
        formatter: (val) => {
          const t = Number(val);
          if (!Number.isFinite(t)) return "";
          const d = new Date(t);
          return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
        },
      },
      y: {
        formatter: (val) => (val != null && Number.isFinite(val) ? `$${Number(val).toFixed(2)}` : "N/A"),
        title: {
          formatter: (seriesName) => `${seriesName}: `,
        },
      },
    },
    markers: {
      size: 4,
      strokeWidth: 0,
      hover: { size: 7 },
    },
  };

  return (
    <div className="bg-white p-4 md:p-10 rounded-[1rem] border border-slate-100 shadow-sm relative overflow-hidden">
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

      <div className="h-[250px] md:h-[350px] w-full">
        <Chart options={options} series={series} type="area" height="100%" />
      </div>

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