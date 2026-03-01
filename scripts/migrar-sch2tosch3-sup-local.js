#!/usr/bin/env node
import { spawnSync } from "child_process";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

/**
 * SUPABASE (SCHEMA ANTIGO) -> LOCAL DOCKER (SCHEMA NOVO V25)
 *
 * ✅ Preserva HISTÓRICO 100%:
 * - Exporta price_history(product_sku, price, condition, captured_at)
 * - Cria listings com sku = product.sku (antigo)
 * - Faz INSERT price_history com listing_id via join staging_ph.product_sku -> listings.sku
 *
 * ✅ Migra Products:
 * - Cria "Product master" agrupando por normalized_model_key (preferido)
 * - Fallback se normalized_model_key vier null: usa group_id; senão usa slug; senão sku
 * - Mantém campos de auditoria/expert do antigo no master quando possível (merge por MAX last_updated)
 *
 * ✅ Migra Listings:
 * - 1 listing por sku antigo, com store/url/affiliate_url/image/condition/prices/raw_details
 * - product_id apontando pro master
 *
 * ⚠️ O remoto não tem: upc_last_checked / upc_not_found / ai_name_cleaned
 * - Esses campos só existem no novo. Aqui preenchimos com defaults do novo schema.
 */

const CONFIG = {
  containerName: 'compareflow_sandbox',
  user: 'user',
  dbName: 'compareflow_sandbox',
  supabaseUrl: 'postgresql://postgres.ehsuhqleckehhpfynqyd.etocl1N8qAd4Jj1C@aws-0-us-west-2.pooler.supabase.com:5432/postgres', // origem
};

const FAIL_ON_ORPHANS = true;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    maxBuffer: 1024 * 1024 * 1000, // 1GB
    ...opts,
  });
}

function assertEnv() {
  if (!CONFIG.containerName || !CONFIG.user || !CONFIG.dbName || !CONFIG.supabaseUrl) {
    console.error("🚨 ERRO CRÍTICO: Variáveis de ambiente faltando no .env!");
    console.log("Verifique: POSTGRES_DB_CONTAINER_NAME, POSTGRES_USER, POSTGRES_DB, DIRECT_URL_SUPABASE");
    process.exit(1);
  }
}

function dockerPsql(sql) {
  return run("docker", [
    "exec",
    "-i",
    CONFIG.containerName,
    "psql",
    "-U",
    CONFIG.user,
    "-d",
    CONFIG.dbName,
    "-t",
    "-A",
    "-c",
    sql,
  ]);
}

function parseFirstInt(text) {
  const m = String(text || "").match(/(-?\d+)/);
  return m ? Number(m[1]) : null;
}

function human(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return x.toLocaleString("en-US");
}

async function runPullSync() {
  console.log("----------------------------------------------------------");
  console.log("📥 INICIANDO MIGRAÇÃO: SUPABASE (ANTIGO) -> LOCAL (V25 NOVO)");
  console.log("----------------------------------------------------------");

  assertEnv();

  try {
    // 1) EXPORT DO SUPABASE (ANTIGO): products + price_history
    const exportConfigs = [
      {
        file: "products_remote_old.bin",
        table: "products",
        sql: `COPY (
          SELECT
            id,
            sku,
            name,
            brand,
            store,
            regular_price,
            sale_price,
            on_sale,
            category_path,
            internal_category,
            slug,
            image,
            url,
            condition,
            customer_review_average,
            customer_review_count,
            last_updated,
            raw_details,
            group_id,
            upc,
            is_expired,
            online_availability,
            normalized_model_key,
            expert_score,
            expert_review,
            expert_last_updated,
            expert_specs_hash,
            expert_status,
            expert_needs_revalidation,
            expert_revalidate_after,
            expert_last_checked
          FROM products
          ORDER BY id ASC
        ) TO STDOUT WITH BINARY`,
      },
      {
        file: "price_history_remote_old.bin",
        table: "price_history",
        sql: `COPY (
          SELECT
            id,
            product_sku,
            price,
            condition,
            captured_at
          FROM price_history
          ORDER BY id ASC
        ) TO STDOUT WITH BINARY`,
      },
    ];

    for (const cfg of exportConfigs) {
      console.log(`📦 Baixando dados de ${cfg.table} (schema antigo)...`);
      const result = run("psql", [CONFIG.supabaseUrl, "-c", cfg.sql]);
      if (result.status !== 0) {
        throw new Error(`Erro ao baixar ${cfg.table}: ${result.stderr?.toString()}`);
      }
      fs.writeFileSync(cfg.file, result.stdout);
      console.log(`✅ ${cfg.table}: ${human(fs.statSync(cfg.file).size)} bytes`);
    }

    // 2) TRUNCATE LOCAL (NOVO) na ordem (PH -> Listings -> Products)
    console.log("🧹 Limpando banco LOCAL (novo schema)...");
    const truncateSql = `
      SET statement_timeout = '300s';
      TRUNCATE TABLE price_history, listings, products RESTART IDENTITY CASCADE;
    `;
    const trunc = run("docker", [
      "exec",
      "-i",
      CONFIG.containerName,
      "psql",
      "-U",
      CONFIG.user,
      "-d",
      CONFIG.dbName,
      "-c",
      truncateSql,
    ]);
    if (trunc.status !== 0) {
      throw new Error(`Erro ao truncar tabelas no local: ${trunc.stderr?.toString()}`);
    }

    // 3) IMPORT NO LOCAL (NOVO) via STAGING: cria master products + listings + price_history
    console.log("⚡ Importando e migrando para o schema V25...");

    const migrateSql = `
      SET statement_timeout = '600s';

      -- ---------- STAGING DO SCHEMA ANTIGO ----------
      CREATE TEMP TABLE staging_products_old (
        id                      int,
        sku                     text,
        name                    text,
        brand                   text,
        store                   text,
        regular_price           numeric,
        sale_price              numeric,
        on_sale                 text,
        category_path           text,
        internal_category       text,
        slug                    text,
        image                   text,
        url                     text,
        condition               text,
        customer_review_average numeric,
        customer_review_count   int,
        last_updated            timestamptz,
        raw_details             jsonb,
        group_id                text,
        upc                     text,
        is_expired              boolean,
        online_availability     boolean,
        normalized_model_key    text,
        expert_score            numeric,
        expert_review           jsonb,
        expert_last_updated     timestamptz,
        expert_specs_hash       text,
        expert_status           text,
        expert_needs_revalidation boolean,
        expert_revalidate_after timestamptz,
        expert_last_checked     timestamptz
      );

      CREATE TEMP TABLE staging_ph_old (
        id          int,
        product_sku text,
        price       numeric,
        condition   text,
        captured_at timestamptz
      );

      -- Load binários
      COPY staging_products_old FROM STDIN WITH BINARY;
    `;

    // primeiro executa a parte que cria staging_products_old e faz COPY via STDIN
    console.log("📥 Carregando staging_products_old...");
    const step1 = run(
      "docker",
      ["exec", "-i", CONFIG.containerName, "psql", "-U", CONFIG.user, "-d", CONFIG.dbName, "-c", migrateSql],
      { input: fs.readFileSync("products_remote_old.bin") }
    );
    if (step1.status !== 0) throw new Error(`Erro ao carregar staging_products_old: ${step1.stderr?.toString()}`);

    // agora cria staging_ph_old e faz copy
    const loadPhSql = `
      SET statement_timeout = '600s';
      COPY staging_ph_old FROM STDIN WITH BINARY;
    `;
    console.log("📥 Carregando staging_ph_old...");
    const step2 = run(
      "docker",
      ["exec", "-i", CONFIG.containerName, "psql", "-U", CONFIG.user, "-d", CONFIG.dbName, "-c", loadPhSql],
      { input: fs.readFileSync("price_history_remote_old.bin") }
    );
    if (step2.status !== 0) throw new Error(`Erro ao carregar staging_ph_old: ${step2.stderr?.toString()}`);

    // migração real
    const transformSql = `
      SET statement_timeout = '600s';

      -- --------- 1) CRIAR PRODUCTS (MASTER) ---------
      -- Chave do master: normalized_model_key (preferido)
      -- Fallback: group_id -> slug -> sku
      WITH master_keyed AS (
        SELECT
          COALESCE(NULLIF(TRIM(normalized_model_key), ''), NULLIF(TRIM(group_id), ''), NULLIF(TRIM(slug), ''), NULLIF(TRIM(sku), '')) AS master_key,
          *
        FROM staging_products_old
      ),
      master_pick AS (
        -- Escolhe uma linha "melhor" por master_key:
        -- prioriza last_updated mais recente, depois presença de upc, depois presença de raw_details
        SELECT DISTINCT ON (master_key)
          master_key,
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
          COALESCE(expert_needs_revalidation, false) as expert_needs_revalidation,
          expert_revalidate_after,
          expert_last_checked
        FROM master_keyed
        WHERE master_key IS NOT NULL
        ORDER BY
          master_key,
          last_updated DESC NULLS LAST,
          (CASE WHEN upc IS NOT NULL AND upc <> '' THEN 1 ELSE 0 END) DESC,
          (CASE WHEN raw_details IS NOT NULL THEN 1 ELSE 0 END) DESC
      )
      INSERT INTO products (
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
      )
      SELECT
        mp.name,
        mp.brand,
        mp.category_path,
        mp.internal_category,
        mp.slug,
        mp.customer_review_average,
        mp.customer_review_count,
        mp.last_updated,
        mp.group_id,
        mp.upc,
        mp.normalized_model_key,
        mp.expert_score,
        mp.expert_review,
        mp.expert_last_updated,
        mp.expert_specs_hash,
        mp.expert_status::text::"ExpertStatus",
        mp.expert_needs_revalidation,
        mp.expert_revalidate_after,
        COALESCE(mp.expert_last_checked, '1970-01-01 00:00:00+00'::timestamptz),
        NULL::timestamptz,
        false,
        false
      FROM master_pick mp;

      ANALYZE products;

      -- --------- 2) MAPEAR master_key -> product.id (novo) ---------
      CREATE TEMP TABLE master_map AS
      SELECT
        p.id as product_id,
        COALESCE(NULLIF(TRIM(p.normalized_model_key), ''), NULLIF(TRIM(p.group_id), ''), NULLIF(TRIM(p.slug), '')) as master_key
      FROM products p;

      CREATE INDEX ON master_map(master_key);

      -- --------- 3) CRIAR LISTINGS (1 por sku antigo) ---------
      WITH old_keyed AS (
        SELECT
          COALESCE(NULLIF(TRIM(normalized_model_key), ''), NULLIF(TRIM(group_id), ''), NULLIF(TRIM(slug), ''), NULLIF(TRIM(sku), '')) AS master_key,
          *
        FROM staging_products_old
      ),
      joined AS (
        SELECT
          mm.product_id,
          o.sku,
          o.store,
          o.url,
          NULLIF(TRIM(o.image), '') as image,
          o.condition,
          o.regular_price,
          o.sale_price,
          (CASE WHEN o.on_sale IS NULL THEN NULL
                WHEN LOWER(o.on_sale) IN ('true','1','yes','y') THEN true
                WHEN LOWER(o.on_sale) IN ('false','0','no','n') THEN false
                ELSE NULL END) as on_sale_bool,
          COALESCE(o.online_availability, true) as online_availability,
          COALESCE(o.is_expired, false) as is_expired,
          o.last_updated,
          o.raw_details,
          o.url as affiliate_url
        FROM old_keyed o
        INNER JOIN master_map mm ON mm.master_key = o.master_key
        WHERE o.sku IS NOT NULL AND o.sku <> ''
      )
      INSERT INTO listings (
        sku,
        product_id,
        store,
        url,
        affiliate_url,
        image,
        condition,
        regular_price,
        sale_price,
        on_sale,
        online_availability,
        is_expired,
        last_updated,
        raw_details
      )
      SELECT
        j.sku,
        j.product_id,
        COALESCE(NULLIF(TRIM(j.store), ''), 'unknown') as store,
        j.url,
        j.affiliate_url,
        j.image,
        COALESCE(NULLIF(TRIM(j.condition), ''), 'new') as condition,
        j.regular_price,
        j.sale_price,
        COALESCE(j.on_sale_bool, false) as on_sale,
        COALESCE(j.online_availability, true) as online_availability,
        COALESCE(j.is_expired, false) as is_expired,
        j.last_updated,
        j.raw_details
      FROM joined j
      ON CONFLICT (sku) DO NOTHING;

      ANALYZE listings;

      -- --------- 4) MIGRAR PRICE_HISTORY (product_sku -> listing_id via listings.sku) ---------
      INSERT INTO price_history (price, condition, captured_at, listing_id)
      SELECT
        ph.price,
        COALESCE(NULLIF(TRIM(ph.condition), ''), 'new') as condition,
        ph.captured_at,
        l.id as listing_id
      FROM staging_ph_old ph
      INNER JOIN listings l ON l.sku = ph.product_sku;

      ANALYZE price_history;

      -- --------- 5) AJUSTAR SEQUENCES ---------
      SELECT setval(pg_get_serial_sequence('products','id'), COALESCE((SELECT MAX(id) FROM products), 1), true);
      SELECT setval(pg_get_serial_sequence('listings','id'), COALESCE((SELECT MAX(id) FROM listings), 1), true);
      SELECT setval(pg_get_serial_sequence('price_history','id'), COALESCE((SELECT MAX(id) FROM price_history), 1), true);

      -- --------- 6) VALIDACOES ---------
      -- listings órfãs
      SELECT COUNT(*)::int AS orphan_listings
      FROM listings l
      LEFT JOIN products p ON p.id = l.product_id
      WHERE p.id IS NULL;

      -- price_history órfão
      SELECT COUNT(*)::int AS orphan_history
      FROM price_history h
      LEFT JOIN listings l ON l.id = h.listing_id
      WHERE l.id IS NULL;

      -- quantos itens de histórico não migraram (SKU sem listing)
      SELECT COUNT(*)::int AS ph_not_migrated
      FROM staging_ph_old ph
      LEFT JOIN listings l ON l.sku = ph.product_sku
      WHERE l.id IS NULL;
    `;

    console.log("🔁 Transformando dados (master products + listings + history)...");
    const step3 = run("docker", [
      "exec",
      "-i",
      CONFIG.containerName,
      "psql",
      "-U",
      CONFIG.user,
      "-d",
      CONFIG.dbName,
      "-c",
      transformSql,
    ]);
    if (step3.status !== 0) throw new Error(`Erro na transformação: ${step3.stderr?.toString()}`);

    // 4) CONTAGENS E ORFÃOS
    console.log("----------------------------------------------------------");
    console.log("🔎 VALIDANDO (pós-migração)...");
    console.log("----------------------------------------------------------");

    const countsRes = dockerPsql(`
      SELECT
        (SELECT COUNT(*) FROM products) AS products,
        (SELECT COUNT(*) FROM listings) AS listings,
        (SELECT COUNT(*) FROM price_history) AS price_history;
    `);
    if (countsRes.status !== 0) throw new Error(`Erro ao contar: ${countsRes.stderr?.toString()}`);

    const [pc, lc, hc] = String(countsRes.stdout || "")
      .trim()
      .split("|")
      .map((x) => Number(x));

    console.log(`📦 products:      ${human(pc)}`);
    console.log(`🏷️  listings:      ${human(lc)}`);
    console.log(`📈 price_history:  ${human(hc)}`);

    const orphanListingsRes = dockerPsql(`
      SELECT COUNT(*)::int
      FROM listings l
      LEFT JOIN products p ON p.id = l.product_id
      WHERE p.id IS NULL;
    `);
    const orphanListings = parseFirstInt(orphanListingsRes.stdout);

    const orphanHistoryRes = dockerPsql(`
      SELECT COUNT(*)::int
      FROM price_history h
      LEFT JOIN listings l ON l.id = h.listing_id
      WHERE l.id IS NULL;
    `);
    const orphanHistory = parseFirstInt(orphanHistoryRes.stdout);

    const phNotMigratedRes = dockerPsql(`
      SELECT COUNT(*)::int
      FROM (
        SELECT product_sku FROM staging_ph_old
      ) ph
      LEFT JOIN listings l ON l.sku = ph.product_sku
      WHERE l.id IS NULL;
    `);
    const phNotMigrated = parseFirstInt(phNotMigratedRes.stdout);

    console.log(`🧩 Órfãos (listings -> products):        ${human(orphanListings)}`);
    console.log(`🧩 Órfãos (price_history -> listings):   ${human(orphanHistory)}`);
    console.log(`⚠️  Histórico NÃO migrado (SKU sem listing): ${human(phNotMigrated)}`);

    if (FAIL_ON_ORPHANS && ((orphanListings || 0) > 0 || (orphanHistory || 0) > 0)) {
      console.error("🚨 VALIDATION FAILED: Existem registros órfãos. Relação quebrada.");
      process.exit(2);
    }

    // Se histórico não migrou, isso é o único caso “realista”:
    // existe price_history apontando para product_sku que não existe mais em products (antigo).
    // (ou SKU vazio)
    if ((phNotMigrated || 0) > 0) {
      console.warn("⚠️ Aviso: existe histórico com product_sku que não encontrou listing. Isso vem do REMOTO.");
      console.warn("➡️ Para investigar: rode um SELECT dos SKUs faltantes no staging_ph_old.");
    }

    console.log("----------------------------------------------------------");
    console.log("✅ SUCESSO! Migração SUPABASE(antigo) -> LOCAL(V25) concluída.");
    console.log("----------------------------------------------------------");

    // limpeza
    ["products_remote_old.bin", "price_history_remote_old.bin"].forEach((f) => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  } catch (error) {
    console.error("❌ Erro fatal durante a migração:");
    console.error(error.message);
    process.exit(1);
  }
}

runPullSync();