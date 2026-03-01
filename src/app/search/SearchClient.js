// search/SearchClient.js

"use client";

import PageSelector from "../../components/PageSelector";
import ProductCatalogCard from "../../components/ProductCatalogCard";
import CatalogFilters from "../../components/CatalogFilters";
import SortControl from "../../components/SortControl";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";

/**
 * SEARCH CLIENT V25
 * Responsável pela orquestração da busca, filtragem e paginação.
 * Removido o wrapper <Layout> pois agora utilizamos o Root Layout global.
 *
 * ✅ FIXES APLICADOS (sem mudar arquitetura):
 * - Dedup/normalização de condições vindas do backend (evita 2x "Refurbished").
 * - Mantém um "master list" de condições, igual brands, para não sumirem ao filtrar.
 * - Não auto-seleciona condição nenhuma. Default é "all" (nenhuma marcada).
 * - Se o usuário nunca filtrou condição, a UI continua mostrando todas as condições disponíveis.
 */

// Normaliza condição para chave canônica usada no front
function normalizeConditionKey(condition) {
  const raw = (condition ?? "").toString().trim();
  if (!raw) return "new";

  const c = raw.toLowerCase();

  if (c === "new" || c === "brand new" || c === "novo") return "new";

  if (
    c.includes("open box") ||
    c.includes("open-box") ||
    c.includes("openbox") ||
    c.includes("open_box")
  ) {
    return "open_box";
  }

  if (
    c.includes("refurb") ||
    c.includes("renewed") ||
    c.includes("reconditioned") ||
    c.includes("certified")
  ) {
    return "refurbished";
  }

  if (
    c.includes("used") ||
    c.includes("pre-owned") ||
    c.includes("preowned") ||
    c.includes("seminovo")
  ) {
    return "used";
  }

  // fallback estável
  return c.replace(/\s+/g, "_").replace(/[^\w_]/g, "") || "new";
}

const CONDITION_ORDER = ["new", "open_box", "refurbished", "used"];

// Dedup + ordenação estável (garante "new" primeiro se existir)
function normalizeAndSortConditions(list) {
  const arr = Array.isArray(list) ? list : [];
  const unique = Array.from(
    new Set(arr.map((x) => normalizeConditionKey(x)).filter(Boolean))
  );

  unique.sort((a, b) => {
    const ia = CONDITION_ORDER.indexOf(a);
    const ib = CONDITION_ORDER.indexOf(b);
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    return ra - rb || a.localeCompare(b);
  });

  return unique;
}

export default function SearchClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const resultsRef = useRef(null);

  // Captura de parâmetros com fallback seguro (Next.js 15 friendly)
  const query = searchParams.get("q") || "";
  // CORREÇÃO: Garantir que a página seja sempre um número válido e no mínimo 1
  const pageParam = Math.max(1, parseInt(searchParams.get("page")) || 1);
  const sortParam = searchParams.get("sortBy") || "relevance";
  const brandParam = searchParams.get("brand") || "all";
  const conditionParam = searchParams.get("condition") || "all";
  const categoryParam = searchParams.get("category") || "";

  // Estados locais
  const [products, setProducts] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [availableBrands, setAvailableBrands] = useState([]);

  // ✅ Agora conditions começa vazio e será preenchido pela API.
  // Evita "aparecer refurbished como padrão" por causa de defaults hardcoded.
  const [availableConditions, setAvailableConditions] = useState([]);

  // ✅ Master list de condições para não desaparecerem ao filtrar (mesma ideia do teu CatalogFilters para brands)
  const masterConditionsRef = useRef([]);

  // Memoização de filtros selecionados para evitar re-render desnecessário
  const selectedBrands = useMemo(
    () => (brandParam !== "all" ? brandParam.split(",").filter(Boolean) : []),
    [brandParam]
  );

  const selectedConditions = useMemo(
    () =>
      conditionParam !== "all"
        ? conditionParam.split(",").filter(Boolean)
        : [],
    [conditionParam]
  );

  /**
   * Função para atualizar a URL e disparar a busca
   * Mantém o estado da URL sincronizado com os filtros
   */
  const updateSearch = useCallback(
    (newParams) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(newParams).forEach(([key, value]) => {
        if (value === null || value === "all" || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // CORREÇÃO: Só reseta a página se a propriedade 'page' não estiver sendo alterada explicitamente
      if (!newParams.hasOwnProperty("page")) {
        params.set("page", "1");
      }

      router.push(`/search?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  /**
   * Lógica de alternância de filtros (Multiselect)
   */
  const toggleFilter = (item, type) => {
    const currentList = type === "brand" ? selectedBrands : selectedConditions;

    // ✅ Normaliza condição no momento do toggle para não criar duplicatas no URL:
    // ex: clicar "Refurbished" e depois "REFURBISHED" não vira 2 itens.
    const normalizedItem =
      type === "condition" ? normalizeConditionKey(item) : item;

    const normalizedCurrentList =
      type === "condition"
        ? currentList.map((c) => normalizeConditionKey(c))
        : currentList;

    const isSelected = normalizedCurrentList.includes(normalizedItem);

    const newList = isSelected
      ? normalizedCurrentList.filter((i) => i !== normalizedItem)
      : [...normalizedCurrentList, normalizedItem];

    const value = newList.length > 0 ? newList.join(",") : "all";

    // CORREÇÃO: Passar a página explicitamente como string ao aplicar um filtro
    updateSearch({ [type]: value, page: "1" });
  };

  /**
   * Efeito principal de busca de dados
   * Conecta com a API /api/search que agora usa o Schema V25
   */
  useEffect(() => {
    async function fetchSearchData() {
      // Se não houver termo nem categoria, limpa o estado
      if (!query && !categoryParam) {
        setProducts([]);
        setTotalItems(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          page: pageParam.toString(),
          sortBy: sortParam,
          limit: "24",
        });

        if (query) queryParams.set("q", query);
        if (categoryParam) queryParams.set("category", categoryParam);
        if (brandParam !== "all") queryParams.set("brand", brandParam);
        if (conditionParam !== "all") queryParams.set("condition", conditionParam);

        const res = await fetch(`/api/search?${queryParams.toString()}`);

        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();

        // --- INÍCIO DAS CORREÇÕES ---
        setProducts(data.items || []);

        if (data.meta) {
          setTotalItems(data.meta.totalItems || 0);
          setTotalPages(data.meta.totalPages || 1);

          if (data.meta.brands && Array.isArray(data.meta.brands)) {
            setAvailableBrands(data.meta.brands);
          }

          if (data.meta.conditions && Array.isArray(data.meta.conditions)) {
            // ✅ Normaliza e ordena SEMPRE
            const normalized = normalizeAndSortConditions(data.meta.conditions);

            // ✅ Atualiza a master list APENAS quando aumentar (não deixa sumir ao filtrar)
            if (normalized.length > masterConditionsRef.current.length) {
              masterConditionsRef.current = normalized;
            }

            // ✅ Para renderizar no UI, se já temos master, usamos a master
            const toRender =
              masterConditionsRef.current.length > 0
                ? masterConditionsRef.current
                : normalized;

            setAvailableConditions(toRender);
          }
        } else {
          setTotalItems(0);
          setTotalPages(1);
        }
        // --- FIM DAS CORREÇÕES ---
      } catch (err) {
        console.error("❌ Search error:", err);
        setProducts([]);
        setTotalItems(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    }

    fetchSearchData();
  }, [query, categoryParam, pageParam, sortParam, brandParam, conditionParam]);

  // ✅ Se por algum motivo availableConditions ficar vazio mas master tiver dados, usa master.
  useEffect(() => {
    if (
      (!availableConditions || availableConditions.length === 0) &&
      masterConditionsRef.current.length > 0
    ) {
      setAvailableConditions(masterConditionsRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableConditions]);

  // Propriedades unificadas para os filtros (Desktop e Mobile)
  const filterProps = {
    loading,
    brandsList: availableBrands,
    selectedBrands,
    toggleBrand: (b) => toggleFilter(b, "brand"),
    conditionsList: availableConditions,
    selectedConditions,
    toggleCondition: (c) => toggleFilter(c, "condition"),
  };

  return (
    <div className="bg-[#f8fafc] min-h-screen pb-20 flex flex-col">
      <main
        className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-16 flex-grow w-full text-left"
        id="main-content"
      >
        {/* HEADER DA BUSCA */}
        <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-slate-200 pb-8 relative">
          <div className="min-w-0 w-full lg:pr-[240px]">
            <div className="flex items-center gap-3 mb-4">
              <span
                className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-[#ffdb00] bg-black px-3 py-1.5 rounded-full shrink-0"
                aria-live="polite"
              >
                {loading ? "Scanning..." : `${totalItems.toLocaleString()} Matches`}
              </span>
            </div>

            {/* CORREÇÃO DO TÍTULO LONG: Sem aspas, cor preta padronizada e line-clamp */}
            <h1
              className="text-xl md:text-3xl lg:text-4xl font-black uppercase italic leading-[1.2] md:leading-[1.1] text-gray-900 tracking-tighter line-clamp-1 md:line-clamp-2"
              title={
                categoryParam
                  ? `CATEGORY: ${categoryParam.replace(/-/g, " ")}`
                  : `SEARCH: ${query || "ALL PRODUCTS"}`
              }
            >
              {categoryParam ? (
                <>
                  <span className="text-gray-400 mr-2">CATEGORY:</span>
                  <span className="text-gray-900">{categoryParam.replace(/-/g, " ")}</span>
                </>
              ) : (
                <>
                  <span className="text-black-400 mr-2">SEARCH:</span>
                  <span className="text-black-900">{query || "ALL PRODUCTS"}</span>
                </>
              )}
            </h1>
          </div>

          {/* CONTROLES: ORDENAÇÃO E FILTRO MOBILE */}
          <div className="flex flex-row items-center gap-3 w-full lg:w-auto lg:absolute lg:right-0 lg:bottom-8">
            <div className="lg:hidden flex-1">
              <CatalogFilters isMobileMode={true} {...filterProps} />
            </div>
            <div className="flex-1 lg:flex-none min-w-[200px]">
              <div className="relative">
                <label htmlFor="product-sort" className="sr-only">
                  Sort products by
                </label>
                <SortControl
                  id="product-sort"
                  sortBy={sortParam}
                  setSortBy={(val) => updateSearch({ sortBy: val, page: "1" })}
                />
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* SIDEBAR DE FILTROS (DESKTOP) */}
          <aside className="hidden lg:block w-64 shrink-0">
            <CatalogFilters {...filterProps} />
          </aside>

          {/* GRID DE RESULTADOS */}
          <section className="flex-1 min-w-0" aria-labelledby="results-heading">
            <h2 id="results-heading" className="sr-only">
              Search Results
            </h2>

            <div
              ref={resultsRef}
              className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 items-stretch"
              aria-busy={loading}
            >
              {loading && products.length === 0 ? (
                // Skeleton Loading State
                [...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="bg-white h-[400px] rounded-[2.5rem] animate-pulse border border-slate-200"
                    aria-hidden="true"
                  />
                ))
              ) : products.length > 0 ? (
                products.map((p, index) => (
                  <ProductCatalogCard
                    key={p.id || p.sku}
                    product={p}
                    priority={index === 0} // Prioridade de LCP para a primeira imagem
                  />
                ))
              ) : (
                // Empty State
                <div className="col-span-full py-20 text-center text-gray-500 font-black uppercase italic bg-white rounded-[2.5rem] border border-dashed border-slate-300">
                  {loading ? "Synchronizing..." : "No items found for this criteria"}
                </div>
              )}
            </div>

            {/* PAGINAÇÃO */}
            {!loading && totalPages > 1 && (
              <nav className="mt-16 flex justify-center" aria-label="Pagination Navigation">
                <PageSelector
                  currentPage={pageParam}
                  totalPages={totalPages}
                  onPageChange={(p) => {
                    updateSearch({ page: p.toString() });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  loading={loading}
                />
              </nav>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}