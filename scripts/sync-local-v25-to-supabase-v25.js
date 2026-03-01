import { spawnSync } from "child_process";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const CONFIG = {
  containerName: 'compareflow_sandbox',
  user: 'user',
  dbName: 'compareflow_sandbox',
  supabaseUrl: process.env.PRICELAB_SUPABASE_DB || 'postgresql://postgres.qdmftpaaxpydbgnecdrl:C5RfMc5ak28IkaJV@aws-1-us-east-2.pooler.supabase.com:5432/postgres', 
  cleanRemote: String(process.env.CLEAN_REMOTE || "").toLowerCase() === "true",
};

function die(msg) {
  console.error(`\n🚨 ${msg}\n`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    maxBuffer: 1024 * 1024 * 1024, // 1GB
    ...opts,
  });
  if (res.status !== 0) {
    const err = res.stderr?.toString() || "";
    const out = res.stdout?.toString() || "";
    throw new Error(`${cmd} ${args.join(" ")}\n${err}\n${out}`.trim());
  }
  return res;
}

function ensureConfig() {
  const missing = [];
  for (const k of ["containerName", "user", "dbName", "supabaseUrl"]) {
    if (!CONFIG[k]) missing.push(k);
  }
  if (missing.length) {
    die(
      `Variáveis faltando no .env: ${missing.join(", ")}\n` +
        `Verifique: POSTGRES_DB_CONTAINER_NAME, POSTGRES_USER, POSTGRES_DB, PRICELAB_SUPABASE_DB`
    );
  }
}

function exportFromLocalDocker() {
  console.log("----------------------------------------------------------");
  console.log("📤 INICIANDO UPLOAD: LOCAL (DOCKER / V25) -> SUPABASE (V25)");
  console.log("----------------------------------------------------------");

  const exports = [
    {
      file: "products_local_v25.bin",
      label: "products (V25)",
      sql: `
        COPY (
          SELECT
            name,
            brand,
            category_path,
            internal_category,
            slug,
            customer_review_average,
            customer_review_count,
            last_updated,
            group_id,
            upc,
            normalized_model_key,
            expert_score,
            expert_review,
            expert_last_updated,
            expert_specs_hash,
            expert_status,
            expert_needs_revalidation,
            expert_revalidate_after,
            expert_last_checked,
            upc_last_checked,
            upc_not_found,
            ai_name_cleaned
          FROM products
        ) TO STDOUT WITH BINARY;
      `,
    },
    {
      file: "listings_local_v25.bin",
      label: "listings (V25) + product key",
      sql: `
        COPY (
          SELECT
            l.sku,
            p.normalized_model_key AS product_normalized_model_key,
            l.store,
            l.url,
            l.affiliate_url,
            l.image,
            l.condition,
            l.regular_price,
            l.sale_price,
            l.on_sale,
            l.online_availability,
            l.is_expired,
            l.last_updated,
            l.raw_details
          FROM listings l
          INNER JOIN products p ON p.id = l.product_id
        ) TO STDOUT WITH BINARY;
      `,
    },
    {
      file: "price_history_local_v25.bin",
      label: "price_history (V25) by listing_sku",
      sql: `
        COPY (
          SELECT
            l.sku AS listing_sku,
            h.price,
            h.condition,
            h.captured_at
          FROM price_history h
          INNER JOIN listings l ON l.id = h.listing_id
        ) TO STDOUT WITH BINARY;
      `,
    },
  ];

  for (const ex of exports) {
    console.log(`📦 Exportando ${ex.label} do Docker...`);
    const r = run("docker", [
      "exec",
      "-i",
      CONFIG.containerName,
      "psql",
      "-U",
      CONFIG.user,
      "-d",
      CONFIG.dbName,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      ex.sql,
    ]);
    fs.writeFileSync(ex.file, r.stdout);
    console.log(`✅ ${ex.file}: ${r.stdout.length.toLocaleString()} bytes`);
  }
}

function buildRemoteSqlFile() {
  const sqlFile = "migrate_to_supabase_v25.sql";

  const truncateBlock = CONFIG.cleanRemote
    ? `
-- ⚠️ CLEAN_REMOTE=true: limpa remoto antes de importar (evita duplicatas)
TRUNCATE TABLE price_history RESTART IDENTITY CASCADE;
TRUNCATE TABLE listings RESTART IDENTITY CASCADE;
TRUNCATE TABLE products RESTART IDENTITY CASCADE;
`
    : `
-- CLEAN_REMOTE=false: não truncamos. ATENÇÃO: pode gerar duplicatas no price_history se rodar 2x.
`;

  const sql = `
\\set ON_ERROR_STOP on
\\timing on

BEGIN;

${truncateBlock}

-- ---------------------------------------------
-- 1) STAGING TABLES (TEMP)
-- ---------------------------------------------
CREATE TEMP TABLE staging_products_v25 (
  name                    text,
  brand                   text,
  category_path           text,
  internal_category       text,
  slug                    text,
  customer_review_average numeric,
  customer_review_count   integer,
  last_updated            timestamptz,
  group_id                text,
  upc                     text,
  normalized_model_key    text,
  expert_score            numeric,
  expert_review           jsonb,
  expert_last_updated     timestamptz,
  expert_specs_hash       text,
  expert_status           text,
  expert_needs_revalidation boolean,
  expert_revalidate_after timestamptz,
  expert_last_checked     timestamptz,
  upc_last_checked        timestamptz,
  upc_not_found           boolean,
  ai_name_cleaned         boolean
);

CREATE TEMP TABLE staging_listings_v25 (
  sku                       text,
  product_normalized_model_key text,
  store                     text,
  url                       text,
  affiliate_url             text,
  image                     text,
  condition                 text,
  regular_price             numeric,
  sale_price                numeric,
  on_sale                   boolean,
  online_availability       boolean,
  is_expired                boolean,
  last_updated              timestamptz,
  raw_details               jsonb
);

CREATE TEMP TABLE staging_price_history_v25 (
  listing_sku   text,
  price         numeric,
  condition     text,
  captured_at   timestamptz
);

-- ---------------------------------------------
-- 2) COPY BIN -> STAGING (psql meta-commands)
-- ---------------------------------------------
\\echo '📥 Loading staging_products_v25...'
\\copy staging_products_v25 FROM 'products_local_v25.bin' WITH BINARY;

\\echo '📥 Loading staging_listings_v25...'
\\copy staging_listings_v25 FROM 'listings_local_v25.bin' WITH BINARY;

\\echo '📥 Loading staging_price_history_v25...'
\\copy staging_price_history_v25 FROM 'price_history_local_v25.bin' WITH BINARY;

-- ---------------------------------------------
-- 3) UPSERT PRODUCTS (by normalized_model_key, fallback slug)
-- ---------------------------------------------
\\echo '⚡ Upserting products (normalized_model_key)...'

-- 3.1: Normalized key (ideal)
INSERT INTO products (
  name, brand, category_path, internal_category, slug,
  customer_review_average, customer_review_count, last_updated,
  group_id, upc, normalized_model_key,
  expert_score, expert_review, expert_last_updated, expert_specs_hash,
  expert_status, expert_needs_revalidation, expert_revalidate_after, expert_last_checked,
  upc_last_checked, upc_not_found, ai_name_cleaned
)
SELECT
  name, brand, category_path, internal_category, slug,
  customer_review_average, customer_review_count, last_updated,
  group_id, upc, normalized_model_key,
  expert_score, expert_review, expert_last_updated, expert_specs_hash,
  CAST(NULLIF(expert_status, '') AS public."ExpertStatus"), COALESCE(expert_needs_revalidation,false), expert_revalidate_after,
  expert_last_checked,
  upc_last_checked, COALESCE(upc_not_found,false), COALESCE(ai_name_cleaned,false)
FROM staging_products_v25
WHERE normalized_model_key IS NOT NULL AND normalized_model_key <> ''
ON CONFLICT (normalized_model_key) DO UPDATE SET
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  category_path = EXCLUDED.category_path,
  internal_category = EXCLUDED.internal_category,
  slug = EXCLUDED.slug,
  customer_review_average = EXCLUDED.customer_review_average,
  customer_review_count = EXCLUDED.customer_review_count,
  last_updated = EXCLUDED.last_updated,
  group_id = EXCLUDED.group_id,
  upc = EXCLUDED.upc,
  expert_score = EXCLUDED.expert_score,
  expert_review = EXCLUDED.expert_review,
  expert_last_updated = EXCLUDED.expert_last_updated,
  expert_specs_hash = EXCLUDED.expert_specs_hash,
  expert_status = EXCLUDED.expert_status,
  expert_needs_revalidation = EXCLUDED.expert_needs_revalidation,
  expert_revalidate_after = EXCLUDED.expert_revalidate_after,
  expert_last_checked = EXCLUDED.expert_last_checked,
  upc_last_checked = EXCLUDED.upc_last_checked,
  upc_not_found = EXCLUDED.upc_not_found,
  ai_name_cleaned = EXCLUDED.ai_name_cleaned;

-- 3.2: Fallback por slug (se normalized_model_key for null/empty)
\\echo '⚡ Upserting products (slug fallback)...'
INSERT INTO products (
  name, brand, category_path, internal_category, slug,
  customer_review_average, customer_review_count, last_updated,
  group_id, upc, normalized_model_key,
  expert_score, expert_review, expert_last_updated, expert_specs_hash,
  expert_status, expert_needs_revalidation, expert_revalidate_after, expert_last_checked,
  upc_last_checked, upc_not_found, ai_name_cleaned
)
SELECT
  name, brand, category_path, internal_category, slug,
  customer_review_average, customer_review_count, last_updated,
  group_id, upc, NULLIF(normalized_model_key,''),
  expert_score, expert_review, expert_last_updated, expert_specs_hash,
  CAST(NULLIF(expert_status, '') AS public."ExpertStatus"), COALESCE(expert_needs_revalidation,false), expert_revalidate_after,
  expert_last_checked,
  upc_last_checked, COALESCE(upc_not_found,false), COALESCE(ai_name_cleaned,false)
FROM staging_products_v25
WHERE (normalized_model_key IS NULL OR normalized_model_key = '')
  AND slug IS NOT NULL AND slug <> ''
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  brand = EXCLUDED.brand,
  category_path = EXCLUDED.category_path,
  internal_category = EXCLUDED.internal_category,
  customer_review_average = EXCLUDED.customer_review_average,
  customer_review_count = EXCLUDED.customer_review_count,
  last_updated = EXCLUDED.last_updated,
  group_id = EXCLUDED.group_id,
  upc = EXCLUDED.upc,
  expert_score = EXCLUDED.expert_score,
  expert_review = EXCLUDED.expert_review,
  expert_last_updated = EXCLUDED.expert_last_updated,
  expert_specs_hash = EXCLUDED.expert_specs_hash,
  expert_status = EXCLUDED.expert_status,
  expert_needs_revalidation = EXCLUDED.expert_needs_revalidation,
  expert_revalidate_after = EXCLUDED.expert_revalidate_after,
  expert_last_checked = EXCLUDED.expert_last_checked,
  upc_last_checked = EXCLUDED.upc_last_checked,
  upc_not_found = EXCLUDED.upc_not_found,
  ai_name_cleaned = EXCLUDED.ai_name_cleaned;

-- ---------------------------------------------
-- 4) UPSERT LISTINGS (resolve product_id via normalized_model_key)
-- ---------------------------------------------
\\echo '⚡ Upserting listings...'

CREATE TEMP TABLE product_key_map AS
SELECT id, normalized_model_key
FROM products
WHERE normalized_model_key IS NOT NULL AND normalized_model_key <> '';

INSERT INTO listings (
  sku, product_id, store, url, affiliate_url, image,
  condition, regular_price, sale_price, on_sale,
  online_availability, is_expired, last_updated, raw_details
)
SELECT
  s.sku,
  pkm.id AS product_id,
  s.store,
  s.url,
  s.affiliate_url,
  s.image,
  COALESCE(NULLIF(s.condition,''), 'new'),
  s.regular_price,
  s.sale_price,
  COALESCE(s.on_sale,false),
  COALESCE(s.online_availability,true),
  COALESCE(s.is_expired,false),
  s.last_updated,
  s.raw_details
FROM staging_listings_v25 s
INNER JOIN product_key_map pkm
  ON pkm.normalized_model_key = s.product_normalized_model_key
WHERE s.sku IS NOT NULL AND s.sku <> ''
ON CONFLICT (sku) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  store = EXCLUDED.store,
  url = EXCLUDED.url,
  affiliate_url = EXCLUDED.affiliate_url,
  image = EXCLUDED.image,
  condition = EXCLUDED.condition,
  regular_price = EXCLUDED.regular_price,
  sale_price = EXCLUDED.sale_price,
  on_sale = EXCLUDED.on_sale,
  online_availability = EXCLUDED.online_availability,
  is_expired = EXCLUDED.is_expired,
  last_updated = EXCLUDED.last_updated,
  raw_details = EXCLUDED.raw_details;

-- ---------------------------------------------
-- 5) INSERT PRICE HISTORY (resolve listing_id via sku)
-- ---------------------------------------------
\\echo '⚡ Inserting price_history...'

-- Se CLEAN_REMOTE=false, esse insert pode duplicar.
-- Se quiser dedupe sem truncar, dá pra criar índice único ou filtrar com WHERE NOT EXISTS (bem mais lento).
INSERT INTO price_history (listing_id, price, condition, captured_at)
SELECT
  l.id AS listing_id,
  s.price,
  COALESCE(NULLIF(s.condition,''), 'new'),
  s.captured_at
FROM staging_price_history_v25 s
INNER JOIN listings l ON l.sku = s.listing_sku;

COMMIT;

-- ---------------------------------------------
-- 6) VALIDATION
-- ---------------------------------------------
\\echo '----------------------------------------------------------'
\\echo '🔎 VALIDATING (remote)...'
\\echo '----------------------------------------------------------'

SELECT 'products' AS table, COUNT(*)::int AS count FROM products;
SELECT 'listings' AS table, COUNT(*)::int AS count FROM listings;
SELECT 'price_history' AS table, COUNT(*)::int AS count FROM price_history;

-- Orphans check
SELECT 'orphans_listings_products' AS check, COUNT(*)::int AS count
FROM listings l
LEFT JOIN products p ON p.id = l.product_id
WHERE p.id IS NULL;

SELECT 'orphans_ph_listings' AS check, COUNT(*)::int AS count
FROM price_history h
LEFT JOIN listings l ON l.id = h.listing_id
WHERE l.id IS NULL;

\\echo '----------------------------------------------------------'
\\echo '✅ DONE'
\\echo '----------------------------------------------------------'
`;

  fs.writeFileSync(sqlFile, sql, "utf8");
  return sqlFile;
}

function importIntoSupabase(sqlFile) {
  console.log("----------------------------------------------------------");
  console.log("⚡ IMPORTANDO PARA SUPABASE (V25)...");
  console.log("----------------------------------------------------------");

  // Executa o script SQL no destino (psql local conectando no Supabase)
  run("psql", [CONFIG.supabaseUrl, "-f", sqlFile], { stdio: "inherit" });
}

function cleanup(files) {
  console.log("🧽 Limpando arquivos temporários...");
  for (const f of files) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

async function main() {
  ensureConfig();

  try {
    exportFromLocalDocker();
    const sqlFile = buildRemoteSqlFile();
    importIntoSupabase(sqlFile);

    cleanup([
      "products_local_v25.bin",
      "listings_local_v25.bin",
      "price_history_local_v25.bin",
      "migrate_to_supabase_v25.sql",
    ]);
  } catch (e) {
    console.error("❌ Erro fatal durante o upload/migração:");
    console.error(e?.message || e);
    process.exit(1);
  }
}

main();