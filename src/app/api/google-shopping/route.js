import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get("t") || "").trim();
  const secretToken = (process.env.GOOGLE_SHOPPING_TOKEN || "").trim();

  // Validação de segurança via Token do .env
  if (!secretToken || token !== secretToken) {
    return new NextResponse(
      JSON.stringify({
        error: "Unauthorized",
        message: "Token inválido ou ausente.",
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const baseUrl = "localhost:3000";
  

  try {
    /**
     * V25 SCHEMA — Feed baseado em OFERTAS REAIS (listings)
     * - Só produtos com ao menos 1 listing ativa, em estoque e com imagem válida
     * - Dentro do select, traz apenas listings válidas e ordena pelo menor preço
     */
    const products = await prisma.product.findMany({
      where: {
        slug: { not: null },
        listings: {
          some: {
            isExpired: false,
            onlineAvailability: true,
            image: { not: null },
            salePrice: { gt: 0 },
          },
        },
      },
      select: {
        id: true,
        slug: true,
        name: true,
        brand: true,
        internalCategory: true,
        normalizedModelKey: true,
        upc: true,
        lastUpdated: true,
        listings: {
          where: {
            isExpired: false,
            onlineAvailability: true,
            image: { not: null },
            salePrice: { gt: 0 },
          },
          orderBy: { salePrice: "asc" },
          select: {
            id: true,
            sku: true,
            salePrice: true,
            regularPrice: true,
            affiliateUrl: true,
            url: true,
            image: true,
            store: true,
            condition: true,
            onlineAvailability: true,
            isExpired: true,
            rawDetails: true,
          },
          take: 6,
        },
      },
      orderBy: { lastUpdated: "desc" },
      take: 2000,
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>PRICELAB Product Feed - USD (US)</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml("Price comparison feed based on live retailer offers (in-stock).")}</description>
    <language>en-us</language>`;

    for (const product of products) {
      const bestListing = product?.listings?.[0];
      if (!bestListing) continue;

      const productSlug = (product.slug ?? "").toString().trim();
      if (!productSlug) continue;

      const productUrl = `${baseUrl}/product/${encodeURIComponent(productSlug)}`;

      // Imagem principal: listing
      const mainImage = safeImageUrl(bestListing.image);
      if (!mainImage) continue;

      const hiResMain = upgradeBestBuyImage(mainImage);

      // Additional images: outras listings do mesmo produto
      const additionalImages = collectAdditionalImages(product?.listings || [], mainImage)
        .slice(0, 5)
        .map((u) => upgradeBestBuyImage(u));

      // Preço
      const sale = normalizePrice(bestListing.salePrice);
      const regular = normalizePrice(bestListing.regularPrice);
      const priceValue = sale > 0 ? sale : regular;
      if (!(priceValue > 0)) continue;

      const formattedPrice = `${priceValue.toFixed(2)} USD`;

      // Título
      const name = safeText(product.name, 150) || "";
      if (!name) continue;

      const category = (product.internalCategory || "").toString().trim();
      const categoryLower = category.toLowerCase();
      const brandName = safeText(product.brand || "Generic", 70) || "Generic";

      // Condition / availability
      const gCondition = normalizeGoogleCondition(bestListing.condition);
      const availability = normalizeGoogleAvailability(bestListing);

      // Descrição baseada em rawDetails reais (listing)
      const finalDescription = buildTruthfulDescription(bestListing.rawDetails || null, product.internalCategory);

      // Google category
      const googleCategory = getGoogleCategory(`${categoryLower} ${name.toLowerCase()}`);

      // Identificadores (GTIN apenas se válido)
      const rawUpc = product.upc || null;
      const gtin12 = safeGtin12(rawUpc);
      const gtin13 = !gtin12 ? safeGtin13(rawUpc) : null;
      const gtin14 = !gtin12 && !gtin13 ? safeGtin14(rawUpc) : null;

      const mpn = safeText(bestListing.sku, 100) || null;
      const identifierExists = Boolean(gtin12 || gtin13 || gtin14 || mpn);

      const groupId = safeText(product.normalizedModelKey, 80) || String(product.id);

      // Apparel extras
      const isApparel =
        categoryLower.includes("apparel") ||
        categoryLower.includes("clothing") ||
        categoryLower.includes("footwear") ||
        categoryLower.includes("shoe") ||
        categoryLower.includes("watch") ||
        categoryLower.includes("eyewear") ||
        categoryLower.includes("sunglass") ||
        categoryLower.includes("glasses");

      const detectedColor = isApparel ? extractColor(name) : null;

      xml += `
    <item>
      <g:id>${escapeXml(String(bestListing.id))}</g:id>
      <g:item_group_id>${escapeXml(groupId)}</g:item_group_id>
      <g:title>${escapeXml(name)}</g:title>
      <g:description>${escapeXml(finalDescription)}</g:description>
      <g:link>${escapeXml(productUrl)}</g:link>
      <g:image_link>${escapeXml(hiResMain)}</g:image_link>
      ${additionalImages.map((u) => `<g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`).join("")}
      <g:brand>${escapeXml(brandName)}</g:brand>
      <g:condition>${escapeXml(gCondition)}</g:condition>
      <g:availability>${escapeXml(availability)}</g:availability>
      <g:price>${escapeXml(formattedPrice)}</g:price>
      <g:product_type>${escapeXml(safeText(product.internalCategory || "General", 100) || "General")}</g:product_type>
      <g:google_product_category>${escapeXml(String(googleCategory))}</g:google_product_category>

      ${isApparel && detectedColor ? `<g:color>${escapeXml(detectedColor)}</g:color>` : ""}
      ${isApparel ? `<g:gender>unisex</g:gender>` : ""}
      ${isApparel ? `<g:age_group>adult</g:age_group>` : ""}

      ${gtin12 ? `<g:gtin>${escapeXml(gtin12)}</g:gtin>` : ""}
      ${!gtin12 && gtin13 ? `<g:gtin>${escapeXml(gtin13)}</g:gtin>` : ""}
      ${!gtin12 && !gtin13 && gtin14 ? `<g:gtin>${escapeXml(gtin14)}</g:gtin>` : ""}

      ${mpn ? `<g:mpn>${escapeXml(mpn)}</g:mpn>` : ""}
      <g:identifier_exists>${identifierExists ? "true" : "false"}</g:identifier_exists>
    </item>`;
    }

    xml += `
  </channel>
</rss>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error("Feed Error:", error);
    return new NextResponse("<?xml version='1.0'?><error>Internal Server Error</error>", {
      status: 500,
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  }
}

/* ---------------- Helpers ---------------- */

function safeText(v, max = 300) {
  if (v == null) return "";
  const s = String(v).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalizePrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe).replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return c;
    }
  });
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

function normalizeGoogleCondition(cond) {
  // Puxa exatamente como está no seu banco de dados agora
  const c = (cond ?? "").toString().trim().toUpperCase();

  if (c === "REFURBISHED") {
    return "refurbished";
  }

  // O Google exige que essas três categorias sejam enviadas apenas como "used"
  if (c === "USED" || c === "PRE_OWNED" || c === "OPEN_BOX") {
    return "used";
  }

  // Fallback seguro (Cobre o "NEW" e qualquer anomalia)
  return "new";
}

function normalizeGoogleAvailability({ isExpired, onlineAvailability } = {}) {
  const expired = Boolean(isExpired);
  const inStock = Boolean(onlineAvailability);
  return !expired && inStock ? "in_stock" : "out_of_stock";
}

function safeImageUrl(url) {
  const u = (url ?? "").toString().trim();
  if (!u) return null;
  if (u.toLowerCase() === "null") return null;
  if (!/^https?:\/\//i.test(u)) return null;
  return u;
}

function upgradeBestBuyImage(imageUrl) {
  try {
    if (!imageUrl || !imageUrl.includes("bbystatic.com")) return imageUrl;

    let hi = imageUrl;
    hi = hi.replace(/\/prescaled\/\d+\/\d+\//, "/prescaled/1000/1000/");
    hi = hi.replace(/(_s|_sa|_m|_sd|_sw)\.(jpg|jpeg|png|webp)$/i, "_cv.$2");
    return hi;
  } catch {
    return imageUrl;
  }
}

function collectAdditionalImages(listings, primaryImage) {
  const primary = (primaryImage || "").trim();
  const out = [];
  const seen = new Set();

  for (const l of Array.isArray(listings) ? listings : []) {
    const u = safeImageUrl(l?.image);
    if (!u) continue;
    if (u === primary) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }

  return out;
}

function buildTruthfulDescription(specsSource, internalCategory) {
  const categoryFallback = safeText(internalCategory || "General", 80) || "General";

  const forbiddenKeys = [
    "brand",
    "condition",
    "upc",
    "gtin",
    "sku",
    "mpn",
    "price",
    "saleprice",
    "regularprice",
    "name",
    "title",
    "sync",
    "timestamp",
    "lastupdated",
    "captured",
    "fetched",
    "internal",
    "affiliate",
    "url",
    "image",
    "availability",
    "instock",
    "on_sale",
    "onsale",
  ];

  const items = [];

  if (specsSource && typeof specsSource === "object") {
    if (Array.isArray(specsSource)) {
      const joined = specsSource
        .map((x) => (x == null ? "" : String(x).trim()))
        .filter(Boolean)
        .slice(0, 8)
        .join(" | ");
      const base = joined ? joined : `Product Category: ${categoryFallback}`;
      return safeText(base, 4800) || `Product Category: ${categoryFallback}`;
    }

    for (const [key, value] of Object.entries(specsSource)) {
      if (items.length >= 12) break;

      const lowerKey = String(key).toLowerCase();
      if (forbiddenKeys.some((f) => lowerKey.includes(f))) continue;

      if (value == null) continue;
      const v = String(value).trim();
      if (!v || v.toLowerCase() === "null") continue;

      const cleanKey = safeText(String(key).replace(/_/g, " "), 40);
      const cleanVal = safeText(v, 80);
      if (!cleanKey || !cleanVal) continue;

      const formattedKey = cleanKey.replace(/\b\w/g, (c) => c.toUpperCase());
      items.push(`${formattedKey}: ${cleanVal}`);
    }
  }

  const base = items.length ? items.join(" | ") : `Product Category: ${categoryFallback}`;
  return safeText(base, 4800) || `Product Category: ${categoryFallback}`;
}

function extractColor(name) {
  const colors = [
    "Black",
    "Blue",
    "White",
    "Red",
    "Silver",
    "Gold",
    "Gray",
    "Grey",
    "Pink",
    "Green",
    "Purple",
    "Yellow",
    "Orange",
    "Titanium",
    "Midnight",
    "Starlight",
    "Space Gray",
    "Space Grey",
  ];

  const n = (name ?? "").toString().toLowerCase();
  const found = colors.find((c) => n.includes(c.toLowerCase()));
  return found || "Multicolor";
}

function getGoogleCategory(text) {
  const t = (text ?? "").toString().toLowerCase();

  if (t.includes("laptop") || t.includes("notebook") || t.includes("macbook")) return "278";
  if (t.includes("phone") || t.includes("smartphone") || t.includes("iphone") || t.includes("galaxy")) return "267";
  if (t.includes("tablet") || t.includes("ipad")) return "473";
  if (t.includes("headphone") || t.includes("earbud") || t.includes("airpods") || t.includes("audio")) return "4476";
  if (t.includes("camera") || t.includes("dslr") || t.includes("mirrorless") || t.includes("gopro")) return "152";
  if (t.includes("tv") || t.includes("television") || t.includes("oled") || t.includes("qled") || t.includes("monitor"))
    return "3071";
  if (t.includes("playstation") || t.includes("xbox") || t.includes("nintendo") || t.includes("console")) return "2313";
  if (t.includes("video game") || (t.includes("game") && !t.includes("console"))) return "1279";
  if (t.includes("drone")) return "4809";
  if (t.includes("smartwatch") || (t.includes("watch") && !t.includes("watch band"))) return "512";
  if (t.includes("sunglass") || t.includes("eyewear") || t.includes("glasses")) return "178";
  if (t.includes("dishwasher") || t.includes("washer") || t.includes("dryer") || t.includes("refrigerator")) return "612";
  if (t.includes("kitchen") || t.includes("appliance") || t.includes("microwave") || t.includes("blender")) return "536";
  if (t.includes("smart home") || t.includes("alexa") || t.includes("assistant") || t.includes("thermostat")) return "4433";

  return "222";
}