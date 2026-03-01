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
 * ✅ UPC / EAN VALIDATION (Checksum)
 * - gtin12: valida UPC-A 12 dígitos (checksum real)
 * - gtin13: valida EAN-13 13 dígitos (checksum real)
 * Retorna string apenas se válido. Caso contrário, null.
 */
function isValidUPC12(digits12) {
  if (!digits12) return false;
  const d = String(digits12).replace(/\D/g, "");
  if (d.length !== 12) return false;

  const nums = d.split("").map((n) => Number(n));
  const checkDigit = nums[11];

  let oddSum = 0; // posições 1,3,5,7,9,11 (0,2,4,6,8,10)
  let evenSum = 0; // posições 2,4,6,8,10 (1,3,5,7,9)

  for (let i = 0; i < 11; i++) {
    if (i % 2 === 0) oddSum += nums[i];
    else evenSum += nums[i];
  }

  const total = oddSum * 3 + evenSum;
  const calc = (10 - (total % 10)) % 10;

  return calc === checkDigit;
}

function isValidEAN13(digits13) {
  if (!digits13) return false;
  const d = String(digits13).replace(/\D/g, "");
  if (d.length !== 13) return false;

  const nums = d.split("").map((n) => Number(n));
  const checkDigit = nums[12];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    // posições ímpares (1,3,5...) peso 1; pares (2,4,6...) peso 3
    sum += nums[i] * (i % 2 === 0 ? 1 : 3);
  }

  const calc = (10 - (sum % 10)) % 10;
  return calc === checkDigit;
}

function safeGtin12(upc) {
  if (upc == null) return null;
  const digits = String(upc).replace(/\D/g, "");
  if (digits.length !== 12) return null;
  return isValidUPC12(digits) ? digits : null;
}

function safeGtin13(ean) {
  if (ean == null) return null;
  const digits = String(ean).replace(/\D/g, "");
  if (digits.length !== 13) return null;
  return isValidEAN13(digits) ? digits : null;
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

/**
 * SEO: GERAÇÃO DINÂMICA DE METADADOS (melhorado)
 * ✅ Título ajustado para: "PRICELAB Best Deals in USA ..."
 */
export async function generateMetadata({ params }) {
  const p = await params;
  const slug = p?.slug || "";
  const decodedSlug = decodeURIComponent(slug);

  // Ex.: "gaming-consoles" -> "Gaming Consoles"
  const categoryName = toTitleCase(decodedSlug.replace(/-/g, " "));

  const canonical = `https://pricelab.tech/category/${decodedSlug}`;

  const title = `PRICELAB Best Deals in USA — ${categoryName} Price Comparison`;
  const description = `Compare ${categoryName} prices across top US retailers. Track live deals, see availability, and find the best price today with PRICELAB.`;

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
      title: `PRICELAB Best Deals in USA — ${categoryName}`,
      description,
      type: "website",
      url: canonical,
      locale: "en_US",
      siteName: "PRICELAB",
    },
    twitter: {
      card: "summary_large_image",
      title: `PRICELAB Best Deals in USA — ${categoryName}`,
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
     * ✅ Adiciona: UPC do produto (se existir) para JSON-LD (gtin12/gtin13).
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

    initialData = {
      products: JSON.parse(JSON.stringify(rawProducts)).map((p2) => ({
        ...p2,
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
   * ✅ JSON-LD (Categoria) — Melhorias aplicadas:
   * - CollectionPage + ItemList
   * - Cada item: Product com @id, brand, gtin (UPC/EAN), Offer com availability
   * - Audience US (foco total)
   * - inLanguage en-US
   * - BreadcrumbList
   */
  const categoryName = toTitleCase(decodedSlug.replace(/-/g, " "));
  const canonical = `https://pricelab.tech/category/${decodedSlug}`;
  const siteName = "PRICELAB";
  const nowIso = new Date().toISOString();

  const itemListElement = (initialData.products || []).slice(0, 24).map((p3, idx) => {
    const productUrl = `https://pricelab.tech/product/${p3.slug}`;
    const brandName = safeBrandName(p3.brand) || "Top Brands";

    // ✅ Somente inclui se checksum válido
    const gtin12 = safeGtin12(p3.upc);
    const gtin13 = !gtin12 ? safeGtin13(p3.upc) : null;

    const offerAvailability = p3.onlineAvailability ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

    const offer = {
      "@type": "Offer",
      url: productUrl,
      price: Number(p3.salePrice || 0),
      priceCurrency: "USD",
      availability: offerAvailability,
      itemCondition: normalizeConditionToSchemaUrl(p3.condition),
      // Pra não “mentir”: validade curta (se quiser, pode ajustar)
      priceValidUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      seller: p3.store
        ? {
            "@type": "Organization",
            name: String(p3.store),
          }
        : undefined,
    };

    const productJsonLd = {
      "@type": "Product",
      "@id": `${productUrl}#product`,
      name: p3.name,
      image: p3.image ? [p3.image] : undefined,
      url: productUrl,
      brand: {
        "@type": "Brand",
        name: brandName,
      },
      ...(gtin12 ? { gtin12 } : {}),
      ...(gtin13 ? { gtin13 } : {}),
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
        item: "https://pricelab.tech/",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Categories",
        item: "https://pricelab.tech/categories",
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
    name: `PRICELAB Best Deals in USA — ${categoryName} Price Comparison`,
    description: `Compare ${categoryName} prices across top US retailers. Live availability and verified pricing.`,
    inLanguage: "en-US",
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: "https://pricelab.tech/",
    },
    primaryImageOfPage: initialData.products?.[0]?.image
      ? { "@type": "ImageObject", url: initialData.products[0].image }
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(categoryJsonLd) }} />

      <CategoryPage initialSEOData={initialData.products} serverTotal={initialData.totalCount} />
    </>
  );
}