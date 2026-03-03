import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * IndexNow (Bing) submit endpoint
 * - V25 schema compatible (Product has NO isExpired/onlineAvailability anymore; Listing does)
 * - Sends only URLs that have at least one ACTIVE + IN_STOCK listing
 * - Supports pagination with ?offset=0,10000,20000...
 * - Adds categories only on offset=0
 * - Strict auth via Bearer token (INDEXNOW_SECRET)
 */
export async function POST(request) {
  // ✅ Robust auth (trim to avoid whitespace issues)
  const authHeader = (request.headers.get("authorization") || "").trim();
  const secret = (process.env.INDEXNOW_SECRET || "").trim();

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Invalid or missing INDEXNOW_SECRET token." },
      { status: 401 },
    );
  }

  // ✅ Validate IndexNow key env
  const indexNowKey = (process.env.INDEXNOW_KEY || "").trim();
  if (!indexNowKey) {
    return NextResponse.json(
      { error: "Misconfigured", message: "INDEXNOW_KEY is not configured in environment." },
      { status: 500 },
    );
  }

  const baseUrl = "https://www.pricelab.tech";


  // Pagination
  const { searchParams } = new URL(request.url);
  const offsetRaw = (searchParams.get("offset") || "0").trim();
  const offset = Number.parseInt(offsetRaw, 10);

  if (!Number.isFinite(offset) || offset < 0) {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid offset. Use ?offset=0 or a positive integer." },
      { status: 400 },
    );
  }

  // IndexNow limit: 10,000 URLs per request
  const TAKE = 10000;

  try {
    /**
     * PRODUCTS (V25)
     * - Only products with a slug
     * - Only products that have at least one valid listing:
     *   isExpired=false AND onlineAvailability=true
     *
     * Note: do NOT require image here; image is a Merchant requirement, not IndexNow.
     * For indexing, we prefer breadth, but keep it truthful (only in-stock).
     */
    const products = await prisma.product.findMany({
      where: {
        slug: { not: null },
        listings: {
          some: {
            isExpired: false,
            onlineAvailability: true,
          },
        },
      },
      select: {
        slug: true,
        lastUpdated: true,
      },
      orderBy: {
        lastUpdated: "desc",
      },
      take: TAKE,
      skip: offset,
    });

    /**
     * CATEGORIES (only on first batch)
     * - only categories that have at least one product with at least one valid listing
     * - distinct by internalCategory
     */
    let categoryUrls = [];
    if (offset === 0) {
      const categories = await prisma.product.findMany({
        where: {
          internalCategory: { not: null, not: "" },
          listings: {
            some: {
              isExpired: false,
              onlineAvailability: true,
            },
          },
        },
        distinct: ["internalCategory"],
        select: { internalCategory: true },
        orderBy: { lastUpdated: "desc" },
        take: 300, // safety cap
      });

      categoryUrls = categories
        .map((cat) => normalizeCategoryToUrl(`${baseUrl}/category`, cat.internalCategory))
        .filter(Boolean);

      // High priority pages (only once)
      categoryUrls.push(`${baseUrl}/black-friday`);
      categoryUrls.push(`${baseUrl}/todays-deals`);
      categoryUrls.push(`${baseUrl}/categories`);
    }

    // If nothing to send, finish
    if ((!products || products.length === 0) && categoryUrls.length === 0) {
      return NextResponse.json({
        message: "No new content to index.",
        offset,
        sent: 0,
      });
    }

    const productUrls = (products || [])
      .map((p) => safeProductUrl(baseUrl, p.slug))
      .filter(Boolean);

    // Combine + dedupe + hard cap to 10k
    const urlList = dedupeUrls([...categoryUrls, ...productUrls]).slice(0, TAKE);

    if (urlList.length === 0) {
      return NextResponse.json({
        message: "No valid URLs after filtering/deduping.",
        offset,
        sent: 0,
      });
    }

    // IndexNow payload
    const payload = {
      host: "pricelab.tech",
      key: indexNowKey,
      keyLocation: `${baseUrl}/${indexNowKey}.txt`,
      urlList,
    };

    // ✅ Fast timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // IndexNow sometimes returns text; preserve it
    const text = await response.text().catch(() => "");

    if (response.ok) {
      return NextResponse.json(
        {
          message: `Success! Sent ${urlList.length} URLs (categories=${categoryUrls.length}, products=${productUrls.length}, offset=${offset}).`,
          offset,
          sent: urlList.length,
          categoriesSent: categoryUrls.length,
          productsFound: products.length,
          // Helpful for chaining calls in automation
          nextOffset: products.length === TAKE ? offset + TAKE : null,
          indexNowResponse: text || "OK",
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        error: "IndexNowError",
        status: response.status,
        message: text || "IndexNow returned a non-OK response.",
      },
      { status: response.status },
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      return NextResponse.json(
        { error: "Timeout", message: "Timeout while calling IndexNow (15s)." },
        { status: 504 },
      );
    }

    console.error("IndexNow Error:", error);
    return NextResponse.json(
      { error: "InternalServerError", message: error?.message || "Unexpected server error." },
      { status: 500 },
    );
  }
}

/* ---------------- Helpers ---------------- */

function safeProductUrl(baseUrl, slug) {
  const s = (slug ?? "").toString().trim();
  if (!s) return null;
  // keep canonical safe
  return `${baseUrl}/product/${encodeURIComponent(s)}`;
}

function normalizeCategoryToUrl(basePath, internalCategory) {
  const raw = (internalCategory ?? "").toString().trim();
  if (!raw) return null;

  // match your routing: /category/[slug]
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "");

  if (!slug) return null;
  return `${basePath}/${encodeURIComponent(slug)}`;
}

function dedupeUrls(urls) {
  const out = [];
  const seen = new Set();

  for (const u of urls) {
    const s = (u ?? "").toString().trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }

  return out;
}