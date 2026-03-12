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
  title: `Today's Top Deals in USA | Flash Sales & Price Drops ${currentYear} | COMPAREFLOW`,
  description: `Find today's best tech deals in the United States. COMPAREFLOW monitors price drops in real time across major retailers, helping you compare offers, check availability, and save money. Updated for ${currentYear}.`,
  alternates: {
    canonical: "https://www.compareflow.club/todays-deals",
    languages: {
      "en-US": "https://www.compareflow.club/todays-deals",
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
    title: `Today's Top Deals in USA | Flash Sales & Price Drops ${currentYear} | COMPAREFLOW`,
    description:
      "Don't miss today's real price drops. Compare offers, see availability, and jump straight to official retailers.",
    url: "https://www.compareflow.club/todays-deals",
    siteName: "COMPAREFLOW",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `Today's Top Deals in USA | COMPAREFLOW`,
    description: "Real-time deal feed for the US market. Verified price drops across major retailers.",
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
  if (c.includes("refurb") || c.includes("renewed") || c.includes("reconditioned") || c.includes("certified"))
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

  // Must stay in sync with API route logic (todays deals)
  const MIN_SALE_PRICE = 49;
  const MIN_SAVINGS = 20;

  // Baseline / confidence
  const BASELINE_WINDOW_DAYS = 30;
  const MIN_BASELINE_SAMPLES = 5;

  // ✅ Anti-overpriced
  const OVERPRICED_CONF_SAMPLES = 6;
  const OVERPRICED_PCT = 0.10;

  // ✅ TODAY detection (ranking boost only — NÃO filtra!)
  const DROP_WINDOW_HOURS = 24;
  const DROP_MIN_ABS = 5;
  const DROP_MIN_PCT = 0.02;
  const RECENT_DEDUPE_HOURS = 96;

  // Anti-manipulation
  const SPIKE_RATIO = 3.0;
  const SPIKE_RATIO_SOFT = 2.0;
  const SPIKE_DAYS_MAX_FOR_HARD_FLAG = 3;
  const TRUST_HARD = 0.1;
  const TRUST_SOFT = 0.6;
  const TRUST_OK = 1.0;

  // ✅ Boost de ranking quando caiu hoje (ajuste fino)
  const TODAY_BOOST = 12;

  try {
    /**
     * SQL RAW V28.1 - CONDITION PRIORITY + ANTI MANIPULATION + ANTI OVERPRICED + TODAY BOOST (NO HARD FILTER)
     *
     * ✅ Mudança crítica:
     * - dropped_recently NÃO é filtro. É somente boost de ranking.
     * Isso evita "sumir tudo" quando ainda não existe 2 coletas recentes por listing.
     *
     * ✅ Correção importante:
     * - adiciona final_score no payload inicial do SSR para ficar em total paridade com a API.
     */
    const products = await prisma.$queryRaw`
      WITH Hist30 AS (
        SELECT DISTINCT
          ph.listing_id,
          date_trunc('day', ph.captured_at) AS day,
          ph.price::numeric AS price
        FROM price_history ph
        WHERE ph.captured_at >= NOW() - INTERVAL '${BASELINE_WINDOW_DAYS} days'
      ),
      Baseline30 AS (
        SELECT
          listing_id,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS baseline_30d,
          COUNT(*)::integer AS samples_30d
        FROM Hist30
        GROUP BY listing_id
      ),
      SpikeDays AS (
        SELECT
          h.listing_id,
          COUNT(DISTINCT h.day)::integer AS spike_days_30d,
          MAX(h.price)::numeric AS max_price_30d
        FROM Hist30 h
        JOIN Baseline30 b ON b.listing_id = h.listing_id
        WHERE b.baseline_30d IS NOT NULL
          AND b.baseline_30d > 0
          AND h.price >= (b.baseline_30d * ${SPIKE_RATIO_SOFT}::numeric)
        GROUP BY h.listing_id
      ),

      -- Histórico recente dedupe por hora+preço
      HistRecent AS (
        SELECT DISTINCT ON (ph.listing_id, date_trunc('hour', ph.captured_at), ph.price)
          ph.listing_id,
          ph.captured_at,
          ph.price::numeric AS price
        FROM price_history ph
        WHERE ph.captured_at >= NOW() - INTERVAL '${RECENT_DEDUPE_HOURS} hours'
        ORDER BY ph.listing_id, date_trunc('hour', ph.captured_at), ph.price, ph.captured_at DESC
      ),
      RankedRecent AS (
        SELECT
          listing_id,
          captured_at,
          price,
          ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY captured_at DESC) AS rn
        FROM HistRecent
      ),
      LastTwo AS (
        SELECT
          r1.listing_id,
          r1.price AS last_price,
          r1.captured_at AS last_captured_at,
          r2.price AS prev_price,
          r2.captured_at AS prev_captured_at
        FROM RankedRecent r1
        LEFT JOIN RankedRecent r2
          ON r2.listing_id = r1.listing_id
         AND r2.rn = 2
        WHERE r1.rn = 1
      ),
      TodayDrop AS (
        SELECT
          listing_id,
          last_price,
          prev_price,
          last_captured_at,
          prev_captured_at,
          CASE
            WHEN prev_price IS NULL OR prev_price <= 0 THEN false
            WHEN last_captured_at < NOW() - INTERVAL '${DROP_WINDOW_HOURS} hours' THEN false
            WHEN last_price >= prev_price THEN false
            WHEN (prev_price - last_price) < ${DROP_MIN_ABS}::numeric
              AND ((prev_price - last_price) / prev_price) < ${DROP_MIN_PCT}::numeric
            THEN false
            ELSE true
          END AS dropped_recently,
          (prev_price - last_price) AS drop_amount,
          CASE
            WHEN prev_price IS NOT NULL AND prev_price > 0 THEN ((prev_price - last_price) / prev_price)
            ELSE NULL
          END AS drop_pct
        FROM LastTwo
      ),

      BestOffer AS (
        SELECT DISTINCT ON (p.normalized_model_key)
          p.id AS product_id,
          l.id AS listing_id,
          l.sku,
          l.sale_price::numeric AS sale_price,
          l.regular_price::numeric AS listing_regular_price,
          l.affiliate_url,
          l.image AS listing_image,
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
          b.baseline_30d,
          b.samples_30d,
          COALESCE(s.spike_days_30d, 0)::integer AS spike_days_30d,
          COALESCE(s.max_price_30d, 0)::numeric AS max_price_30d,
          COALESCE(td.dropped_recently, false) AS dropped_recently,
          td.drop_amount::numeric AS drop_amount,
          td.drop_pct::numeric AS drop_pct,
          td.last_captured_at AS last_price_at
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        LEFT JOIN Baseline30 b ON b.listing_id = l.id
        LEFT JOIN SpikeDays s ON s.listing_id = l.id
        LEFT JOIN TodayDrop td ON td.listing_id = l.id
        WHERE l.is_expired = false
          AND l.online_availability = true
          AND l.sale_price >= ${MIN_SALE_PRICE}::numeric
          AND p.name NOT ILIKE '%capinha%'
          AND p.name NOT ILIKE '%case %'
          AND p.name NOT ILIKE '%cover%'
          AND p.name NOT ILIKE '%pelicula%'
          AND p.name NOT ILIKE '%cabo %'
          AND p.name NOT ILIKE '%cable%'
          AND p.name NOT ILIKE '%adapter%'
          AND p.name NOT ILIKE '%screen protector%'
          AND p.name NOT ILIKE '%fone de ouvido%'
        ORDER BY
          p.normalized_model_key,
          CASE
            WHEN l.condition ILIKE '%new%' THEN 0
            WHEN l.condition ILIKE '%open%' AND l.condition ILIKE '%box%' THEN 1
            WHEN l.condition ILIKE '%refurb%' OR l.condition ILIKE '%renewed%' OR l.condition ILIKE '%reconditioned%' OR l.condition ILIKE '%certified%' THEN 2
            WHEN l.condition ILIKE '%used%' OR l.condition ILIKE '%pre-owned%' OR l.condition ILIKE '%preowned%' THEN 3
            ELSE 4
          END ASC,
          l.sale_price ASC
      ),

      DealsCalculation AS (
        SELECT
          *,
          CASE
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${MIN_BASELINE_SAMPLES}::integer
              THEN baseline_30d
            WHEN listing_regular_price IS NOT NULL AND listing_regular_price > 0
              THEN listing_regular_price
            ELSE sale_price
          END AS reference_price,

          (
            (
              CASE
                WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${MIN_BASELINE_SAMPLES}::integer
                  THEN baseline_30d
                WHEN listing_regular_price IS NOT NULL AND listing_regular_price > 0
                  THEN listing_regular_price
                ELSE sale_price
              END
            ) - sale_price
          ) AS savings,

          CASE
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 THEN (max_price_30d / baseline_30d)
            ELSE NULL
          END AS max_to_baseline_ratio,

          CASE
            WHEN baseline_30d IS NOT NULL
              AND baseline_30d > 0
              AND samples_30d >= ${OVERPRICED_CONF_SAMPLES}::integer
              AND sale_price > (baseline_30d * ${(1 + OVERPRICED_PCT).toFixed(2)}::numeric)
            THEN true
            ELSE false
          END AS is_overpriced_confident
        FROM BestOffer
      ),

      DealsFiltered AS (
        SELECT
          *,
          CASE
            WHEN reference_price > 0 THEN ROUND(((reference_price - sale_price) / reference_price) * 100)
            ELSE 0
          END AS discount_percent,

          CASE
            WHEN max_to_baseline_ratio IS NOT NULL
              AND max_to_baseline_ratio >= ${SPIKE_RATIO}::numeric
              AND spike_days_30d <= ${SPIKE_DAYS_MAX_FOR_HARD_FLAG}::integer
            THEN ${TRUST_HARD}::numeric

            WHEN max_to_baseline_ratio IS NOT NULL
              AND max_to_baseline_ratio >= ${SPIKE_RATIO_SOFT}::numeric
              AND spike_days_30d >= 4
            THEN ${TRUST_SOFT}::numeric

            ELSE ${TRUST_OK}::numeric
          END AS trust_multiplier
        FROM DealsCalculation
        WHERE reference_price > sale_price
          AND (reference_price - sale_price) >= ${MIN_SAVINGS}::numeric
          AND is_overpriced_confident = false
      ),

      FinalDeals AS (
        SELECT
          *,
          (discount_percent * trust_multiplier) AS deal_score,
          (
            (discount_percent * trust_multiplier) +
            (CASE WHEN dropped_recently THEN ${TODAY_BOOST}::numeric ELSE 0::numeric END)
          ) AS final_score
        FROM DealsFiltered
      )

      SELECT * FROM FinalDeals
      ORDER BY
        dropped_recently DESC,
        drop_pct DESC NULLS LAST,
        drop_amount DESC NULLS LAST,
        final_score DESC,
        discount_percent DESC,
        sale_price ASC
      LIMIT ${itemsPerPage}
    `;

    /**
     * CONTADOR DE PÁGINAS COM PARIDADE TOTAL (V28.1)
     * - Replica o pipeline essencial (sem filtro hard de dropped_recently).
     * - Mantém exatamente a mesma lógica estrutural da API.
     */
    const countResult = await prisma.$queryRaw`
      WITH Hist30 AS (
        SELECT DISTINCT
          ph.listing_id,
          date_trunc('day', ph.captured_at) AS day,
          ph.price::numeric AS price
        FROM price_history ph
        WHERE ph.captured_at >= NOW() - INTERVAL '${BASELINE_WINDOW_DAYS} days'
      ),
      Baseline30 AS (
        SELECT
          listing_id,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS baseline_30d,
          COUNT(*)::integer AS samples_30d
        FROM Hist30
        GROUP BY listing_id
      ),
      BestOffer AS (
        SELECT DISTINCT ON (p.normalized_model_key)
          l.sale_price::numeric AS sale_price,
          l.regular_price::numeric AS listing_regular_price,
          b.baseline_30d,
          b.samples_30d
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        LEFT JOIN Baseline30 b ON b.listing_id = l.id
        WHERE l.is_expired = false
          AND l.online_availability = true
          AND l.sale_price >= ${MIN_SALE_PRICE}::numeric
          AND p.name NOT ILIKE '%capinha%'
          AND p.name NOT ILIKE '%case %'
          AND p.name NOT ILIKE '%cover%'
          AND p.name NOT ILIKE '%pelicula%'
          AND p.name NOT ILIKE '%cabo %'
          AND p.name NOT ILIKE '%cable%'
          AND p.name NOT ILIKE '%adapter%'
          AND p.name NOT ILIKE '%screen protector%'
          AND p.name NOT ILIKE '%fone de ouvido%'
        ORDER BY
          p.normalized_model_key,
          CASE
            WHEN l.condition ILIKE '%new%' THEN 0
            WHEN l.condition ILIKE '%open%' AND l.condition ILIKE '%box%' THEN 1
            WHEN l.condition ILIKE '%refurb%' OR l.condition ILIKE '%renewed%' OR l.condition ILIKE '%reconditioned%' OR l.condition ILIKE '%certified%' THEN 2
            WHEN l.condition ILIKE '%used%' OR l.condition ILIKE '%pre-owned%' OR l.condition ILIKE '%preowned%' THEN 3
            ELSE 4
          END ASC,
          l.sale_price ASC
      ),
      DealsCount AS (
        SELECT 1
        FROM BestOffer
        WHERE
          (
            CASE
              WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${MIN_BASELINE_SAMPLES}::integer
                THEN baseline_30d
              WHEN listing_regular_price IS NOT NULL AND listing_regular_price > 0
                THEN listing_regular_price
              ELSE sale_price
            END
          ) > sale_price
          AND (
            (
              CASE
                WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${MIN_BASELINE_SAMPLES}::integer
                  THEN baseline_30d
                WHEN listing_regular_price IS NOT NULL AND listing_regular_price > 0
                  THEN listing_regular_price
                ELSE sale_price
              END
            ) - sale_price
          ) >= ${MIN_SAVINGS}::numeric
          AND NOT (
            baseline_30d IS NOT NULL
            AND baseline_30d > 0
            AND samples_30d >= ${OVERPRICED_CONF_SAMPLES}::integer
            AND sale_price > (baseline_30d * ${(1 + OVERPRICED_PCT).toFixed(2)}::numeric)
          )
      )
      SELECT COUNT(*)::integer AS total FROM DealsCount
    `;

    const totalItems = Number(countResult?.[0]?.total || 0);
    initialTotalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

    // DTO Explícito para barrar vazamento de chaves de DB (id, listing_id)
    // E esconder os parâmetros de cálculo do algoritmo
    initialDeals = (products || []).map((p) => {
      const sale = normalizePrice(p.sale_price);
      const regular = normalizePrice(p.reference_price);
      const percent = Number(p.discount_percent || 0);

      return {
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
    console.error("❌ Deals Server Error (V28.1):", error);
    initialDeals = [];
    initialTotalPages = 1;
  }

  /**
   * JSON-LD (Today’s Deals) — US-first
   * - BreadcrumbList
   * - CollectionPage + ItemList of Products (each with Offer)
   */
  const canonical = "https://www.compareflow.club/todays-deals";
  const pageName = `Today's Top Deals in USA`;
  const pageDescription = `Live deal feed for the United States. Compare prices, check availability, and find real price drops across major retailers. Updated for ${currentYear}.`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.compareflow.club/" },
      { "@type": "ListItem", position: 2, name: "Today's Deals", item: canonical },
    ],
  };

  const itemListElement = (initialDeals || []).slice(0, itemsPerPage).map((d, idx) => {
    const productUrl = `https://www.compareflow.club/product/${encodeURIComponent(d.slug)}`;
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
    name: `${pageName} | COMPAREFLOW`,
    description: pageDescription,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: "COMPAREFLOW",
      url: "https://www.compareflow.club/",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(todayDealsJsonLd) }}
      />

      <DealsClient initialData={initialDeals} initialTotalPages={initialTotalPages} />
    </>
  );
}