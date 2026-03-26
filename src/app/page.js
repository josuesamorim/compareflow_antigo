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
      const queryLimit = category === "laptops" ? 8 : limit;

      // 🔥 Olha a diferença! O Prisma agora só consulta a View pré-processada
      const rawResult = await prisma.$queryRaw`
        SELECT *
        FROM home_featured_deals
        WHERE internal_category = ${category}
        ORDER BY price_ratio ASC, sale_price ASC
        LIMIT ${queryLimit}
      `;

      const formattedItems = rawResult.map((p) => {
        const brandRaw = p.brand || "Deal";
        const firstWord = brandRaw.trim().split(/\s+/)[0] || "Deal";
        const cleanBrand = firstWord.replace(/[^a-zA-Z0-9]/g, "");

        const avgPriceNum = Number(p.avg_price);
        const salePriceNum = Number(p.sale_price);
        const regularPriceNum = Number(p.regular_price) || salePriceNum;

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
            ? String(p.internal_category).replace(/-/g, " ")
            : "Electronics",
          discountLabel:
            regularPriceNum > salePriceNum
              ? `${Math.round(
                  ((regularPriceNum - salePriceNum) / regularPriceNum) * 100
                )}% OFF`
              : null,
        };
      });

      return {
        items: formattedItems,
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