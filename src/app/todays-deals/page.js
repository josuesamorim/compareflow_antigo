// app/todays-deals/page.js
import DealsClient from "./DealsClient.js";
import { prisma } from "../../lib/prisma.js";

const currentYear = new Date().getFullYear();

/**
 * SEO METADATA (US-first)
 * - canonical + alternates (en-US)
 * - robots googleBot rich preview
 * - OG/Twitter
 */
export const metadata = {
  title: `Today's Top Deals in USA | Flash Sales & Price Drops ${currentYear} | PRICELAB`,
  description: `Find today's best tech deals in the United States. PRICELAB monitors price drops in real time across major retailers, helping you compare offers, check availability, and save money. Updated for ${currentYear}.`,
  alternates: {
    canonical: "https://pricelab.tech/todays-deals",
    languages: {
      "en-US": "https://pricelab.tech/todays-deals",
    },
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
  openGraph: {
    title: `Today's Top Deals in USA | Flash Sales & Price Drops ${currentYear} | PRICELAB`,
    description:
      "Don't miss today's real price drops. Compare offers, see availability, and jump straight to official retailers.",
    url: "https://pricelab.tech/todays-deals",
    siteName: "PRICELAB",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `Today's Top Deals in USA | PRICELAB`,
    description:
      "Real-time deal feed for the US market. Verified price drops across major retailers.",
  },
};

/**
 * CONFIGURAÇÃO ISR (1 HORA)
 * Revalida o cache a cada hora para garantir que ofertas expiradas sumam do servidor.
 */
export const revalidate = 3600;

/**
 * Helpers (SEO + JSON-LD safe)
 */
function safeText(v, max = 180) {
  if (v == null) return "";
  const s = String(v).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function safeBrandName(brand) {
  const b = safeText(brand, 80);
  return b || null;
}

function normalizePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeConditionToSchemaUrl(cond) {
  const c = (cond ?? "").toString().trim().toLowerCase();
  if (!c) return "https://schema.org/NewCondition";
  if (c === "new" || c.includes("brand new")) return "https://schema.org/NewCondition";
  if (
    c.includes("refurb") ||
    c.includes("renewed") ||
    c.includes("reconditioned") ||
    c.includes("certified")
  )
    return "https://schema.org/RefurbishedCondition";
  if (c.includes("open") && c.includes("box")) return "https://schema.org/UsedCondition";
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned"))
    return "https://schema.org/UsedCondition";
  return "https://schema.org/NewCondition";
}

function normalizeAvailabilityToSchemaUrl({ isExpired, onlineAvailability } = {}) {
  const expired = Boolean(isExpired);
  const inStock = Boolean(onlineAvailability);
  return !expired && inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
}

/**
 * ✅ GTIN/UPC validation (length + check digit) — GS1
 * - gtin12: UPC-A (12)
 * - gtin13: EAN-13 (13)
 * - gtin14: GTIN-14 (14)
 */
function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

function isValidGtin(digits) {
  const ds = digitsOnly(digits);
  if (!(ds.length === 12 || ds.length === 13 || ds.length === 14)) return false;

  const arr = ds.split("").map((x) => Number(x));
  if (arr.some((n) => !Number.isFinite(n))) return false;

  const checkDigit = arr[arr.length - 1];
  const body = arr.slice(0, -1);

  // From rightmost of body: weights alternate 3/1
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
 * ✅ Remove keys undefined/null (limpeza forte pro JSON-LD)
 */
function stripNil(obj) {
  if (!obj || typeof obj !== "object") return obj;
  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined || obj[k] === null || obj[k] === "") delete obj[k];
  });
  return obj;
}

/**
 * ✅ Price validity conservadora (evita “mentir” e padroniza)
 */
function priceValidUntilISO(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function Page() {
  let initialDeals = [];
  let initialTotalPages = 1;
  const itemsPerPage = 12;

  try {
    /**
     * SQL RAW V25 - CURADORIA DE ELITE
     * - Agrupamento por normalized_model_key para evitar duplicidade de modelos.
     * - Filtros de exclusão agressivos para manter o feed limpo.
     *
     * ✅ SEO additions:
     * - condition + availability flags (for Offer JSON-LD)
     * ✅ GTIN additions:
     * - p.upc (para gtin12/gtin13/gtin14 quando válido)
     */
    const products = await prisma.$queryRaw`
      WITH SixMonthMax AS (
        SELECT 
          listing_id, 
          MAX(price) as max_price_6m
        FROM price_history
        WHERE captured_at >= NOW() - INTERVAL '6 months'
        GROUP BY listing_id
      ),
      BestOffer AS (
        SELECT DISTINCT ON (p.normalized_model_key)
          p.id as product_id,
          l.id as listing_id,
          l.sku,
          l.sale_price,
          l.regular_price,
          l.affiliate_url,
          l.image as listing_image,
          l.store,
          l.condition,
          l.online_availability,
          l.is_expired,
          p.name,
          p.slug,
          p.brand,
          p.upc,
          p.internal_category,
          p.normalized_model_key,
          COALESCE(h.max_price_6m, l.regular_price, l.sale_price) as reference_price
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        LEFT JOIN SixMonthMax h ON l.id = h.listing_id
        WHERE l.is_expired = false 
          AND l.online_availability = true
          AND l.sale_price >= 49
          AND p.name NOT ILIKE '%capinha%'
          AND p.name NOT ILIKE '%case %'
          AND p.name NOT ILIKE '%cover%'
          AND p.name NOT ILIKE '%pelicula%'
          AND p.name NOT ILIKE '%cabo %'
          AND p.name NOT ILIKE '%cable%'
          AND p.name NOT ILIKE '%adapter%'
          AND p.name NOT ILIKE '%screen protector%'
          AND p.name NOT ILIKE '%fone de ouvido%'
        ORDER BY p.normalized_model_key, l.sale_price ASC
      ),
      DealsCalculation AS (
        SELECT 
          *,
          ROUND(((reference_price - sale_price) / reference_price) * 100) as discount_percent
        FROM BestOffer
        WHERE reference_price > sale_price
          AND (reference_price - sale_price) >= 20
      )
      SELECT * FROM DealsCalculation
      ORDER BY discount_percent DESC, sale_price ASC
      LIMIT ${itemsPerPage}
    `;

    /**
     * CONTADOR DE PÁGINAS COM PARIDADE TOTAL (V25)
     */
    const countResult = await prisma.$queryRaw`
      WITH SixMonthMax AS (
        SELECT listing_id, MAX(price) as max_price_6m
        FROM price_history
        WHERE captured_at >= NOW() - INTERVAL '6 months'
        GROUP BY listing_id
      ),
      BestOffer AS (
        SELECT DISTINCT ON (p.normalized_model_key)
          l.sale_price,
          COALESCE(h.max_price_6m, l.regular_price, l.sale_price) as reference_price
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        LEFT JOIN SixMonthMax h ON l.id = h.listing_id
        WHERE l.is_expired = false 
          AND l.online_availability = true
          AND l.sale_price >= 49
          AND p.name NOT ILIKE '%capinha%'
          AND p.name NOT ILIKE '%case %'
          AND p.name NOT ILIKE '%cover%'
          AND p.name NOT ILIKE '%pelicula%'
          AND p.name NOT ILIKE '%cabo %'
          AND p.name NOT ILIKE '%cable%'
          AND p.name NOT ILIKE '%adapter%'
          AND p.name NOT ILIKE '%screen protector%'
          AND p.name NOT ILIKE '%fone de ouvido%'
        ORDER BY p.normalized_model_key, l.sale_price ASC
      ),
      FinalDealsCount AS (
        SELECT 1
        FROM BestOffer
        WHERE reference_price > sale_price
          AND (reference_price - sale_price) >= 20
      )
      SELECT COUNT(*)::integer as total FROM FinalDealsCount
    `;

    const totalItems = Number(countResult[0]?.total || 0);
    initialTotalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    initialDeals = products.map((p) => {
      const sale = normalizePrice(p.sale_price);
      const regular = normalizePrice(p.reference_price);
      const percent = Number(p.discount_percent || 0);

      return {
        id: p.product_id.toString(),
        sku: p.sku,
        name: p.name,
        image: p.listing_image || "/placeholder-deal.jpg",
        slug: p.slug,
        brand: p.brand,
        upc: p.upc || null,
        salePrice: sale,
        regularPrice: regular,
        affiliateUrl: p.affiliate_url,
        discountPercent: percent,
        discountLabel: percent > 0 ? `${percent}% OFF` : null,
        store: p.store,
        condition: p.condition,
        onlineAvailability: Boolean(p.online_availability),
        isExpired: Boolean(p.is_expired),
        internalCategory: p.internal_category || null,
      };
    });
  } catch (error) {
    console.error("❌ Deals Server Error (V25):", error);
    initialDeals = [];
    initialTotalPages = 1;
  }

  /**
   * JSON-LD (Today’s Deals) — US-first
   * - BreadcrumbList (helps sitelinks + category context)
   * - CollectionPage + ItemList of Products (each with Offer, availability, condition, seller)
   * - Audience US + inLanguage en-US
   *
   * ✅ GTIN improvements:
   * - gtin12/gtin13/gtin14 ONLY if valid checksum
   *
   * ✅ Offer improvements:
   * - priceValidUntil (conservador)
   * - não envia price=0 para OutOfStock/price inválido
   * - limpeza agressiva de undefined/null
   */
  const canonical = "https://pricelab.tech/todays-deals";
  const pageName = `Today's Top Deals in USA`;
  const pageDescription = `Live deal feed for the United States. Compare prices, check availability, and find real price drops across major retailers. Updated for ${currentYear}.`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://pricelab.tech/" },
      { "@type": "ListItem", position: 2, name: "Today's Deals", item: canonical },
    ],
  };

  const itemListElement = (initialDeals || []).slice(0, itemsPerPage).map((d, idx) => {
    const productUrl = `https://pricelab.tech/product/${encodeURIComponent(d.slug)}`;
    const brandName = safeBrandName(d.brand) || "Top Brands";

    const rawUpc = d.upc || null;
    const gtin12 = safeGtin12(rawUpc);
    const gtin13 = !gtin12 ? safeGtin13(rawUpc) : null;
    const gtin14 = !gtin12 && !gtin13 ? safeGtin14(rawUpc) : null;

    const availability = normalizeAvailabilityToSchemaUrl(d);
    const isInStock = availability === "https://schema.org/InStock";
    const price = normalizePrice(d.salePrice);
    const hasValidPrice = Number.isFinite(price) && price > 0;

    const offer = stripNil({
      "@type": "Offer",
      url: d.affiliateUrl || productUrl,
      priceCurrency: "USD",
      availability,
      itemCondition: normalizeConditionToSchemaUrl(d.condition),
      priceValidUntil: priceValidUntilISO(7),
      seller: {
        "@type": "Organization",
        name: safeText(d.store, 60) || "Retailer",
      },
      ...(isInStock && hasValidPrice ? { price } : {}),
    });

    const productJsonLd = stripNil({
      "@type": "Product",
      "@id": `${productUrl}#product`,
      name: safeText(d.name, 140) || "Product",
      url: productUrl,
      image: d.image ? [d.image] : undefined,
      brand: { "@type": "Brand", name: brandName },
      sku: d.sku ? String(d.sku) : undefined,
      ...(gtin12 ? { gtin12 } : {}),
      ...(gtin13 ? { gtin13 } : {}),
      ...(gtin14 ? { gtin14 } : {}),
      offers: offer,
    });

    return {
      "@type": "ListItem",
      position: idx + 1,
      item: productJsonLd,
    };
  });

  const todayDealsJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#collection`,
    url: canonical,
    name: `${pageName} | PRICELAB`,
    description: pageDescription,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: "PRICELAB",
      url: "https://pricelab.tech/",
    },
    audience: {
      "@type": "Audience",
      geographicArea: {
        "@type": "Country",
        name: "United States",
      },
    },
    mainEntity: {
      "@type": "ItemList",
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      numberOfItems: itemListElement.length,
      itemListElement,
    },
  };

  // clean undefined
  stripNil(todayDealsJsonLd);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(todayDealsJsonLd) }} />

      <DealsClient initialData={initialDeals} initialTotalPages={initialTotalPages} />
    </>
  );
}