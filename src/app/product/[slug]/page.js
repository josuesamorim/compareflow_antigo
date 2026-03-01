// app/product/[slug]/page.js

import ProductPageClient from "./productPageClient.js";
import { prisma } from "../../../lib/prisma.js";
import { notFound } from "next/navigation";

/**
 * CONFIGURAÇÃO DE AMBIENTE
 * Revalidação ISR de 1 hora para performance.
 */
export const revalidate = 3600;

/**
 * Helpers (SEO + JSON-LD safe)
 */
function safeText(v, max = 300) {
  if (v == null) return "";
  const s = String(v).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function safeBrandName(brand) {
  const b = safeText(brand, 80);
  return b || null;
}

function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * GTIN / UPC validation (length + check digit)
 * - gtin12: UPC-A (12)
 * - gtin13: EAN-13 (13)
 * - gtin14: GTIN-14 (14)
 */
function isValidGtin(digits) {
  const ds = digitsOnly(digits);
  if (!(ds.length === 12 || ds.length === 13 || ds.length === 14)) return false;

  const arr = ds.split("").map((x) => Number(x));
  if (arr.some((n) => !Number.isFinite(n))) return false;

  const checkDigit = arr[arr.length - 1];
  const body = arr.slice(0, -1);

  // From rightmost of body: weights alternate 3/1 (GS1)
  let sum = 0;
  let use3 = true;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += body[i] * (use3 ? 3 : 1);
    use3 = !use3;
  }
  const calc = (10 - (sum % 10)) % 10;
  return calc === checkDigit;
}

function safeGtin12(upc) {
  if (upc == null) return null;
  const ds = digitsOnly(upc);
  if (ds.length !== 12) return null;
  return isValidGtin(ds) ? ds : null;
}

function safeGtin13(ean) {
  if (ean == null) return null;
  const ds = digitsOnly(ean);
  if (ds.length !== 13) return null;
  return isValidGtin(ds) ? ds : null;
}

function safeGtin14(gtin) {
  if (gtin == null) return null;
  const ds = digitsOnly(gtin);
  if (ds.length !== 14) return null;
  return isValidGtin(ds) ? ds : null;
}

/**
 * Normaliza condition para uma chave estável (compatível com filtro/search)
 */
function normalizeConditionKey(condition) {
  const raw = (condition ?? "").toString().trim().toLowerCase();
  if (!raw) return "new";

  if (raw === "new" || raw === "brand new" || raw === "novo") return "new";

  // Open box
  if (raw.includes("open box") || raw.includes("open-box") || raw.includes("openbox") || raw.includes("open_box"))
    return "open-box";

  // Refurb / renewed
  if (raw.includes("refurb") || raw.includes("renewed") || raw.includes("reconditioned") || raw.includes("certified"))
    return "refurbished";

  // Pre-owned / used
  if (raw.includes("pre-owned") || raw.includes("preowned") || raw.includes("used") || raw.includes("seminovo"))
    return "pre-owned";

  return raw.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "new";
}

function normalizeConditionToSchemaUrl(cond) {
  const c = (cond ?? "").toString().trim().toLowerCase();
  if (!c) return "https://schema.org/NewCondition";
  if (c === "new" || c.includes("brand new")) return "https://schema.org/NewCondition";
  if (c.includes("refurb") || c.includes("renewed") || c.includes("reconditioned") || c.includes("certified"))
    return "https://schema.org/RefurbishedCondition";
  if (c.includes("open") && c.includes("box")) return "https://schema.org/UsedCondition";
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned")) return "https://schema.org/UsedCondition";
  return "https://schema.org/NewCondition";
}

function normalizeAvailabilityToSchemaUrl(offer) {
  const expired = Boolean(offer?.isExpired);
  const inStock = Boolean(offer?.onlineAvailability);
  return !expired && inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
}

function normalizePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lê searchParams de forma tolerante (objeto, URLSearchParams, Promise, undefined)
 */
async function readSearchParams(input) {
  const sp = await input;
  if (!sp) return new URLSearchParams();

  // Next pode entregar URLSearchParams em alguns runtimes
  if (typeof sp.get === "function") return sp;

  // Normal object -> URLSearchParams
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    // Se vier array, pega o primeiro (comportamento padrão do Next)
    qs.set(k, Array.isArray(v) ? String(v[0]) : String(v));
  }
  return qs;
}

/**
 * Lê params de forma tolerante (objeto ou Promise)
 */
async function readParams(input) {
  const p = await input;
  return p || {};
}

/**
 * SEO: GENERATE METADATA (V25) — Melhorado (US-first)
 * - canonical + alternates (en-US)
 * - OG/Twitter com imagem
 * - robots googleBot
 */
export async function generateMetadata({ params, searchParams }) {
  const p = await readParams(params);
  const slug = p?.slug;
  const decodedSlug = decodeURIComponent(slug || "");

  const sParams = await readSearchParams(searchParams);
  const requestedCondition = normalizeConditionKey(sParams.get("condition"));

  const product = await prisma.product.findFirst({
    where: { slug: { equals: decodedSlug, mode: "insensitive" } },
    include: {
      listings: {
        orderBy: { salePrice: "asc" },
      },
    },
  });

  if (!product) return {};

  const officialSlug = product.slug;
  const canonical = `https://www.pricelab.tech/product/${officialSlug}`;

  // Pega qualquer oferta (mesmo sem estoque) para extrair imagem
  const referenceListing = (product.listings || []).find((l) => l.image) || (product.listings || [])[0];

  // Oferta ativa priorizando condição solicitada
  const activeListings = (product.listings || []).filter((l) => !l.isExpired && l.onlineAvailability);

  const bestByRequestedCondition = requestedCondition
    ? activeListings.find((l) => normalizeConditionKey(l.condition) === requestedCondition)
    : null;

  const bestAny = activeListings[0] || null;
  const activeOffer = bestByRequestedCondition || bestAny;

  const cleanBrand = safeText(product.brand || "Top Brands", 80) || "Top Brands";
  const cleanCategory = safeText(product.internalCategory || "Electronics", 80) || "Electronics";
  const currentPrice = activeOffer ? normalizePrice(activeOffer.salePrice) : 0;

  const productName = safeText(product.name, 140) || "Product";
  const title = `${productName} - Compare Prices in USA | PRICELAB`;
  const description = `Compare prices for ${productName} by ${cleanBrand} in the United States.${
    activeOffer ? ` Best available offer: $${currentPrice}.` : " Check availability across top US retailers."
  } Track price history and store availability in ${cleanCategory}.`;

  const imageUrl = product.image || (referenceListing ? referenceListing.image : null);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        "en-US": canonical,
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      locale: "en_US",
      siteName: "PRICELAB",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 1200,
              alt: productName,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

/**
 * PÁGINA PRINCIPAL (SERVER COMPONENT)
 * Realiza o Fetch aninhado: Product -> Listings -> PriceHistory
 *
 * ✅ FIX CRÍTICO (consistência Search -> PDP):
 * - Se vier ?condition=xxx do clique, definimos "selectedOffer" e "lowestPrice" por essa condição.
 * - Nunca deixamos a PDP “trocar” para o menor preço global de outra condição.
 *
 * ✅ SEO/JSON-LD improvements:
 * - Product + AggregateOffer (global) + nested Offer list
 * - BreadcrumbList
 * - WebSite context via isPartOf
 * - Audience US + inLanguage en-US
 * - gtin12/gtin13/gtin14 ONLY if valid (check digit)
 * - review/aggregateRating só se existir (sem forçar defaults fake)
 */
export default async function Page({ params, searchParams }) {
  const p = await readParams(params);
  const slug = p?.slug;
  const decodedSlug = decodeURIComponent(slug || "");

  const sParams = await readSearchParams(searchParams);
  const requestedCondition = normalizeConditionKey(sParams.get("condition"));
  const requestedPrice = sParams.get("price") != null ? Number(sParams.get("price")) : null;

  // 1. BUSCA PROFUNDA NO BANCO DE DADOS (SCHEMA V25)
  const product = await prisma.product.findFirst({
    where: { slug: { equals: decodedSlug, mode: "insensitive" } },
    include: {
      listings: {
        include: {
          priceHistory: {
            orderBy: { capturedAt: "desc" },
            take: 50,
          },
        },
        orderBy: { salePrice: "asc" },
      },
    },
  });

  if (!product) notFound();

  const officialSlug = product.slug;
  const canonical = `https://www.pricelab.tech/product/${officialSlug}`;

  // --- LÓGICA DE DADOS SEPARADA (Referência vs Ativas) ---
  const referenceListing = (product.listings || []).find((l) => l.image && l.rawDetails) || (product.listings || [])[0];

  // Apenas ofertas ativas e com estoque
  const activeListings = (product.listings || []).filter((l) => !l.isExpired && l.onlineAvailability);

  // Melhor oferta por condição solicitada
  const bestByRequestedCondition = requestedCondition
    ? activeListings.find((l) => normalizeConditionKey(l.condition) === requestedCondition)
    : null;

  const bestAny = activeListings[0] || null;
  const selectedOffer = bestByRequestedCondition || bestAny;

  const currentPrice = selectedOffer
    ? normalizePrice(selectedOffer.salePrice)
    : Number.isFinite(requestedPrice)
      ? requestedPrice
      : 0;

  /**
   * CONSOLIDAÇÃO DE HISTÓRICO (V25)
   */
  const historyPricesRaw = (product.listings || []).flatMap((l) =>
    (l.priceHistory || []).map((h) => ({
      price: normalizePrice(h.price),
      date: h.capturedAt,
      capturedAt: h.capturedAt,
      store: l.store,
      condition: (h.condition || l.condition || "new").toString(),
      listingId: l.id,
    })),
  );

  const historyValuesOnly = historyPricesRaw.map((h) => h.price).filter((v) => Number.isFinite(v));

  const avgPrice =
    historyValuesOnly.length > 0
      ? historyValuesOnly.reduce((a, b) => a + b, 0) / historyValuesOnly.length
      : currentPrice;

  const diffPercent = avgPrice !== 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

  let priceStatus = "average";
  if (diffPercent <= -5) priceStatus = "great";
  else if (diffPercent < 0) priceStatus = "good";
  else if (diffPercent > 5) priceStatus = "expensive";

  // --- LÓGICA DE PRIORIZAÇÃO DE DADOS TÉCNICOS (BESTBUY > EBAY) ---
  const bestBuyListing = (product.listings || []).find((l) => String(l.store || "").toLowerCase().includes("best"));
  const ebayListing = (product.listings || []).find((l) => String(l.store || "").toLowerCase().includes("ebay"));

  // Prioridade: Dados do Produto Master > BestBuy > eBay > Listing de Referência
  const prioritizedSpecs =
    product.rawDetails || bestBuyListing?.rawDetails || ebayListing?.rawDetails || referenceListing?.rawDetails || {};

  // 2. MONTAGEM DO OBJETO FINAL (SERIALIZAÇÃO SEGURA)
  const fullProductData = {
    ...product,

    // ELEVAÇÃO OBRIGATÓRIA: Joga a imagem da Listing de referência para a raiz do produto
    image: product.image || referenceListing?.image || null,

    // PREÇO TOP DA PDP (respeita condição do clique)
    lowestPrice: currentPrice,

    // Expor condição/offer selecionada
    selectedCondition: selectedOffer?.condition || (requestedCondition ? requestedCondition : null),
    selectedOfferId: selectedOffer?.id || null,

    // Histórico com condition
    priceHistory: historyPricesRaw.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt)),

    // specs priorizadas
    rawDetails: prioritizedSpecs,

    priceAnalysis: {
      average: avgPrice.toFixed(2),
      status: priceStatus,
      diff: diffPercent.toFixed(1),
      daysAnalyzed: historyValuesOnly.length,
    },

    // Frontend recebe só ofertas ativas
    offers: (activeListings || []).map((l) => ({
      id: l.id,
      storeName: l.store,
      currentPrice: normalizePrice(l.salePrice),
      regularPrice: normalizePrice(l.regularPrice),
      affiliateUrl: l.affiliateUrl || l.url,
      condition: l.condition,
      image: l.image,
      isExpired: l.isExpired,
      onlineAvailability: l.onlineAvailability,
      rawDetails: l.rawDetails,
    })),

    // compat UI
    salePrice: currentPrice,
    regularPrice: selectedOffer && selectedOffer.regularPrice ? normalizePrice(selectedOffer.regularPrice) : currentPrice,
  };

  const finalProductData = JSON.parse(JSON.stringify(fullProductData));

  // ---------------- JSON-LD (PDP) ----------------
  const productName = safeText(finalProductData.name, 140) || "Product";
  const brandName = safeBrandName(finalProductData.brand) || "PRICELAB";
  const categoryName = safeText(finalProductData.internalCategory || "Electronics", 80) || "Electronics";

  const imageCandidates = [
    finalProductData.image,
    selectedOffer?.image,
    ...(finalProductData.offers || []).map((o) => o.image),
  ].filter(Boolean);
  const uniqueImages = [...new Set(imageCandidates)].slice(0, 6);

  // UPC/GTIN safe (prefer Product.upc, fallback mpn)
  const rawUpc = finalProductData.upc || finalProductData.mpn || null;
  const gtin12 = safeGtin12(rawUpc);
  const gtin13 = !gtin12 ? safeGtin13(rawUpc) : null;
  const gtin14 = !gtin12 && !gtin13 ? safeGtin14(rawUpc) : null;

  // Offers for JSON-LD: use active offers list
  const offersArr = Array.isArray(finalProductData.offers) ? finalProductData.offers : [];
  const offerPrices = offersArr.map((o) => normalizePrice(o.currentPrice)).filter((n) => Number.isFinite(n) && n > 0);

  const lowPrice = offerPrices.length ? Math.min(...offerPrices) : normalizePrice(finalProductData.salePrice);
  const highPrice = offerPrices.length ? Math.max(...offerPrices) : normalizePrice(finalProductData.salePrice);

  const offersJsonLd = offersArr.map((off, index) => {
    const offerUrl = off.affiliateUrl || `https://www.pricelab.tech/product/${finalProductData.slug}#offer-${index + 1}`;
    const sellerName = safeText(off.storeName, 60) || "Retailer";

    const o = {
      "@type": "Offer",
      url: offerUrl,
      price: normalizePrice(off.currentPrice),
      priceCurrency: "USD",
      availability: normalizeAvailabilityToSchemaUrl(off),
      itemCondition: normalizeConditionToSchemaUrl(off.condition),
      seller: {
        "@type": "Organization",
        name: sellerName,
      },
    };

    Object.keys(o).forEach((k) => (o[k] == null ? delete o[k] : null));
    return o;
  });

  // ✅ aggregateRating: 100% dinâmico (sem fallback fake)
  const avg = finalProductData.customerReviewAverage != null ? Number(finalProductData.customerReviewAverage) : null;
  const cnt = finalProductData.customerReviewCount != null ? Number(finalProductData.customerReviewCount) : null;
  const hasValidAggregate =
    Number.isFinite(avg) && avg > 0 && Number.isFinite(cnt) && cnt > 0;

  // ✅ optional review: only if expertReview exists
  const hasExpertReview =
    finalProductData.expertScore != null &&
    finalProductData.expertReview &&
    finalProductData.expertReview.error !== true &&
    finalProductData.expertReview.verdict &&
    String(finalProductData.expertReview.verdict).trim() !== "";

  const productJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "@id": `https://www.pricelab.tech/product/${finalProductData.slug}#product`,
    name: productName,
    url: canonical,
    image: uniqueImages.length ? uniqueImages : undefined,
    description: `Compare prices for ${productName} by ${brandName} in the United States.${
      offersArr.length ? ` Best available offer from $${lowPrice}.` : " Check availability across top US retailers."
    } Track price history and store availability in ${categoryName}.`,
    sku: finalProductData.sku || String(finalProductData.id),
    mpn: finalProductData.upc || finalProductData.sku || undefined,
    brand: {
      "@type": "Brand",
      name: brandName,
    },
    ...(gtin12 ? { gtin12 } : {}),
    ...(gtin13 ? { gtin13 } : {}),
    ...(gtin14 ? { gtin14 } : {}),
    audience: {
      "@type": "Audience",
      geographicArea: {
        "@type": "Country",
        name: "United States",
      },
    },
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: "PRICELAB",
      url: "https://www.pricelab.tech/",
    },

    offers: {
      "@type": "AggregateOffer",
      offerCount: offersArr.length,
      lowPrice,
      highPrice,
      priceCurrency: "USD",
      offers: offersJsonLd,
    },

    ...(hasValidAggregate
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avg,
            reviewCount: cnt,
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),

    ...(hasExpertReview
      ? {
          review: {
            "@type": "Review",
            itemReviewed: {
              "@type": "Product",
              "@id": `https://www.pricelab.tech/product/${finalProductData.slug}#product`,
            },
            reviewRating: {
              "@type": "Rating",
              ratingValue: Number(finalProductData.expertScore),
              bestRating: "10",
              worstRating: "1",
            },
            author: { "@type": "Organization", name: "PRICELAB AI Insights" },
            publisher: { "@type": "Organization", name: "PRICELAB" },
            datePublished: finalProductData.expertLastUpdated
              ? new Date(finalProductData.expertLastUpdated).toISOString()
              : new Date().toISOString(),
            reviewBody: safeText(finalProductData.expertReview.verdict, 5000),
          },
        }
      : {}),
  };

  // Clean undefined
  Object.keys(productJsonLd).forEach((k) => productJsonLd[k] === undefined && delete productJsonLd[k]);
  if (productJsonLd.offers) {
    Object.keys(productJsonLd.offers).forEach((k) => productJsonLd.offers[k] === undefined && delete productJsonLd.offers[k]);
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.pricelab.tech/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Categories",
        item: "https://www.pricelab.tech/categories",
      },
      ...(finalProductData.internalCategory
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: safeText(finalProductData.internalCategory, 80) || "Category",
              item: `https://www.pricelab.tech/category/${encodeURIComponent(finalProductData.internalCategory)}`,
            },
            {
              "@type": "ListItem",
              position: 4,
              name: productName,
              item: canonical,
            },
          ]
        : [
            {
              "@type": "ListItem",
              position: 3,
              name: productName,
              item: canonical,
            },
          ]),
    ],
  };

  return (
    <main id="main-content" className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <ProductPageClient initialProduct={finalProductData} />
    </main>
  );
}