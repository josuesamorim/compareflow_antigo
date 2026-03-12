// category/[slug]/categoryclient.js

"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import PageSelector from "../../../components/PageSelector";
import ProductCatalogCard from "../../../components/ProductCatalogCard";
import CatalogFilters from "../../../components/CatalogFilters";
import SortControl from "../../../components/SortControl";
import { useParams } from "next/navigation";

/**
 * CATEGORY PAGE CLIENT - V25 (Corrigida)
 * - Remove "used" fantasma: agora conditionsList vem do backend (data.meta.conditions)
 * - Normaliza/agrupa variações (NEW/New/new etc) e remove duplicatas
 * - JSON-LD: mapeia corretamente New/OpenBox/Refurbished (sem cair em UsedCondition por padrão)
 */
export default function CategoryPage({ initialSEOData, serverTotal }) {
  const params = useParams();
  const currentSlug = params?.slug;

  // Refs para controle de ciclo de vida e blindagem de hidratação
  const isFirstRender = useRef(true);
  const isMounted = useRef(false);

  // 1. SINCRONIZAÇÃO DE ESTADO INICIAL (V25)
  const [products, setProducts] = useState(initialSEOData || []);
  const [totalItems, setTotalItems] = useState(serverTotal || 0);
  const [totalPages, setTotalPages] = useState(serverTotal ? Math.ceil(serverTotal / 24) : 1);

  // Controle de estados de UI
  const [loading, setLoading] = useState(false);
  const [availableBrands, setAvailableBrands] = useState([]);
  const [availableConditions, setAvailableConditions] = useState([]); // ✅ agora vem do backend
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedConditions, setSelectedConditions] = useState([]);

  // 2. ORDENAÇÃO E PAGINAÇÃO
  const [sortBy, setSortBy] = useState("relevance");
  const [currentPage, setCurrentPage] = useState(1);

  const categoryDisplayName = useMemo(() => {
    return currentSlug?.replace(/-/g, " ") || "";
  }, [currentSlug]);

  // --- Normalização forte de condição (para eliminar "used" e duplicatas por casing) ---
  // Retorna SEMPRE uma key estável:
  // new | open_box | refurbished
  const normalizeConditionKey = (condition) => {
    const raw = (condition ?? "").toString().trim();
    if (!raw) return "new";

    const c = raw.toLowerCase();

    // NEW
    if (c === "new" || c === "brand new" || c === "novo" || c.includes("new")) return "new";

    // OPEN BOX
    if (c.includes("open box") || c.includes("open-box") || c.includes("open_box") || c.includes("openbox"))
      return "open_box";

    // REFURBISHED / RENEWED / CERTIFIED
    if (
      c.includes("refurb") ||
      c.includes("reconditioned") ||
      c.includes("certified") ||
      c.includes("renewed")
    )
      return "refurbished";

    // USED / PRE-OWNED (se ainda existir no DB legado, vamos mapear pra refurbished OU ignorar)
    // Aqui você disse que NÃO quer "used". Então:
    // - se algum dado legado vier como used/pre-owned, tratamos como "refurbished" pra não quebrar UX,
    //   mas não vamos expor "used" como opção separada.
    if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned") || c.includes("seminovo"))
      return "refurbished";

    return c.replace(/\s+/g, "_").replace(/[^\w_]/g, "");
  };

  const prettyConditionLabel = (key) => {
    const k = (key || "new").toLowerCase();
    if (k === "new") return "New";
    if (k === "open_box") return "Open Box";
    if (k === "refurbished") return "Refurbished";
    return k
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  };

  const CONDITION_ORDER = ["new", "open_box", "refurbished"];

  const normalizeAndDedupeConditionsFromMeta = (metaConditions) => {
    if (!Array.isArray(metaConditions) || metaConditions.length === 0) return [];
    const normalized = metaConditions.map(normalizeConditionKey).filter(Boolean);

    // Remove qualquer coisa fora do seu conjunto permitido (blindagem extra)
    const allowed = new Set(["new", "open_box", "refurbished"]);
    const filtered = normalized.filter((c) => allowed.has(c));

    const unique = Array.from(new Set(filtered));

    unique.sort((a, b) => {
      const ia = CONDITION_ORDER.indexOf(a);
      const ib = CONDITION_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });

    return unique;
  };

  // Função para gerenciar filtros e resetar página para 1
  const toggleFilter = (item, type) => {
    const setter = type === "brand" ? setSelectedBrands : setSelectedConditions;
    setter((prev) => {
      const isSelected = prev.includes(item);
      const next = isSelected ? prev.filter((i) => i !== item) : [...prev, item];
      return next;
    });
    setCurrentPage(1);
  };

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!currentSlug) return;

      // 3. BLINDAGEM DE HIDRATAÇÃO V25
      if (isFirstRender.current) {
        isFirstRender.current = false;

        const isInitialState =
          selectedBrands.length === 0 &&
          selectedConditions.length === 0 &&
          currentPage === 1 &&
          sortBy === "relevance";

        if (isInitialState) {
          try {
            // Busca silenciosa apenas para popular filtros (brands/conditions) e total real
            const queryParams = new URLSearchParams({
              category: currentSlug,
              page: "1",
              sortBy: "relevance",
              limit: "24",
            });

            const res = await fetch(`/api/search?${queryParams.toString()}`);
            if (!res.ok) return;

            const data = await res.json();

            // Brands
            if (data.meta?.brands || data.brandsList) {
              setAvailableBrands(data.meta?.brands || data.brandsList);
            }

            // ✅ Conditions reais (sem hardcode)
            if (data.meta?.conditions && Array.isArray(data.meta.conditions)) {
              setAvailableConditions(normalizeAndDedupeConditionsFromMeta(data.meta.conditions));
            } else {
              setAvailableConditions([]); // vazio até ter meta
            }

            // Total/pages
            if (data.total !== undefined || data.meta?.totalItems !== undefined) {
              const realTotal = Number(data.meta?.totalItems || data.total);
              setTotalItems(realTotal);
              setTotalPages(data.meta?.totalPages || data.totalPages || Math.ceil(realTotal / 24));
            }
          } catch (e) {
            console.error("Erro na sincronização silenciosa inicial:", e);
          }
          return;
        }
      }

      // 4. BUSCA REATIVA
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          category: currentSlug,
          page: currentPage.toString(),
          sortBy: sortBy,
          limit: "24",
        });

        if (selectedBrands.length > 0) queryParams.append("brand", selectedBrands.join(","));
        if (selectedConditions.length > 0) queryParams.append("condition", selectedConditions.join(","));

        const res = await fetch(`/api/search?${queryParams.toString()}`);
        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();

        const items = data.items || [];
        const total = data.meta?.totalItems || data.total || 0;
        const pages = data.meta?.totalPages || data.totalPages || 1;

        if (currentPage > pages && pages > 0) {
          setCurrentPage(1);
          return;
        }

        setProducts(items);
        setTotalItems(total);
        setTotalPages(pages);

        if (data.meta?.brands || data.brandsList) {
          setAvailableBrands(data.meta?.brands || data.brandsList);
        }

        // ✅ Atualiza conditions reais
        if (data.meta?.conditions && Array.isArray(data.meta.conditions)) {
          setAvailableConditions(normalizeAndDedupeConditionsFromMeta(data.meta.conditions));
        } else {
          setAvailableConditions([]);
        }
      } catch (err) {
        console.error("Erro na busca reativa:", err);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    }

    fetchData();
  }, [currentSlug, currentPage, selectedBrands, selectedConditions, sortBy]);

  // 5. DADOS ESTRUTURADOS (JSON-LD) ATUALIZADOS PARA V25
  // ✅ mapeia corretamente: New/OpenBox/Refurbished (sem cair em UsedCondition por padrão)
  const jsonLd = useMemo(() => {
    const mapSchemaCondition = (raw) => {
      const k = normalizeConditionKey(raw);
      if (k === "new") return "https://schema.org/NewCondition";
      if (k === "open_box") return "https://schema.org/OpenBoxCondition";
      if (k === "refurbished") return "https://schema.org/RefurbishedCondition";
      // fallback (não esperado)
      return "https://schema.org/NewCondition";
    };

    return {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${categoryDisplayName} Deals & Price Comparison`,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: totalItems,
        itemListElement: products.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: item.name,
            image: item.image,
            url: `https://www.compareflow.club/product/${item.slug}`,
            offers: {
              "@type": "Offer",
              price: item.salePrice,
              priceCurrency: "USD",
              itemCondition: mapSchemaCondition(item.condition),
              availability: "https://schema.org/InStock",
            },
          },
        })),
      },
    };
  }, [categoryDisplayName, products, totalItems]);

  const filterProps = {
    loading,
    brandsList: availableBrands,
    selectedBrands,
    toggleBrand: (b) => toggleFilter(b, "brand"),

    // ✅ agora sem "used" hardcoded
    conditionsList: availableConditions.map(prettyConditionLabel),

    // ⚠️ Mas o toggle precisa operar com as KEYS, não com label.
    // Para isso, vamos manter selectedConditions como keys e mapear labels no render.
    // A forma mais simples sem mexer no CatalogFilters é passar conditionsList como keys
    // e deixar o CatalogFilters exibir como está (ele mostra o texto cru).
    //
    // Se você quer label bonita no UI, o correto é ajustar CatalogFilters para receber {key,label}.
    //
    // Como você pediu só este arquivo, mantemos keys para não quebrar:
    // (logo abaixo reatribuímos conditionsList/selectedConditions)
  };

  // ✅ Override final: passa KEYS pro CatalogFilters (compatível com seu componente atual)
  const filterPropsFinal = {
    ...filterProps,
    conditionsList: availableConditions, // keys: new/open_box/refurbished
    selectedConditions,
    toggleCondition: (c) => toggleFilter(c, "condition"),
  };

  return (
    <>
      {/* Injeção de JSON-LD para SEO de Categoria */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="bg-[#f8fafc] min-h-screen pb-20 flex flex-col">
        <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-16 flex-grow w-full">
          {/* HEADER DA CATEGORIA */}
          <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6 text-left border-b border-slate-200 pb-8 relative">
            <div className="min-w-0 w-full lg:pr-[240px]">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] text-[#ffdb00] bg-black px-3 py-1.5 rounded-full shrink-0">
                  {loading ? "Scanning..." : `${totalItems.toLocaleString("en-US")} Matches`}
                </span>
              </div>
              <h1 className="text-xl md:text-3xl lg:text-4xl font-black uppercase italic leading-[1.1] text-gray-900 tracking-tighter block">
                {categoryDisplayName} <span className="text-blue-700">HUB</span>
              </h1>
            </div>

            {/* ORDENAÇÃO E FILTROS MOBILE */}
            <div className="flex flex-row items-center gap-3 w-full lg:w-auto lg:absolute lg:right-0 lg:bottom-8">
              <div className="lg:hidden flex-1">
                <CatalogFilters isMobileMode={true} {...filterPropsFinal} />
              </div>
              <div className="flex-1 lg:flex-none min-w-[200px]">
                <div className="relative">
                  <SortControl
                    sortBy={sortBy}
                    setSortBy={(v) => {
                      setSortBy(v);
                      setCurrentPage(1);
                    }}
                  />
                </div>
              </div>
            </div>
          </header>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* SIDEBAR DE FILTROS (DESKTOP) */}
            <aside className="hidden lg:block w-64 shrink-0">
              <CatalogFilters {...filterPropsFinal} />
            </aside>

            {/* GRID DE PRODUTOS */}
            <section className="flex-1 min-w-0">
              <div
                className={`grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 items-stretch transition-opacity duration-300 ${
                  loading ? "opacity-90" : "opacity-100"
                }`}
              >
                {products.length > 0 ? (
                  products.map((p, index) => (
                    <ProductCatalogCard key={p.slug ? `${p.slug}-${index}` : `prod-${index}`} product={p} priority={index < 4} />
                  ))
                ) : loading ? (
                  [...Array(6)].map((_, i) => (
                    <div
                      key={`skeleton-${i}`}
                      className="bg-white h-[400px] rounded-[2.5rem] animate-pulse border border-slate-200"
                    />
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center text-slate-400 font-black uppercase italic bg-white rounded-[2rem] border border-dashed border-slate-200">
                    No results for this setup
                  </div>
                )}
              </div>

              {/* PAGINAÇÃO */}
              {!loading && products.length > 0 && totalPages > 1 && (
                <nav className="mt-16 flex justify-center">
                  <PageSelector
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={(p) => {
                      setCurrentPage(p);
                      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    loading={loading}
                  />
                </nav>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}