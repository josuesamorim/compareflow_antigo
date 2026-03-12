import HomeClient from "../components/HomeClient.js";
import { prisma } from "../lib/prisma.js";

export const revalidate = 3600;

/**
 * Helpers (SEO + JSON-LD safe)
 */
function safeText(v, max = 300) {
  if (v == null) return "";
  const s = String(v)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, "")
    .trim();

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
 * GTIN validation (length + check digit)
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

function normalizeConditionToSchemaUrl(cond) {
  const c = (cond ?? "").toString().trim().toLowerCase();

  if (!c) return "https://schema.org/NewCondition";
  if (c === "new" || c.includes("brand new")) {
    return "https://schema.org/NewCondition";
  }
  if (
    c.includes("refurb") ||
    c.includes("renewed") ||
    c.includes("reconditioned") ||
    c.includes("certified")
  ) {
    return "https://schema.org/RefurbishedCondition";
  }
  if (c.includes("open") && c.includes("box")) {
    return "https://schema.org/UsedCondition";
  }
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned")) {
    return "https://schema.org/UsedCondition";
  }

  return "https://schema.org/NewCondition";
}

function normalizeAvailabilityToSchemaUrl(isInStock) {
  return isInStock
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

function normalizePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function Page() {
  async function getInitialDeals(category, limit = 4) {
    try {
      const blockedBrandsArray = [
        "AMPD",
        "Anker",
        "Backbone",
        "Baseus",
        "Beats",
        "Belkin",
        "Bellroy",
        "Best Buy essentials™",
        "Bracketron",
        "Canon",
        "Case-Mate",
        "CASETiFY",
        "Chargeworx",
        "Cobra",
        "dbrand",
        "DJI",
        "EcoFlow",
        "Energizer",
        "Escort",
        "FLAUNT",
        "Fremo",
        "Fujifilm",
        "HOCO",
        "INIU",
        "Insignia™",
        "iOttie",
        "Jackery",
        "JOBY",
        "JOURNEY",
        "kate spade new york",
        "KeySmart",
        "Kodak",
        "LAUT",
        "Liene",
        "Lively®",
        "Mint Mobile",
        "mophie",
        "myCharge",
        "Native Union",
        "NETGEAR",
        "Nimble",
        "Octobuddy",
        "OhSnap",
        "OtterBox",
        "Peak Design",
        "Pelican",
        "PopSockets",
        "REL",
        "Rexing",
        "SaharaCase",
        "Scosche",
        "Shure",
        "SIMO",
        "Simple Mobile",
        "Speck",
        "Spigen",
        "SureCall",
        "Tech21",
        "The Ridge Wallet",
        "TORRAS",
        "Total Wireless",
        "Tracfone",
        "Twelve South",
        "UAG",
        "UGREEN",
        "Ultra Mobile",
        "UltraLast",
        "Unplugged",
        "VELVET CAVIAR",
        "Verizon",
        "Visible",
        "weBoost",
        "WORX",
        "XREAL",
        "ZAGG",
        "Storm",
      ];

      const rawResult = await prisma.$queryRaw`
        WITH TargetProducts AS (
          SELECT
            p.id,
            p.name,
            p.brand,
            p.slug,
            p.internal_category,
            p.upc
          FROM products p
          WHERE p.internal_category = ${category}::TEXT
            AND p.brand IS NOT NULL
            AND p.brand <> ''
            AND NOT (p.brand::TEXT = ANY(${blockedBrandsArray}::TEXT[]))

            -- Filtro geral de ruído
            AND p.name IS NOT NULL
            AND p.name <> ''
            AND p.name NOT ILIKE '%applecare%'
            AND p.name NOT ILIKE '%protection plan%'
            AND p.name NOT ILIKE '%membership%'
            AND p.name NOT ILIKE '%gift card%'
            AND p.name NOT ILIKE '%subscription%'
            AND p.name NOT ILIKE '%service plan%'
            AND p.name NOT ILIKE '%warranty%'
            AND p.name NOT ILIKE '%mint%'
            AND p.name NOT ILIKE '%kit%'

            -- Excluir acessórios / itens correlatos em geral
            AND p.name NOT ILIKE '%case%'
            AND p.name NOT ILIKE '%weboost%'
            AND p.name NOT ILIKE '%cover%'
            AND p.name NOT ILIKE '%protector%'
            AND p.name NOT ILIKE '%screen protector%'
            AND p.name NOT ILIKE '%glass%'
            AND p.name NOT ILIKE '%cable%'
            AND p.name NOT ILIKE '%adapter%'
            AND p.name NOT ILIKE '%strap%'
            AND p.name NOT ILIKE '%mount%'
            AND p.name NOT ILIKE '%stand%'
            AND p.name NOT ILIKE '%dock%'
            AND p.name NOT ILIKE '%hub%'
            AND p.name NOT ILIKE '%charger%'
            AND p.name NOT ILIKE '%battery pack%'
            AND p.name NOT ILIKE '%power bank%'
            AND p.name NOT ILIKE '%backpack%'
            AND p.name NOT ILIKE '%bag%'
            AND p.name NOT ILIKE '%sleeve%'

            -- Filtro semântico por categoria para home
            AND (
              (
                p.internal_category = 'smartphones'
                AND (
                  p.name ILIKE '%iphone%'
                  OR p.name ILIKE '%galaxy%'
                  OR p.name ILIKE '%pixel%'
                  OR p.name ILIKE '%motorola%'
                  OR p.name ILIKE '%moto %'
                  OR p.name ILIKE '%oneplus%'
                  OR p.name ILIKE '%xiaomi%'
                  OR p.name ILIKE '%phone%'
                  OR p.name ILIKE '%smartphone%'
                )
                AND p.name NOT ILIKE '%power station%'
                AND p.name NOT ILIKE '%tablet%'
                AND p.name NOT ILIKE '%watch%'
                AND p.name NOT ILIKE '%earbuds%'
                AND p.name NOT ILIKE '%headphones%'
              )
              OR
              (
                p.internal_category = 'tvs'
                AND (
                  p.name ILIKE '%tv%'
                  OR p.name ILIKE '%smart tv%'
                  OR p.name ILIKE '%oled%'
                  OR p.name ILIKE '%qled%'
                  OR p.name ILIKE '%uhd%'
                  OR p.name ILIKE '%4k%'
                  OR p.name ILIKE '%8k%'
                )
                AND p.name NOT ILIKE '%soundbar%'
                AND p.name NOT ILIKE '%speaker%'
                AND p.name NOT ILIKE '%subwoofer%'
                AND p.name NOT ILIKE '%receiver%'
                AND p.name NOT ILIKE '%amplifier%'
                AND p.name NOT ILIKE '%mount%'
                AND p.name NOT ILIKE '%streaming%'
              )
              OR
              (
                p.internal_category = 'laptops'
                AND (
                  p.name ILIKE '%laptop%'
                  OR p.name ILIKE '%notebook%'
                  OR p.name ILIKE '%chromebook%'
                  OR p.name ILIKE '%macbook%'
                )
                AND p.name NOT ILIKE '%memory%'
                AND p.name NOT ILIKE '%ram%'
                AND p.name NOT ILIKE '%ssd%'
                AND p.name NOT ILIKE '%bed desk%'
                AND p.name NOT ILIKE '%desk%'
                AND p.name NOT ILIKE '%keyboard%'
                AND p.name NOT ILIKE '%mouse%'
                AND p.name NOT ILIKE '%dock%'
              )
            )
        ),

        BestListings AS (
          SELECT DISTINCT ON (l.product_id)
            l.id AS listing_id,
            l.product_id,
            l.sku,
            l.sale_price,
            l.regular_price,
            l.image AS listing_image,
            l.store,
            l.condition,
            l.online_availability,
            l.is_expired,
            l.url,
            l.affiliate_url
          FROM listings l
          INNER JOIN TargetProducts tp ON tp.id = l.product_id
          WHERE l.is_expired = false
            AND l.online_availability = true
            AND l.sale_price > 15
            AND l.image IS NOT NULL
            AND l.image <> ''
            AND l.image NOT LIKE '%placeholder%'
            AND (
              (tp.internal_category = 'smartphones' AND l.sale_price >= 199)
              OR (tp.internal_category = 'tvs' AND l.sale_price >= 249)
              OR (tp.internal_category = 'laptops' AND l.sale_price >= 299)
            )
          ORDER BY l.product_id, l.sale_price ASC
        ),

        AvgPriceHistory AS (
          SELECT
            ph.listing_id,
            AVG(ph.price) AS historic_avg
          FROM price_history ph
          INNER JOIN BestListings bl ON bl.listing_id = ph.listing_id
          WHERE ph.captured_at >= NOW() - INTERVAL '30 days'
          GROUP BY ph.listing_id
        ),

        CleanProducts AS (
          SELECT
            tp.id AS product_id,
            tp.name,
            tp.brand,
            tp.slug,
            tp.internal_category,
            tp.upc,
            bl.sale_price,
            bl.regular_price,
            bl.listing_image,
            bl.store,
            bl.condition,
            bl.online_availability,
            bl.is_expired,
            bl.affiliate_url,
            COALESCE(ph.historic_avg, bl.sale_price) AS avg_price,
            CASE
              WHEN COALESCE(ph.historic_avg, 0) > 0
                THEN bl.sale_price / COALESCE(ph.historic_avg, bl.sale_price)
              ELSE 1
            END AS price_ratio
          FROM TargetProducts tp
          INNER JOIN BestListings bl ON bl.product_id = tp.id
          LEFT JOIN AvgPriceHistory ph ON ph.listing_id = bl.listing_id
          WHERE
            (
              tp.internal_category = 'laptops'
              AND bl.sale_price <= COALESCE(ph.historic_avg * 1.08, bl.sale_price)
            )
            OR
            (
              tp.internal_category <> 'laptops'
              AND bl.sale_price <= COALESCE(ph.historic_avg, bl.sale_price)
            )
        ),

        RankedProducts AS (
          SELECT
            cp.*,
            ROW_NUMBER() OVER (
              PARTITION BY
                CASE
                  WHEN cp.internal_category = 'laptops'
                    THEN cp.slug
                  ELSE cp.brand
                END
              ORDER BY cp.price_ratio ASC, cp.sale_price ASC
            ) AS rn
          FROM CleanProducts cp
        )

        SELECT
          name,
          listing_image,
          slug,
          brand,
          upc,
          sale_price,
          regular_price,
          internal_category,
          avg_price,
          price_ratio,
          store,
          condition,
          online_availability,
          is_expired,
          affiliate_url
        FROM RankedProducts
        WHERE rn = 1
        ORDER BY price_ratio ASC, sale_price ASC
        LIMIT ${category === "laptops" ? 8 : limit}
      `;

      const formattedItems = rawResult.map((p) => {
        const brandRaw = p.brand || "Deal";
        const firstWord = brandRaw.trim().split(/\s+/)[0] || "Deal";
        const cleanBrand = firstWord.replace(/[^a-zA-Z0-9]/g, "");

        const avgPriceNum = Number(p.avg_price);
        const salePriceNum = Number(p.sale_price);
        const regularPriceNum = Number(p.regular_price);

        const diff =
          avgPriceNum > 0
            ? ((salePriceNum - avgPriceNum) / avgPriceNum) * 100
            : 0;

        return {
          name: p.name,
          image: p.listing_image,
          slug: p.slug,
          brand: cleanBrand || firstWord || "Deal",
          salePrice: salePriceNum,
          regularPrice: regularPriceNum,
          avgPrice: avgPriceNum,
          store: p.store,
          condition: p.condition,
          onlineAvailability: Boolean(p.online_availability),
          isExpired: Boolean(p.is_expired),
          upc: p.upc,
          affiliateUrl: p.affiliate_url,
          priceStatus:
            diff <= -5 ? "Great Deal" : diff < 0 ? "Good Price" : "Fair Price",
          internalCategory: p.internal_category
            ? p.internal_category.replace(/-/g, " ")
            : "Electronics",
          discountLabel:
            regularPriceNum > salePriceNum
              ? `${Math.round(
                  ((regularPriceNum - salePriceNum) / regularPriceNum) * 100,
                )}% OFF`
              : null,
        };
      });

      return {
        items:
          category === "laptops"
            ? formattedItems.slice(0, limit)
            : formattedItems.slice(0, limit),
      };
    } catch (e) {
      console.error(`❌ Erro SQL na Home para ${category}:`, e);
      return { items: [] };
    }
  }

  const [smartphonesData, tvsData, laptopsData] = await Promise.all([
    getInitialDeals("smartphones"),
    getInitialDeals("tvs"),
    getInitialDeals("laptops"),
  ]);

  const initialData = {
    smartphones: smartphonesData?.items || [],
    tvs: tvsData?.items || [],
    laptops: laptopsData?.items || [],
  };

  /**
   * ---------------- SEO / JSON-LD (HOME) ----------------
   */
  const siteUrl = "https://www.compareflow.club/";
  const homeUrl = "https://www.compareflow.club/";
  const nowIso = new Date().toISOString();

  const featured = [
    ...(initialData.smartphones || []).slice(0, 4),
    ...(initialData.tvs || []).slice(0, 4),
    ...(initialData.laptops || []).slice(0, 4),
  ].slice(0, 12);

  const featuredItemList = featured.map((p, idx) => {
    const productUrl = `https://www.compareflow.club/product/${encodeURIComponent(
      p.slug,
    )}`;
    const brandName = safeBrandName(p.brand) || "Top Brands";

    const rawUpc = p.upc || null;
    const gtin12 = safeGtin12(rawUpc);
    const gtin13 = !gtin12 ? safeGtin13(rawUpc) : null;
    const gtin14 = !gtin12 && !gtin13 ? safeGtin14(rawUpc) : null;

    const offerAvailability = normalizeAvailabilityToSchemaUrl(
      Boolean(p.onlineAvailability) && !Boolean(p.isExpired),
    );

    const offer = {
      "@type": "Offer",
      url: p.affiliateUrl || productUrl,
      price: normalizePrice(p.salePrice),
      priceCurrency: "USD",
      availability: offerAvailability,
      itemCondition: normalizeConditionToSchemaUrl(p.condition),
      seller: p.store
        ? {
            "@type": "Organization",
            name: safeText(p.store, 60),
          }
        : undefined,
    };

    Object.keys(offer).forEach((k) => {
      if (offer[k] === undefined) delete offer[k];
    });

    const productJsonLd = {
      "@type": "Product",
      "@id": `${productUrl}#product`,
      name: safeText(p.name, 140) || "Product",
      url: productUrl,
      image: p.image ? [p.image] : undefined,
      brand: { "@type": "Brand", name: brandName },
      ...(gtin12 ? { gtin12 } : {}),
      ...(gtin13 ? { gtin13 } : {}),
      ...(gtin14 ? { gtin14 } : {}),
      offers: offer,
    };

    Object.keys(productJsonLd).forEach((k) => {
      if (productJsonLd[k] === undefined) delete productJsonLd[k];
    });

    return {
      "@type": "ListItem",
      position: idx + 1,
      item: productJsonLd,
    };
  });

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}#website`,
    url: siteUrl,
    name: "COMPAREFLOW Best Deals in USA",
    inLanguage: "en-US",
    audience: {
      "@type": "Audience",
      geographicArea: {
        "@type": "Country",
        name: "United States",
      },
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://www.compareflow.club/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const webpageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${homeUrl}#webpage`,
    url: homeUrl,
    name: "COMPAREFLOW Best Deals in USA",
    description:
      "Compare prices across top US retailers. Track verified price history, see live availability, and find the best deal today with COMPAREFLOW.",
    inLanguage: "en-US",
    dateModified: nowIso,
    isPartOf: {
      "@id": `${siteUrl}#website`,
    },
    primaryImageOfPage: featured?.[0]?.image
      ? {
          "@type": "ImageObject",
          url: featured[0].image,
        }
      : undefined,
    audience: {
      "@type": "Audience",
      geographicArea: {
        "@type": "Country",
        name: "United States",
      },
    },
  };

  Object.keys(webpageJsonLd).forEach((k) => {
    if (webpageJsonLd[k] === undefined) delete webpageJsonLd[k];
  });

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: homeUrl,
      },
    ],
  };

  const featuredDealsJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${homeUrl}#featured-deals`,
    name: "Featured Deals (USA)",
    description: "A curated set of verified deals from top US retailers.",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: featuredItemList.length,
    itemListElement: featuredItemList,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webpageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(featuredDealsJsonLd),
        }}
      />
      <HomeClient initialData={initialData} />
    </>
  );
}