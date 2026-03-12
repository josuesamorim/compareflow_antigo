// app/product/[slug]/page.js

import ProductPageClient from "./productPageClient.js";
import { prisma } from "../../../lib/prisma.js";
import { notFound } from "next/navigation";

export const revalidate = 3600;

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

function normalizeConditionKey(condition) {
  const raw = (condition ?? "").toString().trim().toLowerCase();
  if (!raw) return "new";

  if (raw === "new" || raw === "brand new" || raw === "novo") return "new";

  if (
    raw.includes("open box") ||
    raw.includes("open-box") ||
    raw.includes("openbox") ||
    raw.includes("open_box")
  ) {
    return "open-box";
  }

  if (
    raw.includes("refurb") ||
    raw.includes("renewed") ||
    raw.includes("reconditioned") ||
    raw.includes("certified")
  ) {
    return "refurbished";
  }

  if (
    raw.includes("pre-owned") ||
    raw.includes("preowned") ||
    raw.includes("used") ||
    raw.includes("seminovo")
  ) {
    return "pre-owned";
  }

  return raw.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "new";
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
  ) {
    return "https://schema.org/RefurbishedCondition";
  }

  if (c.includes("open") && c.includes("box")) return "https://schema.org/UsedCondition";
  if (c.includes("used") || c.includes("pre-owned") || c.includes("preowned")) {
    return "https://schema.org/UsedCondition";
  }

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

function toPlainSerializable(value) {
  if (value == null) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toPlainSerializable);
  }

  if (typeof value === "object") {
    if (typeof value.toNumber === "function") {
      const n = value.toNumber();
      return Number.isFinite(n) ? n : String(value);
    }

    if (
      typeof value.toString === "function" &&
      value.constructor &&
      value.constructor.name &&
      value.constructor.name.toLowerCase().includes("decimal")
    ) {
      const n = Number(value.toString());
      return Number.isFinite(n) ? n : value.toString();
    }

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toPlainSerializable(v);
    }
    return out;
  }

  return value;
}

function stripNilDeep(obj) {
  if (Array.isArray(obj)) {
    return obj
      .map((item) => stripNilDeep(item))
      .filter((item) => item !== undefined && item !== null && item !== "");
  }

  if (!obj || typeof obj !== "object") return obj;

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleaned = stripNilDeep(value);
    if (
      cleaned !== undefined &&
      cleaned !== null &&
      cleaned !== "" &&
      !(typeof cleaned === "object" &&
        !Array.isArray(cleaned) &&
        Object.keys(cleaned).length === 0)
    ) {
      out[key] = cleaned;
    }
  }
  return out;
}

function priceValidUntilISO(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function sanitizeRawDetailsForPublic(rawDetails) {
  if (!rawDetails || typeof rawDetails !== "object" || Array.isArray(rawDetails)) return {};

  const blockedKeys = new Set([
    "sync_at",
    "sku",
    "url",
    "affiliateUrl",
    "affiliate_url",
    "seller_username",
    "seller_friendly_name",
    "campaign",
    "campid",
    "customid",
    "mkevt",
    "mkcid",
    "mkrid",
    "siteid",
    "toolid",
    "epid",
    "itemWebUrl",
    "itemAffiliateWebUrl",
    "upc",
    "gtin",
  ]);

  const clean = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;

    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if (blockedKeys.has(key)) continue;
      if (value == null || value === "") continue;

      if (typeof value === "object" && !Array.isArray(value)) {
        const nested = clean(value);
        if (nested && Object.keys(nested).length > 0) out[key] = nested;
      } else {
        out[key] = value;
      }
    }
    return out;
  };

  return clean(toPlainSerializable(rawDetails));
}

async function readSearchParams(input) {
  const sp = await input;
  if (!sp) return new URLSearchParams();

  if (typeof sp.get === "function") return sp;

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v == null) continue;
    qs.set(k, Array.isArray(v) ? String(v[0]) : String(v));
  }
  return qs;
}

async function readParams(input) {
  const p = await input;
  return p || {};
}

function getBestPublicImage(product, referenceListing, selectedOffer) {
  return product?.image || selectedOffer?.image || referenceListing?.image || null;
}

function buildPublicHistory(listings) {
  return (listings || [])
    .flatMap((listing) =>
      (listing.priceHistory || []).map((h) => ({
        price: normalizePrice(h.price),
        date: h.capturedAt,
        capturedAt: h.capturedAt,
        store: listing.store,
        condition: (h.condition || listing.condition || "new").toString(),
      })),
    )
    .filter(
      (item) =>
        Number.isFinite(item.price) &&
        item.price > 0 &&
        item.capturedAt &&
        item.store,
    )
    .sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
}

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
  const canonical = `https://www.compareflow.club/product/${officialSlug}`;

  const referenceListing =
    (product.listings || []).find((l) => l.image) || (product.listings || [])[0];

  const activeListings = (product.listings || []).filter(
    (l) => !l.isExpired && l.onlineAvailability,
  );

  const bestByRequestedCondition = requestedCondition
    ? activeListings.find((l) => normalizeConditionKey(l.condition) === requestedCondition)
    : null;

  const bestAny = activeListings[0] || null;
  const activeOffer = bestByRequestedCondition || bestAny;

  const cleanBrand = safeText(product.brand || "Top Brands", 80) || "Top Brands";
  const cleanCategory = safeText(product.internalCategory || "Electronics", 80) || "Electronics";
  const currentPrice = activeOffer ? normalizePrice(activeOffer.salePrice) : 0;

  const productName = safeText(product.name, 140) || "Product";
  const title = `${productName} - Compare Prices in USA | COMPAREFLOW`;
  const description = `Compare prices for ${productName} by ${cleanBrand} in the United States.${
    activeOffer && currentPrice > 0
      ? ` Best available offer: $${currentPrice}.`
      : " Check availability across top US retailers."
  } Track price history and store availability in ${cleanCategory}.`;

  const imageUrl = getBestPublicImage(product, referenceListing, activeOffer);

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
      siteName: "COMPAREFLOW",
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

export default async function Page({ params, searchParams }) {
  const p = await readParams(params);
  const slug = p?.slug;
  const decodedSlug = decodeURIComponent(slug || "");

  const sParams = await readSearchParams(searchParams);
  const requestedCondition = normalizeConditionKey(sParams.get("condition"));
  const requestedPrice = sParams.get("price") != null ? Number(sParams.get("price")) : null;

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
  const canonical = `https://www.compareflow.club/product/${officialSlug}`;

  const referenceListing =
    (product.listings || []).find((l) => l.image && l.rawDetails) || (product.listings || [])[0];

  const activeListings = (product.listings || []).filter(
    (l) => !l.isExpired && l.onlineAvailability,
  );

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

  const historyPricesRaw = buildPublicHistory(product.listings);

  const historyValuesOnly = historyPricesRaw
    .map((h) => h.price)
    .filter((v) => Number.isFinite(v) && v > 0);

  const avgPrice =
    historyValuesOnly.length > 0
      ? historyValuesOnly.reduce((a, b) => a + b, 0) / historyValuesOnly.length
      : currentPrice;

  const diffPercent = avgPrice !== 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;

  let priceStatus = "average";
  if (diffPercent <= -5) priceStatus = "great";
  else if (diffPercent < 0) priceStatus = "good";
  else if (diffPercent > 5) priceStatus = "expensive";

  const bestBuyListing = (product.listings || []).find((l) =>
    String(l.store || "").toLowerCase().includes("best"),
  );
  const ebayListing = (product.listings || []).find((l) =>
    String(l.store || "").toLowerCase().includes("ebay"),
  );

  const prioritizedSpecs =
    product.rawDetails ||
    bestBuyListing?.rawDetails ||
    ebayListing?.rawDetails ||
    referenceListing?.rawDetails ||
    {};

  const publicOffers = (activeListings || []).map((l) =>
    stripNilDeep(
      toPlainSerializable({
        storeName: l.store,
        currentPrice: normalizePrice(l.salePrice),
        regularPrice: normalizePrice(l.regularPrice),
        affiliateUrl: l.affiliateUrl || l.url,
        condition: l.condition,
        image: l.image,
        isExpired: Boolean(l.isExpired),
        onlineAvailability: Boolean(l.onlineAvailability),
      }),
    ),
  );

  const publicProductData = stripNilDeep(
    toPlainSerializable({
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      image: getBestPublicImage(product, referenceListing, selectedOffer),
      upc: product.upc || null,
      normalizedModelKey: product.normalizedModelKey || null,
      category_path: product.category_path || null,
      internalCategory: product.internalCategory || null,
      customerReviewAverage:
        product.customerReviewAverage != null ? Number(product.customerReviewAverage) : null,
      customerReviewCount:
        product.customerReviewCount != null ? Number(product.customerReviewCount) : null,
      lowestPrice: currentPrice,
      selectedCondition: selectedOffer?.condition || (requestedCondition ? requestedCondition : null),

      priceHistory: historyPricesRaw,

      rawDetails: sanitizeRawDetailsForPublic(prioritizedSpecs),

      priceAnalysis: {
        average: avgPrice.toFixed(2),
        status: priceStatus,
        diff: diffPercent.toFixed(1),
        daysAnalyzed: historyValuesOnly.length,
      },

      offers: publicOffers,

      salePrice: currentPrice,
      regularPrice:
        selectedOffer && selectedOffer.regularPrice
          ? normalizePrice(selectedOffer.regularPrice)
          : currentPrice,
    }),
  );

  const productName = safeText(publicProductData.name, 140) || "Product";
  const brandName = safeBrandName(publicProductData.brand) || "COMPAREFLOW";
  const categoryName =
    safeText(publicProductData.internalCategory || "Electronics", 80) || "Electronics";

  const imageCandidates = [
    publicProductData.image,
    selectedOffer?.image,
    ...(publicProductData.offers || []).map((o) => o.image),
  ].filter(Boolean);

  const uniqueImages = [...new Set(imageCandidates)].slice(0, 6);

  const rawUpc = publicProductData.upc || null;
  const gtin12 = safeGtin12(rawUpc);
  const gtin13 = !gtin12 ? safeGtin13(rawUpc) : null;
  const gtin14 = !gtin12 && !gtin13 ? safeGtin14(rawUpc) : null;

  const offersArr = Array.isArray(publicProductData.offers) ? publicProductData.offers : [];

  const offerPrices = offersArr
    .map((o) => normalizePrice(o.currentPrice))
    .filter((n) => Number.isFinite(n) && n > 0);

  const lowPrice = offerPrices.length
    ? Math.min(...offerPrices)
    : normalizePrice(publicProductData.salePrice);

  const highPrice = offerPrices.length
    ? Math.max(...offerPrices)
    : normalizePrice(publicProductData.salePrice);

  const offersJsonLd = offersArr
    .map((off, index) => {
      const offerUrl =
        off.affiliateUrl ||
        `https://www.compareflow.club/product/${publicProductData.slug}#offer-${index + 1}`;

      const sellerName = safeText(off.storeName, 60) || "Retailer";
      const price = normalizePrice(off.currentPrice);
      const availability = normalizeAvailabilityToSchemaUrl(off);
      const isInStock = availability === "https://schema.org/InStock";
      const hasValidPrice = Number.isFinite(price) && price > 0;

      return stripNilDeep({
        "@type": "Offer",
        url: offerUrl,
        priceCurrency: "USD",
        availability,
        itemCondition: normalizeConditionToSchemaUrl(off.condition),
        priceValidUntil: priceValidUntilISO(7),
        seller: {
          "@type": "Organization",
          name: sellerName,
        },
        ...(isInStock && hasValidPrice ? { price } : {}),
      });
    })
    .filter((o) => o && o.url && o.availability);

  const avg =
    publicProductData.customerReviewAverage != null
      ? Number(publicProductData.customerReviewAverage)
      : null;

  const cnt =
    publicProductData.customerReviewCount != null
      ? Number(publicProductData.customerReviewCount)
      : null;

  const hasValidAggregate =
    Number.isFinite(avg) && avg > 0 && Number.isFinite(cnt) && cnt > 0;

  const productJsonLd = stripNilDeep({
    "@context": "https://schema.org/",
    "@type": "Product",
    "@id": `https://www.compareflow.club/product/${publicProductData.slug}#product`,
    name: productName,
    url: canonical,
    image: uniqueImages.length ? uniqueImages : undefined,
    description: `Compare prices for ${productName} by ${brandName} in the United States.${
      offersArr.length && lowPrice > 0
        ? ` Best available offer from $${lowPrice}.`
        : " Check availability across top US retailers."
    } Track price history and store availability in ${categoryName}.`,
    sku: publicProductData.slug,
    mpn: publicProductData.upc || publicProductData.normalizedModelKey || undefined,
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
      name: "COMPAREFLOW",
      url: "https://www.compareflow.club/",
    },
    offers: {
      "@type": "AggregateOffer",
      offerCount: offersJsonLd.length,
      priceCurrency: "USD",
      ...(offerPrices.length ? { lowPrice, highPrice } : {}),
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
      ...(publicProductData.internalCategory
        ? [
            {
              "@type": "ListItem",
              position: 3,
              name: safeText(publicProductData.internalCategory, 80) || "Category",
              item: `https://www.compareflow.club/category/${encodeURIComponent(
                safeText(publicProductData.internalCategory, 200),
              )}`,
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductPageClient initialProduct={publicProductData} />
    </main>
  );
}