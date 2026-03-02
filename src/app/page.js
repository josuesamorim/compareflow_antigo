import HomeClient from "../components/HomeClient.js";
import { prisma } from "../lib/prisma.js";

/**
 * CONFIGURAÇÃO DO AMBIENTE
 * Revalidação configurada para 3600 segundos (1 hora).
 * Removemos o force-dynamic para permitir que o Next.js gere e armazene o cache estático.
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

function normalizeConditionToSchemaUrl(cond) {
  const c = (cond ?? "").toString().trim().toLowerCase();
  if (!c) return "https://schema.org/NewCondition";
  if (c === "new" || c.includes("brand new"))
    return "https://schema.org/NewCondition";
  if (
    c.includes("refurb") ||
    c.includes("renewed") ||
    c.includes("reconditioned") ||
    c.includes("certified")
  )
    return "https://schema.org/RefurbishedCondition";
  if (c.includes("open") && c.includes("box"))
    return "https://schema.org/UsedCondition";
  if (
    c.includes("used") ||
    c.includes("pre-owned") ||
    c.includes("preowned")
  )
    return "https://schema.org/UsedCondition";
  return "https://schema.org/NewCondition";
}

function normalizeAvailabilityToSchemaUrl(isInStock) {
  return isInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";
}

function normalizePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toTitleCase(s = "") {
  return s
    .toString()
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

function categoryDisplayName(cat) {
  const decoded = (cat ?? "").toString().trim();
  if (!decoded) return "Electronics";
  return toTitleCase(decoded.replace(/-/g, " "));
}

function categoryCanonical(cat) {
  const c = (cat ?? "").toString().trim();
  if (!c) return "https://pricelab.tech/";
  return `https://pricelab.tech/category/${encodeURIComponent(c)}`;
}

export default async function Page() {
  /**
   * FUNÇÃO AUXILIAR: getInitialDeals
   * Adaptada para o Schema V25 (Products + Listings)
   */
  async function getInitialDeals(category, limit = 4) {
    try {
      const catFilter = category && category !== "all" ? category : null;

      // Lista de marcas bloqueadas (Filtro de ruído)
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
        "HP",
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

      /**
       * QUERY SQL ADAPTADA - RELACIONAMENTO 1:N
       * Buscamos o menor preço em 'listings' para cada 'product'.
       *
       * ✅ SEO/JSON-LD: adiciona UPC do produto e condição/disponibilidade
       * sem mudar o comportamento do ranking.
       */
      const rawResult = await prisma.$queryRaw`
        WITH BestListings AS (
          SELECT DISTINCT ON (product_id)
            product_id,
            sku,
            sale_price,
            regular_price,
            image as listing_image,
            last_updated as listing_updated,
            store,
            condition,
            online_availability,
            is_expired,
            url,
            affiliate_url
          FROM listings
          WHERE is_expired = false
            AND online_availability = true
          ORDER BY product_id, sale_price ASC
        ),
        AvgPriceHistory AS (
          SELECT listing_id, AVG(price) as historic_avg
          FROM price_history
          GROUP BY listing_id
        ),
        CleanProducts AS (
          SELECT
            p.id,
            p.name,
            p.brand,
            p.slug,
            p.internal_category,
            p.upc,
            l.sku,
            l.sale_price,
            l.regular_price,
            l.listing_image,
            l.store,
            l.condition,
            l.online_availability,
            l.is_expired,
            l.url,
            l.affiliate_url,
            COALESCE(ph.historic_avg, l.sale_price) as avg_price,
            (l.sale_price / COALESCE(ph.historic_avg, l.sale_price)) as price_ratio
          FROM products p
          INNER JOIN BestListings l ON p.id = l.product_id
          -- Join com histórico baseado na listing selecionada como melhor preço
          LEFT JOIN listings l_ref ON l_ref.product_id = p.id
          LEFT JOIN AvgPriceHistory ph ON ph.listing_id = l_ref.id
          WHERE p.internal_category = ${category}::TEXT
            AND l.sale_price > 15
            AND l.listing_image IS NOT NULL
            AND l.listing_image != ''
            AND l.listing_image NOT LIKE '%placeholder%'
            AND p.brand IS NOT NULL AND p.brand != ''

            -- FILTRO DE MARCAS COM CAST EXPLÍCITO
            AND NOT (p.brand::TEXT = ANY(${blockedBrandsArray}::TEXT[]))

            -- LÓGICA PRICETIP: Somente Below Average ou Average
            AND (l.sale_price <= COALESCE(ph.historic_avg, l.sale_price))

            -- FILTRO DE ACESSÓRIOS (EXCLUSÃO SEMÂNTICA)
            AND p.name NOT ILIKE '%case %'
            AND p.name NOT ILIKE '%case%'
            AND p.name NOT ILIKE '%AppleCare%'
            AND p.name NOT ILIKE '%cover%'
            AND p.name NOT ILIKE '%PLAN%'
            AND p.name NOT ILIKE '%screen protector%'
            AND p.name NOT ILIKE '%cable%'
            AND p.name NOT ILIKE '%adapter%'
            AND p.name NOT ILIKE '%strap%'

            -- FILTRO DE PREÇO MÍNIMO POR CATEGORIA PARA DEALS DE QUALIDADE
            AND (
              (p.internal_category = 'smartphones' AND l.sale_price >= 149) OR
              (p.internal_category = 'tvs' AND l.sale_price >= 199) OR
              (p.internal_category NOT IN ('smartphones', 'tvs'))
            )
        ),
        PriceBounds AS (
          SELECT
            *,
            percent_rank() OVER (PARTITION BY internal_category ORDER BY sale_price) as price_percentile
          FROM CleanProducts
        ),
        RelevantProducts AS (
          SELECT * FROM PriceBounds
          WHERE price_percentile BETWEEN 0.05 AND 0.95
        ),
        DistinctBrands AS (
          SELECT DISTINCT ON (brand)
            id,
            sku,
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
            url,
            affiliate_url
          FROM RelevantProducts
          ORDER BY brand, price_ratio ASC
        )
        SELECT *
        FROM DistinctBrands
        ORDER BY price_ratio ASC
        LIMIT ${limit}
      `;

      /**
       * 2. FORMATAÇÃO PARA O COMPONENTE HOMECLIENT
       */
      const formattedItems = rawResult.map((p) => {
        const brandRaw = p.brand || "Deal";
        const firstWord = brandRaw.trim().split(/\s+/)[0];
        const cleanBrand = firstWord.replace(/[^a-zA-Z0-9]/g, "");

        const diff =
          ((Number(p.sale_price) - Number(p.avg_price)) / Number(p.avg_price)) *
          100;

        return {
          id: p.id.toString(),
          sku: p.sku,
          name: p.name,
          image: p.listing_image, // Imagem da oferta ativa
          slug: p.slug,
          brand: cleanBrand || firstWord || "Deal",
          salePrice: Number(p.sale_price),
          regularPrice: Number(p.regular_price),
          avgPrice: Number(p.avg_price),
          store: p.store,
          condition: p.condition,
          onlineAvailability: Boolean(p.online_availability),
          isExpired: Boolean(p.is_expired),
          upc: p.upc,
          url: p.url,
          affiliateUrl: p.affiliate_url,
          priceStatus:
            diff <= -5 ? "Great Deal" : diff < 0 ? "Good Price" : "Fair Price",
          internalCategory: p.internal_category
            ? p.internal_category.replace(/-/g, " ")
            : "Electronics",
          discountLabel:
            p.regular_price > p.sale_price
              ? `${Math.round(
                  ((Number(p.regular_price) - Number(p.sale_price)) /
                    Number(p.regular_price)) *
                    100,
                )}% OFF`
              : null,
        };
      });

      return { items: formattedItems };
    } catch (e) {
      console.error(`❌ Erro SQL na Home para ${category}:`, e.message);
      return { items: [] };
    }
  }

  /**
   * BUSCA PARALELA DE DADOS (SMARTPHONES, TVS, GAMING)
   */
  const [smartphonesData, tvsData, gamingData] = await Promise.all([
    getInitialDeals("smartphones"),
    getInitialDeals("tvs"),
    getInitialDeals("laptops"),
  ]);

  /**
   * ESTRUTURAÇÃO DOS DADOS INICIAIS PARA O CLIENT-SIDE
   */
  const initialData = {
    smartphones: smartphonesData?.items || [],
    tvs: tvsData?.items || [],
    laptops: gamingData?.items || [],
  };

  /**
   * ---------------- SEO / JSON-LD (HOME) ----------------
   * Objetivo: US-first, English, e-commerce discovery.
   *
   * ✅ WebSite + SearchAction (ajuda muito sitelinks search box)
   * ✅ WebPage (Home) com audience US + inLanguage en-US
   * ✅ BreadcrumbList
   * ✅ ItemList com "Featured Deals" (sem inventar preço/estoque além do que temos)
   *
   * Obs: Home não deve tentar fazer ProductSnippet completo pra tudo; é melhor
   * deixar isso para Category/PDP. Aqui a gente lista poucos destaques.
   */
  const siteUrl = "https://pricelab.tech/";
  const homeUrl = "https://pricelab.tech/";
  const nowIso = new Date().toISOString();

  // ✅ FIX: você não tem initialData.kitchen; mantém só o que existe (sem inventar)
  const featured = [
    ...(initialData.smartphones || []).slice(0, 4),
    ...(initialData.tvs || []).slice(0, 4),
    ...(initialData.laptops || []).slice(0, 4),
  ].slice(0, 12);

  const featuredItemList = featured.map((p, idx) => {
    const productUrl = `https://pricelab.tech/product/${encodeURIComponent(p.slug)}`;
    const brandName = safeBrandName(p.brand) || "Top Brands";

    // ✅ UPC/GTIN: só inclui se checksum válido (12/13/14)
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

    // clean undefined
    Object.keys(offer).forEach((k) => offer[k] === undefined && delete offer[k]);
    Object.keys(productJsonLd).forEach(
      (k) => productJsonLd[k] === undefined && delete productJsonLd[k],
    );

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
    name: "PRICELAB Best Deals in USA",
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
        urlTemplate: "https://pricelab.tech/search?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  const webpageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${homeUrl}#webpage`,
    url: homeUrl,
    name: "PRICELAB Best Deals in USA",
    description:
      "Compare prices across top US retailers. Track verified price history, see live availability, and find the best deal today with PRICELAB.",
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

  Object.keys(webpageJsonLd).forEach(
    (k) => webpageJsonLd[k] === undefined && delete webpageJsonLd[k],
  );

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

  /**
   * RENDERIZAÇÃO DO COMPONENTE CLIENT
   */
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featuredDealsJsonLd) }}
      />
      <HomeClient initialData={initialData} />
    </>
  );
}