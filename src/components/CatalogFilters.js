"use client";
import { useState, useMemo, useRef } from "react";

/**
 * ✅ NORMALIZAÇÃO DE CONDITIONS (V25)
 * Regras do seu DB (válidas): NEW, OPEN_BOX, REFURBISHED (e sinônimos tipo Renewed)
 * ❌ "USED" NÃO deve aparecer na UI (mesmo que exista lixo legado no DB).
 *
 * ✅ FIX OVERFLOW (Brands empurrando / sobrepondo grid):
 * - Trava overflow horizontal em toda a cadeia (nav -> fieldset -> list -> label -> span)
 * - Usa min-w-0/max-w-full/overflow-hidden para garantir que truncate funcione
 * - Fallback com break-all para strings gigantes sem espaços
 *
 * ✅ Anti-layout shift:
 * - Conditions: skeleton compacto (2 linhas). Se depois vier mais, ele cresce (ok).
 * - Brands: skeleton maior porque a lista costuma ser longa.
 */

// Normaliza condições para evitar duplicatas (REFURBISHED vs Refurbished etc)
function normalizeConditionKey(condition) {
  const raw = (condition ?? "").toString().trim();
  if (!raw) return "new";

  const c = raw.toLowerCase();

  // NEW
  if (c === "new" || c === "brand new" || c === "novo" || c.includes("new")) return "new";

  // OPEN BOX
  if (
    c.includes("open box") ||
    c.includes("open-box") ||
    c.includes("openbox") ||
    c.includes("open_box")
  ) {
    return "open_box";
  }

  // REFURBISHED / RENEWED / CERTIFIED
  if (
    c.includes("refurb") ||
    c.includes("renewed") ||
    c.includes("reconditioned") ||
    c.includes("certified")
  ) {
    return "refurbished";
  }

  // ❌ NÃO PERMITIR "USED" NA UI
  // Se vier lixo legado (used/pre-owned), colapsa para refurbished para não criar opção inválida.
  if (
    c.includes("used") ||
    c.includes("pre-owned") ||
    c.includes("preowned") ||
    c.includes("seminovo")
  ) {
    return "refurbished";
  }

  // fallback seguro (mas ainda assim só vamos exibir os allowed abaixo)
  return c.replace(/\s+/g, "_").replace(/[^\w_]/g, "") || "new";
}

// Label amigável
function prettyConditionLabel(key) {
  const k = normalizeConditionKey(key);
  if (k === "new") return "New";
  if (k === "open_box") return "Open Box";
  if (k === "refurbished") return "Refurbished";

  return k
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

// Ordem estável
const CONDITION_ORDER = ["new", "open_box", "refurbished"];

// ✅ lista canônica permitida na UI
const ALLOWED_CONDITIONS = new Set(CONDITION_ORDER);

function sortConditions(keys) {
  const normalized = (keys || []).map(normalizeConditionKey).filter(Boolean);
  const filtered = normalized.filter((k) => ALLOWED_CONDITIONS.has(k));
  const unique = Array.from(new Set(filtered));

  unique.sort((a, b) => {
    const ia = CONDITION_ORDER.indexOf(a);
    const ib = CONDITION_ORDER.indexOf(b);
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    return ra - rb || a.localeCompare(b);
  });

  return unique;
}

/**
 * ✅ Skeleton helpers
 */
function SkeletonLine({ w = "w-3/4" }) {
  return <div className={`h-2 bg-slate-100 rounded ${w}`} />;
}

function SkeletonCheckboxRow() {
  return (
    <div className="flex items-center gap-3 w-full min-w-0 overflow-hidden">
      <div className="w-4 h-4 rounded bg-slate-100 shrink-0" />
      <div className="flex-1 min-w-0 overflow-hidden">
        <SkeletonLine w="w-2/3" />
      </div>
    </div>
  );
}

function SkeletonBlock({ rows = 6 }) {
  return (
    <div className="animate-pulse space-y-3 w-full min-w-0 overflow-hidden">
      {[...Array(rows)].map((_, i) => (
        <SkeletonCheckboxRow key={i} />
      ))}
    </div>
  );
}

/**
 * ✅ Alturas mínimas (APENAS quando skeleton aparece)
 * Conditions: compacto (2 linhas) => evita "shrink" depois.
 * Brands: maior.
 */
const MIN_HEIGHT_CONDITIONS = 56; // px ~ 2 rows
const MIN_HEIGHT_BRANDS = 260; // px ~ 10 rows

export default function CatalogFilters({
  loading,
  brandsList = [],
  selectedBrands = [],
  toggleBrand,
  conditionsList = [],
  selectedConditions = [],
  toggleCondition,
  isMobileMode = false,
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Persistência para evitar sumir ao filtrar
  const masterBrandsListRef = useRef([]);
  const masterConditionsListRef = useRef([]);

  // Atualiza master brands quando a lista cresce
  if (brandsList && brandsList.length > masterBrandsListRef.current.length) {
    masterBrandsListRef.current = brandsList;
  }

  // Normaliza conditions incoming
  const normalizedIncomingConditions = useMemo(() => sortConditions(conditionsList), [conditionsList]);

  if (
    normalizedIncomingConditions &&
    normalizedIncomingConditions.length > masterConditionsListRef.current.length
  ) {
    masterConditionsListRef.current = normalizedIncomingConditions;
  }

  const brandsToDisplay =
    masterBrandsListRef.current.length > 0 ? masterBrandsListRef.current : brandsList;

  const conditionsToDisplay =
    masterConditionsListRef.current.length > 0
      ? masterConditionsListRef.current
      : normalizedIncomingConditions;

  const sortedBrands = useMemo(() => {
    return [...brandsToDisplay].sort((a, b) => a.localeCompare(b));
  }, [brandsToDisplay]);

  const sortedConditions = useMemo(() => {
    return sortConditions(conditionsToDisplay);
  }, [conditionsToDisplay]);

  const showCondSkeleton = loading || sortedConditions.length === 0;
  const showBrandSkeleton = loading || sortedBrands.length === 0;

  // ✅ minHeight só quando skeleton está visível
  const conditionsContainerStyle = showCondSkeleton ? { minHeight: MIN_HEIGHT_CONDITIONS } : undefined;
  const brandsContainerStyle = showBrandSkeleton ? { minHeight: MIN_HEIGHT_BRANDS } : undefined;

  const FilterContent = () => (
    <div className={`space-y-6 ${loading ? "opacity-70" : ""} transition-opacity w-full min-w-0 max-w-full overflow-hidden`}>
      {/* CONDITIONS */}
      <fieldset
        aria-labelledby="condition-title"
        className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 shadow-sm w-full min-w-0 max-w-full overflow-hidden"
      >
        <h3
          id="condition-title"
          className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-6"
        >
          Condition
        </h3>

        <div style={conditionsContainerStyle} className="space-y-3 w-full min-w-0 max-w-full overflow-hidden">
          {showCondSkeleton ? (
            <SkeletonBlock rows={2} />
          ) : (
            sortedConditions.map((condKey) => {
              const selectedNormalized = selectedConditions.map(normalizeConditionKey);
              const normalizedKey = normalizeConditionKey(condKey);
              const isChecked = selectedNormalized.includes(normalizedKey);

              return (
                <label
                  key={condKey}
                  className="flex items-center gap-3 cursor-pointer group w-full min-w-0 max-w-full overflow-hidden"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCondition(normalizedKey)}
                    aria-label={`Select condition ${prettyConditionLabel(condKey)}`}
                    className="w-4 h-4 rounded border-2 border-slate-200 checked:bg-[#ffdb00] checked:border-[#ffdb00] appearance-none cursor-pointer transition-all focus:ring-2 focus:ring-black focus:ring-offset-2 outline-none shrink-0"
                  />
                  <span
                    className={`text-[11px] font-black uppercase transition-colors flex-1 min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis ${
                      isChecked ? "text-black font-bold" : "text-slate-500 group-hover:text-black"
                    }`}
                  >
                    {prettyConditionLabel(condKey)}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </fieldset>

      {/* BRANDS */}
      <fieldset
        aria-labelledby="brands-title"
        className="bg-white p-6 rounded-[1.5rem] md:rounded-[2rem] border border-slate-200 shadow-sm w-full min-w-0 max-w-full overflow-hidden"
      >
        <h3
          id="brands-title"
          className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-6"
        >
          Brands
        </h3>

        <div
          style={brandsContainerStyle}
          className="space-y-3 max-h-[500px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar w-full min-w-0 max-w-full"
        >
          {showBrandSkeleton ? (
            <SkeletonBlock rows={10} />
          ) : (
            sortedBrands.map((brand) => (
              <label
                key={brand}
                className="flex items-center gap-3 cursor-pointer group w-full min-w-0 max-w-full overflow-hidden"
                title={brand}
              >
                <input
                  type="checkbox"
                  checked={selectedBrands.includes(brand)}
                  onChange={() => toggleBrand(brand)}
                  aria-label={`Select brand ${brand}`}
                  className="w-4 h-4 rounded border-2 border-slate-200 checked:bg-[#ffdb00] checked:border-[#ffdb00] appearance-none cursor-pointer transition-all shrink-0 focus:ring-2 focus:ring-black focus:ring-offset-2 outline-none"
                />

                {/* ✅ o pulo/sobreposição vem daqui quando o texto estoura.
                    - whitespace-nowrap + overflow-hidden + text-ellipsis garante truncamento
                    - break-all é “seguro” para casos extremos (marca gigante sem espaços) */}
                <span
                  className={`text-[11px] font-black uppercase transition-colors flex-1 min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis break-all ${
                    selectedBrands.includes(brand)
                      ? "text-black font-bold"
                      : "text-slate-500 group-hover:text-black"
                  }`}
                >
                  {brand}
                </span>
              </label>
            ))
          )}
        </div>
      </fieldset>
    </div>
  );

  if (isMobileMode) {
    return (
      <>
        <button
          aria-label="Open filters"
          onClick={() => setIsOpen(true)}
          className="flex items-center justify-center gap-2 w-full h-[48px] bg-white text-black rounded-2xl border border-slate-200 font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-sm focus:ring-2 focus:ring-black outline-none"
        >
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters{" "}
          {(selectedBrands.length + selectedConditions.length) > 0 &&
            `(${selectedBrands.length + selectedConditions.length})`}
        </button>

        {isOpen && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[999] bg-[#f8fafc] p-6 overflow-y-auto overflow-x-hidden">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-black">Product Filters</h2>
              <button
                aria-label="Close filters"
                onClick={() => setIsOpen(false)}
                className="bg-black text-white p-3 rounded-full focus:ring-2 focus:ring-[#ffdb00] outline-none"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <FilterContent />

            <div className="h-32"></div>
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full bg-black text-[#ffdb00] py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl focus:ring-2 focus:ring-black outline-none"
              >
                Apply Filters
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <nav
      aria-label="Product filters"
      className="space-y-6 relative z-30 w-full min-w-0 max-w-full overflow-hidden"
    >
      <FilterContent />
    </nav>
  );
}