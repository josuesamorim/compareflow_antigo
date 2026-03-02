// productPageClient.js
"use client";

import React, { useState, useEffect, useMemo } from "react";
import OfferComparisonList from "../../../components/OfferComparisonList";
import TechnicalSpecs from "../../../components/TechnicalSpecs";
import { useParams, useSearchParams } from "next/navigation";
import Image from "next/image";
import PriceAnalyzer from "../../../components/PriceAnalyzer";
import ExpertReviewAI from "../../../components/ExpertReviewAI";
import StoreComparisonChart from "../../../components/StoreComparisonChart";

// --------- HELPERS (Condition Consistency) ----------
function normalizeConditionKey(condition) {
  const raw = (condition ?? "").toString().trim().toLowerCase();
  if (!raw) return "new";

  if (raw === "new" || raw === "brand new" || raw === "novo") return "new";

  if (
    raw.includes("open box") ||
    raw.includes("open-box") ||
    raw.includes("openbox") ||
    raw.includes("open_box")
  )
    return "open-box";

  if (
    raw.includes("refurb") ||
    raw.includes("renewed") ||
    raw.includes("reconditioned") ||
    raw.includes("certified")
  )
    return "refurbished";

  if (
    raw.includes("pre-owned") ||
    raw.includes("preowned") ||
    raw.includes("used") ||
    raw.includes("seminovo")
  )
    return "pre-owned";

  return raw.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "new";
}

// --- SUB-COMPONENTE DE CONDIÇÃO ---
function ConditionBadge({ condition }) {
  const c = (condition ?? "").toString().trim().toLowerCase();

  const isRenewed =
    c === "refurbished" ||
    c.includes("refurb") ||
    c === "renewed" ||
    c.includes("certified refurbished") ||
    c.includes("seller refurbished") ||
    c === "open_box" ||
    c === "open-box" ||
    c.includes("open box") ||
    c === "pre-owned" ||
    c.includes("preowned") ||
    c.includes("used");

  if (!isRenewed) return null;

  const label =
    c === "open_box" || c === "open-box" || c.includes("open box")
      ? "Open Box"
      : c.includes("refurb") || c === "renewed"
        ? "Refurbished"
        : c.includes("pre-owned") || c.includes("preowned") || c.includes("used")
          ? "Pre-Owned"
          : condition;

  return (
    <div className="absolute top-2 left-2 md:top-4 md:left-4 z-10">
      <span className="bg-emerald-700 text-white text-[7px] md:text-[9px] font-black uppercase px-2 py-0.5 md:px-3 md:py-1 rounded-full shadow-sm">
        {label}
      </span>
    </div>
  );
}

/**
 * Heurística "BestBuy-like" (premium + consistente):
 * - ✅ Sem matte/gradiente: fundo branco puro (como você pediu)
 * - ✅ Nunca corta: object-contain SEM scale
 * - ✅ Ocupa o espaço do bloco no desktop (sem limitar em square)
 * - ✅ Ajuste automático para imagens MUITO horizontais/verticais (ex: caneta) via padding dinâmico
 */
function ProductHeroImage({ images = [], alt, isMobile = false }) {
  const fallbackPlaceholder = `/no-image.png`;
  const imagesKey = JSON.stringify(images);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [useFallback, setUseFallback] = useState(images.length === 0);

  const [ratioMode, setRatioMode] = useState("unknown"); // normal | wide | tall | extreme

  useEffect(() => {
    setCurrentIndex(0);
    setLoaded(false);
    setUseFallback(images.length === 0);
    setRatioMode("unknown");
  }, [imagesKey]);

  const currentSrc = useFallback
    ? fallbackPlaceholder
    : images[currentIndex] || fallbackPlaceholder;

  const handleError = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      setLoaded(false);
      setRatioMode("unknown");
    } else {
      setUseFallback(true);
      setLoaded(false);
      setRatioMode("unknown");
    }
  };

  const applyRatioHeuristics = (naturalWidth, naturalHeight) => {
    const w = Number(naturalWidth || 0);
    const h = Number(naturalHeight || 0);
    if (!w || !h) return;

    const r = w / h;

    const isWide = r >= 1.55;
    const isVeryWide = r >= 2.3;
    const isTall = r <= 0.7;
    const isVeryTall = r <= 0.5;

    let mode = "normal";
    if (isVeryWide || isVeryTall) mode = "extreme";
    else if (isWide) mode = "wide";
    else if (isTall) mode = "tall";

    setRatioMode(mode);
  };

  const paddingClass = useMemo(() => {
    /**
     * ✅ Para NÃO cortar em hipótese nenhuma:
     * - Sem scale/zoom
     * - “Aumentar” produto = reduzir padding
     */
    if (ratioMode === "wide") return "p-1 md:p-3";
    if (ratioMode === "tall") return "p-0.5 md:p-2";
    if (ratioMode === "extreme") return "p-0 md:p-1";
    return "p-3 md:p-6";
  }, [ratioMode]);

  // ✅ sizes de desktop agora acompanha o bloco, não fixa 520px
  const sizesAttr = isMobile ? "100vw" : "(max-width: 1024px) 45vw, 33vw";

  // ✅ Container: mobile quadrado; desktop ocupa altura total do bloco (sem cortar)
  const containerClass = useMemo(() => {
    return [
      "relative w-full overflow-hidden rounded-2xl md:rounded-[2rem]",
      "bg-white",
      "ring-1 ring-slate-200/70",
      isMobile ? "aspect-square" : "h-full min-h-[360px]",
    ].join(" ");
  }, [isMobile]);

  return (
    <div className={containerClass}>
      {!loaded && (
        <div className="absolute inset-0 z-0 flex items-center justify-center bg-white">
          <div className="absolute inset-0 bg-slate-100 animate-pulse" />
          <svg
            className="relative w-12 h-12 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}

      <Image
        key={currentSrc}
        src={currentSrc}
        alt={alt || "Product Image"}
        fill
        priority={true}
        sizes={sizesAttr}
        onError={handleError}
        onLoadingComplete={(img) => {
          setLoaded(true);
          applyRatioHeuristics(img?.naturalWidth, img?.naturalHeight);
        }}
        className={[
          "z-10",
          "object-contain", // ✅ nunca corta
          "w-full h-full",
          paddingClass, // ✅ aumenta sem zoom
          "transition-opacity duration-500 ease-out",
          loaded ? "opacity-100" : "opacity-0",
          // ✅ sombra suave pra separar produto branco de fundo branco (sem matte)
          // "drop-shadow-[0_14px_20px_rgba(0,0,0,0.10)]",
          "select-none",
        ].join(" ")}
      />
    </div>
  );
}

function ProductContent({ initialProduct }) {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params?.slug;

  const [product, setProduct] = useState(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cleanText = (text) => {
    if (!text) return "N/A";
    return text.toString().replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim() || "N/A";
  };

  // ✅ Mantém consistência Search -> PDP: preserva querystring (?condition=...&price=...)
  // OBS: useSearchParams é assíncrono no sentido de hidratação; sempre trate como opcional.
  const conditionQS = searchParams?.get("condition") || "";
  const priceQS = searchParams?.get("price") || "";

  const qsString = useMemo(() => {
    const qs = new URLSearchParams();
    if (conditionQS) qs.set("condition", conditionQS);
    if (priceQS) qs.set("price", priceQS);
    const str = qs.toString();
    return str ? `?${str}` : "";
  }, [conditionQS, priceQS]);

  useEffect(() => {
    // ✅ Se initialProduct existe mas slug mudou (navegação client), refetch.
    // ✅ Se initialProduct NÃO existe, também refetch.
    if (!slug) return;

    if (!initialProduct || (initialProduct && initialProduct.slug !== slug)) {
      async function getProductData() {
        setLoading(true);
        try {
          const res = await fetch(`/api/product/${slug}${qsString}`);
          if (!res.ok) throw new Error("Product not found");
          const data = await res.json();
          setProduct(data);
        } catch (err) {
          console.error("Error loading product:", err);
          setProduct({ error: true });
        } finally {
          setLoading(false);
        }
      }
      getProductData();
    } else {
      // Se já temos initialProduct para o slug atual, garante estado correto
      setProduct(initialProduct);
      setLoading(false);
    }
  }, [slug, initialProduct, qsString]);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
    }
  };

  if (loading && !product) {
    return (
      <div className="p-20 text-center font-black uppercase animate-pulse text-slate-600 tracking-widest min-h-screen bg-slate-50">
        Analyzing Market...
      </div>
    );
  }

  if (!product || product.error) {
    return (
      <div className="p-20 text-center flex flex-col items-center justify-center min-h-[60vh]">
        <h2 className="text-4xl font-black text-red-500 uppercase italic">
          404 - Product Not Found
        </h2>
        <p className="text-slate-500 mt-4 font-bold uppercase tracking-widest">
          Slug: {slug}
        </p>
        <a
          href="/"
          className="mt-8 bg-black text-white px-8 py-3 rounded-full font-black uppercase text-xs transition-transform active:scale-95"
        >
          Return to Home
        </a>
      </div>
    );
  }

  // --- LÓGICA DE DADOS ---
  const offers = Array.isArray(product.offers) ? product.offers : [];

  // ✅ Seleção do "bestOffer" respeitando a condição do clique/search
  // - conditionQS: vem do link/click no card (fonte forte no client)
  // - product.selectedCondition: vem do server (fallback)
  // - product.selectedOfferId: vem do server (mais forte ainda)
  const requestedConditionKey = normalizeConditionKey(
    conditionQS || product.selectedCondition || "",
  );
  const selectedOfferId = product.selectedOfferId || null;

  const bestOffer = useMemo(() => {
    if (!offers || offers.length === 0) return null;

    // 1) Se o server já determinou offer id, use ele (mais forte)
    if (selectedOfferId != null) {
      const byId = offers.find((o) => String(o.id) === String(selectedOfferId));
      if (byId) return byId;
    }

    // 2) Se temos condição pedida, pega a menor dessa condição
    if (requestedConditionKey) {
      const candidates = offers.filter(
        (o) => normalizeConditionKey(o?.condition) === requestedConditionKey,
      );
      if (candidates.length > 0) {
        const sorted = [...candidates].sort(
          (a, b) => Number(a.currentPrice || 0) - Number(b.currentPrice || 0),
        );
        return sorted[0];
      }
    }

    // 3) fallback
    return offers[0];
  }, [offers, selectedOfferId, requestedConditionKey]);

  // ✅ Preço topo da PDP: vem do server (product.lowestPrice) já respeitando condição;
  // fallback para o bestOffer, se necessário.
  const lowestPrice = Number(product.lowestPrice ?? bestOffer?.currentPrice ?? 0);

  const bestOfferUrl = bestOffer?.affiliateUrl || bestOffer?.url || "#";

  // COLETA DE IMAGENS EM CASCATA (Fallback)
  // ✅ Prioriza a imagem da oferta selecionada primeiro (consistência visual)
  const allPossibleImages = [
    bestOffer?.image,
    product.image,
    ...offers.map((offer) => offer.image),
  ].filter(Boolean);

  const uniqueImagesList = [...new Set(allPossibleImages)];

  const displayModel = cleanText(
    product.rawDetails?.model_number ||
      product.rawDetails?.product_model ||
      product.rawDetails?.Model,
  );
  const displayColor = cleanText(
    product.rawDetails?.color ||
      product.rawDetails?.colour ||
      product.rawDetails?.Color,
  );

  const handleGoToStore = () => {
    if (
      typeof window !== "undefined" &&
      typeof window.dataLayer !== "undefined"
    ) {
      const eventData = {
        event: "click_go_to_store",
        product_name: product?.name || "Unknown",
        store_name: bestOffer?.storeName || "Retailer",
        product_price: lowestPrice,
        product_condition:
          bestOffer?.condition ||
          product?.selectedCondition ||
          conditionQS ||
          "unknown",
      };
      window.dataLayer.push(eventData);
    }
  };

  const hasValidAIReview =
    product.expertScore &&
    product.expertReview &&
    product.expertLastUpdated &&
    !product.expertReview?.error;

  const navItems = [
    { label: "Store Offers", id: "offers-pc" },
    { label: "Price History", id: "history-pc" },
    // ✅ SWAP: Expert Analysis antes de Product Specs
    ...(hasValidAIReview ? [{ label: "Expert Analysis", id: "analysis-pc" }] : []),
    { label: "Product Specs", id: "specs-pc" },
  ];

  // ✅ Condição inicial para o PriceAnalyzer bater com o topo da página
  const analyzerInitialCondition =
    bestOffer?.condition || product?.selectedCondition || conditionQS || "NEW";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* MOBILE UI */}
      <div className="md:hidden pb-10 text-left">
        <section
          className="bg-white border-b border-slate-200 overflow-hidden"
          aria-label="Product Main Information"
        >
          {/* Ajuste: altura maior + imagem ocupando melhor */}
          <div className="p-6 flex justify-center border-b border-slate-100 relative bg-white h-[300px]">
            <ConditionBadge condition={bestOffer?.condition} />
            <ProductHeroImage
              images={uniqueImagesList}
              alt={product.name}
              isMobile={true}
            />
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded inline-block">
                BRAND: {cleanText(product.brand)}
              </span>

              <h1 className="text-xl font-black text-gray-900 italic uppercase leading-tight line-clamp-3">
                {product.name}
              </h1>

              {/* LÓGICA DE ESTOQUE NO PREÇO PRINCIPAL MOBILE */}
              <div className="flex items-center gap-4 bg-gray-900 rounded-2xl p-4 text-white border-l-[6px] border-[#ffdb00] shadow-xl">
                <div className="flex-1">
                  <p className="text-[#ffdb00] font-black text-[9px] uppercase">
                    {bestOffer ? "Starting at" : "Currently"}
                  </p>
                  <p className="text-3xl font-black tracking-tighter">
                    {bestOffer ? `$${lowestPrice.toFixed(2)}` : "Out of Stock"}
                  </p>
                </div>

                {bestOffer ? (
                  <a
                    href={bestOfferUrl}
                    target="_blank"
                    onClick={handleGoToStore}
                    rel="noopener noreferrer"
                    className="bg-[#ffdb00] text-gray-900 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-center"
                    aria-label={`Check best offer for ${product.name}`}
                  >
                    Get Deal
                  </a>
                ) : (
                  <button
                    disabled
                    className="bg-slate-800 text-slate-400 px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-center cursor-not-allowed"
                  >
                    Unavailable
                  </button>
                )}
              </div>

              {/* Price Analyzer só exibe análises se houver preço válido */}
              {bestOffer && (
                <PriceAnalyzer
                  currentPrice={lowestPrice}
                  history={product.priceHistory || []}
                  offers={offers}
                  initialCondition={analyzerInitialCondition}
                />
              )}
            </div>
          </div>
        </section>

        <div className="px-4 space-y-12">
          <OfferComparisonList offers={offers} productName={product.name} />

          <section
            id="history-mobile"
            className="min-h-[300px]"
            aria-label="Price History"
          >
            <h2 className="sr-only">Historical Pricing</h2>
            {mounted ? (
              <StoreComparisonChart history={product.priceHistory || []} />
            ) : (
              <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />
            )}
          </section>

          {/* ✅ SWAP MOBILE: ExpertReviewAI antes de TechnicalSpecs */}
          {hasValidAIReview && (
            <div id="analysis-mobile">
  <ExpertReviewAI review={product.expertReview} score={product.expertScore} />
</div>
          )}

          <section
            className="bg-white p-6 rounded-12xl border border-slate-100"
            aria-label="Specifications"
          >
            <h2 className="text-[10px] font-black uppercase mb-6 text-slate-400 tracking-widest">
              Specifications
            </h2>
            <TechnicalSpecs rawDetails={product.rawDetails} />
          </section>
        </div>
      </div>

      {/* DESKTOP UI */}
      <div className="hidden md:block relative text-left">
        <main className="max-w-7xl mx-auto px-4 py-8">
          <section
            className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden mb-10 min-h-[380px]"
            aria-label="Product Summary"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch min-h-[380px]">
              {/* ✅ Imagem PC agora ocupa o bloco todo (sem max width / sem square) */}
              <div className="lg:col-span-4 bg-white p-10 flex items-stretch border-r border-slate-100 h-full relative min-h-[380px]">
                <ConditionBadge condition={bestOffer?.condition} />
                <div className="w-full h-full">
                  <ProductHeroImage
                    images={uniqueImagesList}
                    alt={product.name}
                    isMobile={false}
                  />
                </div>
              </div>

              <div className="lg:col-span-8 p-12">
                <div className="flex justify-between items-center gap-12">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-black text-blue-600 uppercase tracking-[0.4em] mb-3 block">
                      {cleanText(product.brand)}
                    </span>
                    <h1 className="text-3xl font-black text-gray-900 italic uppercase leading-[1.05] line-clamp-6">
                      {product.name}
                    </h1>
                  </div>

                  {/* LÓGICA DE ESTOQUE NO PREÇO PRINCIPAL DESKTOP */}
                  <div className="shrink-0 bg-gray-900 rounded-[2.5rem] p-10 text-white border-l-[8px] border-[#ffdb00] shadow-2xl min-w-[320px] text-center">
                    <p className="text-5xl font-black tracking-tighter">
                      {bestOffer ? `$${lowestPrice.toFixed(2)}` : "Out of Stock"}
                    </p>

                    {bestOffer ? (
                      <a
                        href={bestOfferUrl}
                        onClick={handleGoToStore}
                        target="_blank"
                        rel="noopener noreferrer nofollow sponsored"
                        className="flex items-center justify-center w-full h-14 bg-[#ffdb00] text-gray-900 mt-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] hover:bg-white hover:scale-[1.02] transition-all"
                        aria-label={`Visit store for ${product.name}`}
                      >
                        Go to Store
                      </a>
                    ) : (
                      <button
                        disabled
                        className="flex items-center justify-center w-full h-14 bg-slate-800 text-slate-400 mt-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] cursor-not-allowed"
                      >
                        Unavailable
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <nav
            aria-label="In-page navigation"
            className={`sticky top-6 bg-white/90 backdrop-blur-md z-50 border border-slate-200 rounded-[1.5rem] mb-12 px-8 shadow-md transition-opacity duration-300 ${
              mounted ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="flex justify-center gap-16 py-5">
              {navItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => scrollToSection(item.id)}
                  className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-gray-900 transition-colors"
                  aria-label={`Jump to ${item.label}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="space-y-20 pb-24 max-w-5xl mx-auto">
            <section id="offers-pc" className="scroll-mt-36">
              <h2 className="text-xs font-black uppercase mb-8 text-slate-400 tracking-[0.3em] flex items-center gap-4">
                Best Available Offers{" "}
                <span className="h-[1px] flex-1 bg-slate-200"></span>
              </h2>
              <OfferComparisonList offers={offers} productName={product.name} />
            </section>

            <section id="history-pc" className="scroll-mt-36 min-h-[450px]">
              <h2 className="text-xs font-black uppercase mb-8 text-slate-400 tracking-[0.3em] flex items-center gap-4">
                Price Analytics <span className="h-[1px] flex-1 bg-slate-200"></span>
              </h2>

              {/* Price Analyzer só exibe análises se houver preço válido */}
              {bestOffer && (
                <PriceAnalyzer
                  currentPrice={lowestPrice}
                  history={product.priceHistory || []}
                  offers={offers}
                  initialCondition={analyzerInitialCondition}
                />
              )}

              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm min-h-[350px]">
                {mounted ? (
                  <StoreComparisonChart history={product.priceHistory || []} />
                ) : (
                  <div className="h-full w-full bg-slate-50/50 animate-pulse rounded-2xl" />
                )}
              </div>
            </section>

            {/* ✅ SWAP DESKTOP: ExpertReviewAI antes de TechnicalSpecs */}
            {hasValidAIReview && (
              <section id="analysis-pc" className="scroll-mt-36">
                <ExpertReviewAI
                  review={product.expertReview}
                  score={product.expertScore}
                />
              </section>
            )}

            <section id="specs-pc" className="scroll-mt-36">
              <h2 className="text-xs font-black uppercase mb-8 text-slate-400 tracking-[0.3em] flex items-center gap-4">
                Technical Data <span className="h-[1px] flex-1 bg-slate-200"></span>
              </h2>

              <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
                <div className="grid grid-cols-3 gap-12 italic font-black uppercase text-center border-b border-slate-100 pb-10 mb-8">
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 mb-2 tracking-widest">
                      Brand
                    </p>
                    <span className="truncate block text-blue-600 text-lg">
                      {cleanText(product.brand)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 mb-2 tracking-widest">
                      Model
                    </p>
                    <span className="truncate block text-lg">{displayModel}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 mb-2 tracking-widest">
                      Color
                    </p>
                    <span className="truncate block text-lg">{displayColor}</span>
                  </div>
                </div>

                <TechnicalSpecs rawDetails={product.rawDetails} />
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ProductPageClient({ initialProduct }) {
  return <ProductContent initialProduct={initialProduct} />;
}