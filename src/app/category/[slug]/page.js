// category/[slug]/page.js

import CategoryPage from "./CategoryClient";
import { prisma } from "../../../lib/prisma.js";

/**
 * Helpers (SEO-safe)
 */
function toTitleCase(s = "") {
  return s
    .toString()
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function safeBrandName(brand) {
  const b = (brand ?? "").toString().trim();
  if (!b) return null;
  // Evita strings gigantes/quebradas
  return b.length > 80 ? b.slice(0, 80) : b;
}

/**
 * ✅ Texto seguro para SEO/JSON-LD (defensivo)
 */
function safeText(v, max = 300) {
  if (v == null) return "";
  const s = String(v).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function digitsOnly(v) {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * GTIN / UPC validation (length + check digit) — GS1
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

/**
 * SEO: GERAÇÃO DINÂMICA DE METADADOS (melhorado)
 * ✅ Título ajustado para: "COMPAREFLOW Best Deals in USA ..."
 */
export async function generateMetadata({ params }) {
  const p = await params;
  const slug = p?.slug || "";
  const decodedSlug = decodeURIComponent(slug);

  // Ex.: "gaming-consoles" -> "Gaming Consoles"
  const categoryName = toTitleCase(decodedSlug.replace(/-/g, " "));

  const canonical = `https://www.compareflow.club/category/${decodedSlug}`;

  const title = `COMPAREFLOW Best Deals in USA — ${categoryName} Price Comparison`;
  const description = `Compare ${categoryName} prices across top US retailers. Track live deals, see availability, and find the best price today with COMPAREFLOW.`;

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
      title: `COMPAREFLOW Best Deals in USA — ${categoryName}`,
      description,
      type: "website",
      url: canonical,
      locale: "en_US",
      siteName: "COMPAREFLOW",
    },
    twitter: {
      card: "summary_large_image",
      title: `COMPAREFLOW Best Deals in USA — ${categoryName}`,
      description,
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
 * SERVER COMPONENT PRINCIPAL
 */
export default async function Page({ params }) {
  const p = await params;
  const slug = p?.slug || "";
  const decodedSlug = decodeURIComponent(slug);

  let initialData = {
    products: [],
    totalCount: 0,
  };

  try {
    /**
     * QUERY RAW ATUALIZADA (V25)
     * ✅ Mantém: melhor listing por produto (menor preço), filtrando só ativas.
     * ✅ Mantém: imagem vindo da listing.
     * ✅ Adiciona: UPC do produto (se existir) para JSON-LD (gtin12/gtin13/gtin14).
     * ✅ Adiciona: online_availability para JSON-LD (availability).
     */
    const rawProducts = await prisma.$queryRaw`
      WITH BestListings AS (
        SELECT DISTINCT ON (product_id)
          product_id,
          sku,
          store,
          url,
          affiliate_url,
          image as listing_image,
          condition,
          sale_price,
          regular_price,
          online_availability,
          is_expired
        FROM listings
        WHERE is_expired = false
          AND online_availability = true
          AND sale_price > 5
        ORDER BY product_id, sale_price ASC
      ),
      BaseProducts AS (
        SELECT
          p.id,
          l.sku,
          p.name,
          l.listing_image as image,
          p.slug,
          p.brand,
          l.condition,
          l.store,
          l.sale_price,
          l.regular_price,
          p.last_updated,
          p.internal_category,
          p.normalized_model_key,
          p.upc,
          l.online_availability,

          CASE
            WHEN p.name ILIKE '% for %' OR p.name ILIKE '% para %' OR p.name ILIKE '% compatible %' THEN -65.0
            WHEN p.name ILIKE ANY(ARRAY['%case%', '%monitor%', '%cover%', '%protector%', '%glass%', '%cable%', '%strap%', '%adapter%']) THEN -35.0
            ELSE 0.0
          END AS accessory_penalty,

          CASE
            WHEN l.sale_price > 500 THEN 30.0
            WHEN l.sale_price > 200 THEN 15.0
            WHEN l.sale_price < 50 THEN -20.0
            ELSE 0.0
          END AS price_tier_boost
        FROM products p
        INNER JOIN BestListings l ON p.id = l.product_id
        WHERE p.internal_category = ${decodedSlug}
          AND l.listing_image IS NOT NULL
          AND l.listing_image != ''
          AND l.listing_image NOT LIKE '%placeholder%'
          AND l.listing_image NOT LIKE '%no-image%'
      ),
      GroupedProducts AS (
        SELECT DISTINCT ON (brand, normalized_model_key) *
        FROM BaseProducts
        ORDER BY brand, normalized_model_key,
          (price_tier_boost + accessory_penalty) DESC,
          sale_price ASC,
          id ASC
      )
      SELECT
        id,
        sku,
        name,
        image,
        slug,
        brand,
        upc,
        condition,
        store,
        online_availability as "onlineAvailability",
        sale_price as "salePrice",
        regular_price as "regularPrice",
        internal_category as "internalCategory"
      FROM GroupedProducts
      ORDER BY
        (price_tier_boost + accessory_penalty) DESC,
        last_updated DESC,
        id ASC
      LIMIT 24
    `;

    const totalCountResult = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count FROM (
        SELECT DISTINCT ON (p.brand, p.normalized_model_key) p.id
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        WHERE p.internal_category = ${decodedSlug}
          AND l.is_expired = false
          AND l.online_availability = true
          AND l.sale_price > 5
          AND l.image IS NOT NULL
          AND l.image != ''
      ) as count_query
    `;

    const totalCount = totalCountResult[0]?.count || 0;

    // DTO Explícito substituindo o `...p2` para cortar o vazamento do ID e do SKU
    initialData = {
      products: JSON.parse(JSON.stringify(rawProducts)).map((p2) => ({
        name: p2.name,
        image: p2.image,
        slug: p2.slug,
        brand: p2.brand,
        upc: p2.upc,
        condition: p2.condition,
        store: p2.store,
        internalCategory: p2.internalCategory,
        salePrice: Number(p2.salePrice),
        regularPrice: Number(p2.regularPrice),
        onlineAvailability: Boolean(p2.onlineAvailability),
      })),
      totalCount: Number(totalCount),
    };
  } catch (error) {
    console.error("❌ Category Page Server Error:", error);
    initialData = { products: [], totalCount: 0 };
  }

  /**
   * ✅ JSON-LD (Categoria)
   * - CollectionPage + ItemList
   * - Cada item: Product com @id, brand, gtin (UPC/EAN/GTIN14), Offer com availability
   * - Audience US
   * - inLanguage en-US
   * - BreadcrumbList
   */
  const categoryName = toTitleCase(decodedSlug.replace(/-/g, " "));
  const canonical = `https://www.compareflow.club/category/${decodedSlug}`;
  const siteName = "COMPAREFLOW";
  const nowIso = new Date().toISOString();

  const itemListElement = (initialData.products || []).slice(0, 24).map((p3, idx) => {
    const productUrl = `https://www.compareflow.club/product/${p3.slug}`;
    const brandName = safeBrandName(p3.brand) || "Top Brands";

    const rawUpc = p3.upc || null;
    // ✅ Somente inclui se checksum válido
    const gtin12 = safeGtin12(rawUpc);
    const gtin13 = !gtin12 ? safeGtin13(rawUpc) : null;
    const gtin14 = !gtin12 && !gtin13 ? safeGtin14(rawUpc) : null;

    const offerAvailability = p3.onlineAvailability
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock";

    const offer = {
      "@type": "Offer",
      url: productUrl,
      price: Number(p3.salePrice || 0),
      priceCurrency: "USD",
      availability: offerAvailability,
      itemCondition: normalizeConditionToSchemaUrl(p3.condition),
      // Pra não “mentir”: validade curta (se quiser, pode ajustar)
      priceValidUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
      seller: p3.store
        ? {
            "@type": "Organization",
            name: safeText(p3.store, 80) || String(p3.store).slice(0, 80),
          }
        : undefined,
    };

    const productJsonLd = {
      "@type": "Product",
      "@id": `${productUrl}#product`,
      name: safeText(p3.name, 140) || "Product",
      image: p3.image ? [String(p3.image)] : undefined,
      url: productUrl,
      brand: {
        "@type": "Brand",
        name: safeText(brandName, 80) || "Top Brands",
      },
      ...(gtin12 ? { gtin12 } : {}),
      ...(gtin13 ? { gtin13 } : {}),
      ...(gtin14 ? { gtin14 } : {}),
      offers: offer,
    };

    // Remove undefined para não sujar o JSON
    Object.keys(productJsonLd).forEach((k) => productJsonLd[k] === undefined && delete productJsonLd[k]);
    Object.keys(offer).forEach((k) => offer[k] === undefined && delete offer[k]);

    return {
      "@type": "ListItem",
      position: idx + 1,
      item: productJsonLd,
    };
  });

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://www.compareflow.club/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Categories",
        item: "https://www.compareflow.club/categories",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: categoryName,
        item: canonical,
      },
    ],
  };

  const categoryJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${canonical}#collection`,
    url: canonical,
    name: `COMPAREFLOW Best Deals in USA — ${categoryName} Price Comparison`,
    description: `Compare ${categoryName} prices across top US retailers. Live availability and verified pricing.`,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: "https://www.compareflow.club/",
    },
    primaryImageOfPage: initialData.products?.[0]?.image
      ? { "@type": "ImageObject", url: String(initialData.products[0].image) }
      : undefined,
    dateModified: nowIso,
    audience: {
      "@type": "Audience",
      geographicArea: {
        "@type": "Country",
        name: "United States",
      },
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: Number(initialData.totalCount || initialData.products?.length || 0),
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement,
    },
  };

  // limpa undefined
  Object.keys(categoryJsonLd).forEach((k) => categoryJsonLd[k] === undefined && delete categoryJsonLd[k]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(categoryJsonLd) }}
      />

      <CategoryPage initialSEOData={initialData.products} serverTotal={initialData.totalCount} />
    </>
  );
}