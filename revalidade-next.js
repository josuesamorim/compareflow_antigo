// revalidate-next.js
// ✅ Best-practice purge runner for PRICELAB (Next App Router + DB (Prisma) pages)
// - Works even if you DON'T use fetch tags (your current setup)
// - Purges: global pages + search routes + categories + products (optional "full" mode)
// - Safe: uses env vars, supports chunking, retry, and logs clearly

const REVALIDATE_BASE_URL = (process.env.REVALIDATE_BASE_URL || "https://pricelab.tech").trim();
const REVALIDATION_SECRET = (process.env.REVALIDATION_SECRET || "").trim();

const MODE = (process.env.REVALIDATE_MODE || "light").trim().toLowerCase();

// Tuning
const CONCURRENCY = clampInt(process.env.REVALIDATE_CONCURRENCY, 6, 1, 20);
const TIMEOUT_MS = clampInt(process.env.REVALIDATE_TIMEOUT_MS, 20000, 3000, 60000);
const RETRIES = clampInt(process.env.REVALIDATE_RETRIES, 2, 0, 10);
const SLEEP_BETWEEN_BATCHES_MS = clampInt(process.env.REVALIDATE_BATCH_SLEEP_MS, 250, 0, 5000);

// Optional: endpoints you may add server-side to list routes (recommended for FULL mode)
const LIST_ENDPOINTS = {
  // products: `${REVALIDATE_BASE_URL}/api/revalidate-list?type=products`,
  // categories: `${REVALIDATE_BASE_URL}/api/revalidate-list?type=categories`,
};

if (!REVALIDATION_SECRET) {
  console.error("❌ REVALIDATION_SECRET not set. Aborting.");
  process.exit(1);
}

console.log("🔧 Revalidate runner config:");
console.log({
  baseUrl: REVALIDATE_BASE_URL,
  mode: MODE,
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
  retries: RETRIES,
  sleepBetweenBatchesMs: SLEEP_BETWEEN_BATCHES_MS,
});

async function main() {
  // 1) Always purge core paths (highest ROI)
  const corePaths = [
    "/",
    "/categories",
    "/todays-deals",
    "/black-friday",

    // Institutional pages (Merchant Center + trust)
    "/how-it-works",
    "/privacy",
    "/shipping-policy",
    "/return-policy",
    "/about",
    "/contact",
    "/terms",
  ];

  // 2) Search routes / discovery routes (keep ONLY what exists in your app)
  const searchPaths = [
    "/search",
  ];

  // 3) Category listing base route(s)
  const categoryIndexPaths = [
    "/category",
  ];

  // Build purge set by mode
  const plannedPaths = new Set(corePaths);

  if (MODE === "medium" || MODE === "full") {
    for (const p of searchPaths) plannedPaths.add(p);
    for (const p of categoryIndexPaths) plannedPaths.add(p);
  }

  // 4) Tags (only effective if you use fetch cache tags)
  const tagsToClean = ["products", "categories", "search"];

  console.log("\n🧹 STEP A — Revalidate TAGS (only affects fetch cache tags):");
  await revalidateTags(tagsToClean);

  console.log("\n🧹 STEP B — Revalidate CORE PATHS:");
  await revalidatePaths(Array.from(plannedPaths));

  // 5) Full purge: categories + products (requires a list)
  if (MODE === "full") {
    console.log("\n🧹 STEP C — FULL MODE: Revalidate all categories/products (best possible).");

    const categoryList = await tryFetchPathList("categories");
    if (categoryList.length) {
      console.log(`📦 Found ${categoryList.length} category paths.`);
      await revalidatePaths(categoryList);
    } else {
      console.log("⚠️ No category list available. Add a protected /api/revalidate-list?type=categories to purge all category pages.");
    }

    const productList = await tryFetchPathList("products");
    if (productList.length) {
      console.log(`📦 Found ${productList.length} product paths.`);
      await revalidatePaths(productList);
    } else {
      console.log("⚠️ No product list available. Add a protected /api/revalidate-list?type=products to purge all product pages.");
    }
  }

  console.log("\n🏁 Done.");
}

async function revalidateTags(tags) {
  for (const tag of tags) {
    const url = `${REVALIDATE_BASE_URL}/api/revalidate?tag=${encodeURIComponent(tag)}`;
    await hitWithRetry(url);
  }
}

async function revalidatePaths(paths) {
  // Dedup + sanitize
  const unique = Array.from(new Set(paths.map(normalizePath))).filter(Boolean);

  // Chunk into batches for concurrency control
  const batches = chunk(unique, CONCURRENCY);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const results = await Promise.all(
      batch.map(async (path) => {
        const url = `${REVALIDATE_BASE_URL}/api/revalidate?path=${encodeURIComponent(path)}`;
        const success = await hitWithRetry(url);
        return success;
      }),
    );

    for (const r of results) r ? ok++ : fail++;

    console.log(`📍 Batch ${i + 1}/${batches.length} done. ok=${ok} fail=${fail} (batchSize=${batch.length})`);

    if (SLEEP_BETWEEN_BATCHES_MS > 0) {
      await sleep(SLEEP_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`✅ Paths revalidated summary: ok=${ok} fail=${fail} total=${unique.length}`);
}

async function tryFetchPathList(type) {
  const endpoint = LIST_ENDPOINTS[type];
  if (!endpoint) return [];

  const paths = [];
  let cursor = null;

  for (let page = 0; page < 200; page++) {
    const url = cursor ? `${endpoint}&cursor=${encodeURIComponent(cursor)}` : endpoint;
    const json = await fetchJsonWithTimeout(url, TIMEOUT_MS);
    if (!json || !Array.isArray(json.items)) break;

    for (const item of json.items) {
      if (typeof item === "string") paths.push(item);
    }

    cursor = json.nextCursor || null;
    if (!cursor) break;
  }

  return paths;
}

async function hitWithRetry(url) {
  let lastErr = null;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const ok = await hit(url);
      if (ok) return true;
      lastErr = new Error("Non-OK response");
    } catch (err) {
      lastErr = err;
    }
    if (attempt < RETRIES) await sleep(250 * (attempt + 1));
  }

  console.error(`❌ Failed after retries: ${url}`, lastErr?.message || lastErr);
  return false;
}

async function hit(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REVALIDATION_SECRET}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    let json = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }

    if (!res.ok) {
      console.error(`❌ ${res.status} ${url} ->`, json || "(no json)");
      return false;
    }

    console.log(`✅ ${url} -> ${json?.message || "OK"}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${REVALIDATION_SECRET}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`❌ List endpoint failed: ${res.status} ${url}`);
      return null;
    }

    const json = await res.json();
    return json;
  } catch (e) {
    console.error(`❌ List endpoint error: ${url}`, e?.message || e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizePath(p) {
  if (!p) return "";

  let s = String(p).trim();
  if (!s) return "";

  // ✅ If full URL, extract pathname FIRST
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      s = u.pathname || "/";
    }
  } catch {
    // ignore
  }

  // Ensure starts with slash
  if (!s.startsWith("/")) s = `/${s}`;

  // Strip querystring/hash (revalidatePath ignores it; keep stable)
  s = s.split("?")[0].split("#")[0];

  return s || "/";
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function clampInt(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("💥 Fatal:", e?.message || e);
  process.exit(1);
});