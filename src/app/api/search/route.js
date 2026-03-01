// src/app/api/search/route.js
import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * API SEARCH V25 - MOTOR DE BUSCA MULTI-TENANT
 * Schema: Product + Listings (1:N)
 * Objetivo: Agrupar ofertas por produto, priorizando o menor preço e aplicando filtros hard.
 *
 * ✅ FIX CRÍTICO (Refurbished/OpenBox sumindo):
 * - Antes: o hard filter exigia imagem na listing escolhida (bl.listing_image).
 * - Problema real: muitas ofertas refurb/open-box no eBay/BestBuy vêm com image NULL.
 * - Agora: oferta/preço respeita o filtro de condição, MAS imagem pode vir de:
 *   1) listing escolhida (bl.listing_image)
 *   2) melhor imagem de qualquer listing do produto (ri.ref_image)
 *
 * ✅ FIX V26 (UI colapsando ao voltar com condition selecionado):
 * - meta_conditions vem do universo de produtos que batem na busca,
 *   mas SEM aplicar o filtro de condition (para manter todas as opções no sidebar).
 *
 * ✅ FIX V26 (duplicidade "Refurbished" 2x):
 * - Normalização canônica no SQL para: new/open_box/refurbished/used.
 * - meta_conditions retorna APENAS esses valores canônicos.
 *
 * ⚠️ IMPORTANTE:
 * - Seu schema Product NÃO tem coluna image.
 * - Portanto, NÃO usamos p.image em nenhum lugar.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // 1. EXTRAÇÃO E HIGIENIZAÇÃO
  const query = searchParams.get("q")?.trim() || "";
  const brandParam = searchParams.get("brand");
  const conditionParam = searchParams.get("condition");
  const category = searchParams.get("category");
  const sortBy = searchParams.get("sortBy") || "relevance";

  const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit")) || 24));
  const offset = (page - 1) * limit;

  // Helpers: escape seguro para SQL literal dentro do $queryRawUnsafe
  const escapeSqlLiteral = (s) => String(s ?? "").replace(/'/g, "''");
  const toArray = (raw) =>
    raw && raw !== "all" && raw !== "" ? raw.split(",").map((x) => x.trim()).filter(Boolean) : null;

  // LIKE/ILIKE patterns: mantém %...% mas protege aspas simples
  const escapeLikePattern = (s) => escapeSqlLiteral(s);

  // Normaliza filtros de condição (tolerante a "open-box" vs "open box" vs "open_box", etc)
  const expandConditionTokens = (rawCond) => {
    const c = String(rawCond ?? "").trim().toLowerCase();
    if (!c) return [];

    // ✅ UI canônica
    if (c === "new") return ["new", "brand new", "novo"];
    if (c === "open-box" || c === "open_box" || c === "open box" || c === "openbox") {
      return ["open box", "open-box", "open_box", "openbox"];
    }
    if (c === "refurbished" || c === "renewed" || c.includes("refurb")) {
      return ["refurbished", "renewed", "refurb", "reconditioned", "certified refurbished", "seller refurbished"];
    }
    if (c === "pre-owned" || c === "preowned" || c === "used") {
      return ["used", "pre-owned", "preowned", "seminovo"];
    }

    // fallback
    return [c];
  };

  try {
    // 2. PREPARAÇÃO DE VARIÁVEIS E FILTROS
    const brandFilters = toArray(brandParam);
    const condFiltersRaw = toArray(conditionParam);
    const catFilter = category && category !== "all" && category !== "" ? category : null;

    // Query limpa p/ interpolação
    const safeQuery = escapeSqlLiteral(query);
    const exactString = `%${escapeLikePattern(query)}%`;

    // Motor tolerante a símbolos
    const cleanWords = query
      .replace(/[^\p{L}\p{N}]/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    // tsQuery AND
    const tsQueryAnd = cleanWords.length > 0 ? cleanWords.map((t) => `${escapeSqlLiteral(t)}:*`).join(" & ") : "";

    // ILIKE word-by-word
    const ilikeConditions =
      cleanWords.length > 0
        ? cleanWords.map((w) => `p.name ILIKE '%${escapeLikePattern(w)}%'`).join(" AND ")
        : "1=1";

    // Monta cláusulas dinâmicas SEM risco de "AND" solto
    const brandClause =
      brandFilters && brandFilters.length > 0
        ? ` AND p.brand = ANY(ARRAY[${brandFilters.map((b) => `'${escapeSqlLiteral(b)}'`).join(",")}])`
        : "";

    // ✅ Condição: expande tokens para cobrir variações
    const expandedCondTokens =
      condFiltersRaw && condFiltersRaw.length > 0
        ? Array.from(
            new Set(
              condFiltersRaw.flatMap((c) => expandConditionTokens(c)).map((t) => t.trim()).filter(Boolean),
            ),
          )
        : null;

    /**
     * ✅ O filtro por condition é aplicado APENAS em ActiveListingsFiltered
     * ✅ meta_conditions vem de ActiveListingsAll (sem condition)
     */
    const condClauseForListingsFiltered =
      expandedCondTokens && expandedCondTokens.length > 0
        ? ` AND LOWER(COALESCE(l.condition,'')) LIKE ANY(ARRAY[${expandedCondTokens
            .map((t) => `'%${escapeLikePattern(t)}%'`)
            .join(",")}])`
        : "";

    const catClause = catFilter ? ` AND p.internal_category = '${escapeSqlLiteral(catFilter)}'` : "";

    const rawResult = await prisma.$queryRawUnsafe(`
      WITH ReferenceImages AS (
        SELECT DISTINCT ON (l.product_id)
          l.product_id,
          l.image AS ref_image
        FROM listings l
        WHERE l.image IS NOT NULL
          AND l.image != ''
          AND l.image NOT ILIKE '%placeholder%'
        ORDER BY
          l.product_id,
          CASE
            WHEN LOWER(l.store) LIKE '%best%' THEN 0
            WHEN LOWER(l.store) LIKE '%amazon%' THEN 1
            WHEN LOWER(l.store) LIKE '%walmart%' THEN 2
            WHEN LOWER(l.store) LIKE '%ebay%' THEN 3
            ELSE 9
          END ASC,
          l.last_updated DESC NULLS LAST
      ),

      ActiveListingsAll AS (
        SELECT
          l.product_id,
          l.sku,
          l.store,
          l.url,
          l.affiliate_url,
          l.image AS listing_image,
          l.condition AS raw_condition,
          CASE
            WHEN LOWER(COALESCE(l.condition,'')) = 'new'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%brand new%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%novo%'
              THEN 'new'
            WHEN LOWER(COALESCE(l.condition,'')) LIKE '%open box%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%open-box%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%open_box%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%openbox%'
              THEN 'open_box'
            WHEN LOWER(COALESCE(l.condition,'')) LIKE '%refurb%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%renewed%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%reconditioned%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%certified%'
              THEN 'refurbished'
            WHEN LOWER(COALESCE(l.condition,'')) LIKE '%used%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%pre-owned%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%preowned%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%seminovo%'
              THEN 'used'
            ELSE 'new'
          END AS condition,
          l.sale_price,
          l.regular_price,
          l.on_sale,
          l.is_expired,
          l.online_availability,
          l.last_updated
        FROM listings l
        WHERE l.is_expired = false
          AND l.online_availability = true
          AND l.sale_price > 5
      ),

      ActiveListingsFiltered AS (
        SELECT
          l.product_id,
          l.sku,
          l.store,
          l.url,
          l.affiliate_url,
          l.image AS listing_image,
          l.condition AS raw_condition,
          CASE
            WHEN LOWER(COALESCE(l.condition,'')) = 'new'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%brand new%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%novo%'
              THEN 'new'
            WHEN LOWER(COALESCE(l.condition,'')) LIKE '%open box%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%open-box%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%open_box%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%openbox%'
              THEN 'open_box'
            WHEN LOWER(COALESCE(l.condition,'')) LIKE '%refurb%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%renewed%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%reconditioned%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%certified%'
              THEN 'refurbished'
            WHEN LOWER(COALESCE(l.condition,'')) LIKE '%used%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%pre-owned%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%preowned%'
              OR LOWER(COALESCE(l.condition,'')) LIKE '%seminovo%'
              THEN 'used'
            ELSE 'new'
          END AS condition,
          l.sale_price,
          l.regular_price,
          l.on_sale,
          l.is_expired,
          l.online_availability,
          l.last_updated
        FROM listings l
        WHERE l.is_expired = false
          AND l.online_availability = true
          AND l.sale_price > 5
          ${condClauseForListingsFiltered}
      ),

      BestListingPerProduct AS (
        SELECT DISTINCT ON (product_id)
          product_id, sku, store, url, affiliate_url, listing_image,
          condition, sale_price, regular_price, on_sale
        FROM ActiveListingsFiltered
        ORDER BY product_id, sale_price ASC
      ),

      BaseProducts AS (
        SELECT
          p.id,
          p.name,
          p.brand,
          p.slug,
          p.internal_category,
          p.normalized_model_key,
          p.upc,
          bl.sku,
          bl.store,
          bl.url,
          bl.affiliate_url,
          COALESCE(bl.listing_image, ri.ref_image) AS final_image,
          bl.condition,
          bl.sale_price,
          bl.regular_price,
          p.last_updated,

          CASE
            WHEN p.upc = '${safeQuery}' THEN 1000.0
            WHEN bl.sku = '${safeQuery}' THEN 900.0
            WHEN p.normalized_model_key ILIKE '${escapeLikePattern(exactString)}' THEN 800.0
            WHEN p.name ILIKE '${escapeLikePattern(exactString)}' THEN 700.0
            WHEN (${ilikeConditions}) THEN 600.0
            WHEN ('${tsQueryAnd}' != '' AND p.search_vector @@ to_tsquery('english', '${tsQueryAnd}'))
              THEN 500.0 + ts_rank_cd(p.search_vector, to_tsquery('english', '${tsQueryAnd}'))
            ELSE word_similarity('${safeQuery}', p.name) * 100.0
          END AS relevance_score,

          CASE
            WHEN p.name ILIKE '% for %' OR p.name ILIKE '% para %' OR p.name ILIKE '% compatible %' THEN -65.0
            WHEN p.name ILIKE ANY(ARRAY['%case%', '%monitor%', '%cover%', '%protector%', '%glass%', '%cable%', '%strap%', '%adapter%']) THEN -35.0
            ELSE 0.0
          END AS accessory_penalty,

          CASE
            WHEN ('${safeQuery}' ILIKE '%macbook%' AND p.brand ILIKE 'Apple') OR
                 ('${safeQuery}' ILIKE '%iphone%' AND p.brand ILIKE 'Apple') OR
                 ('${safeQuery}' ILIKE '%playstation%' AND p.brand ILIKE 'Sony') THEN 50.0
            ELSE 0.0
          END AS brand_authority_boost,

          CASE
            WHEN bl.sale_price > 500 THEN 30.0
            WHEN bl.sale_price > 200 THEN 15.0
            ELSE 0.0
          END AS price_tier_boost

        FROM products p
        INNER JOIN BestListingPerProduct bl ON p.id = bl.product_id
        LEFT JOIN ReferenceImages ri ON ri.product_id = p.id
        WHERE
          COALESCE(bl.listing_image, ri.ref_image) IS NOT NULL
          AND COALESCE(bl.listing_image, ri.ref_image) != ''
          AND COALESCE(bl.listing_image, ri.ref_image) NOT ILIKE '%placeholder%'

          AND (
            '${safeQuery}' = ''
            OR p.upc = '${safeQuery}'
            OR bl.sku = '${safeQuery}'
            OR p.normalized_model_key ILIKE '${escapeLikePattern(exactString)}'
            OR p.slug ILIKE '${escapeLikePattern(exactString)}'
            OR p.brand ILIKE '${escapeLikePattern(exactString)}'
            OR (${ilikeConditions})
            OR ('${tsQueryAnd}' != '' AND p.search_vector @@ to_tsquery('english', '${tsQueryAnd}'))
            OR word_similarity('${safeQuery}', p.name) > 0.35
          )
          ${brandClause}
          ${catClause}
      ),

      MatchedProducts AS (
        SELECT DISTINCT
          p.id AS product_id
        FROM products p
        INNER JOIN ActiveListingsAll al ON p.id = al.product_id
        LEFT JOIN ReferenceImages ri ON ri.product_id = p.id
        WHERE
          COALESCE(al.listing_image, ri.ref_image) IS NOT NULL
          AND COALESCE(al.listing_image, ri.ref_image) != ''
          AND COALESCE(al.listing_image, ri.ref_image) NOT ILIKE '%placeholder%'

          AND (
            '${safeQuery}' = ''
            OR p.upc = '${safeQuery}'
            OR al.sku = '${safeQuery}'
            OR p.normalized_model_key ILIKE '${escapeLikePattern(exactString)}'
            OR p.slug ILIKE '${escapeLikePattern(exactString)}'
            OR p.brand ILIKE '${escapeLikePattern(exactString)}'
            OR (${ilikeConditions})
            OR ('${tsQueryAnd}' != '' AND p.search_vector @@ to_tsquery('english', '${tsQueryAnd}'))
            OR word_similarity('${safeQuery}', p.name) > 0.35
          )
          ${brandClause}
          ${catClause}
      ),

      FilterMetadata AS (
        SELECT
          ARRAY_AGG(DISTINCT p.brand ORDER BY p.brand) FILTER (WHERE p.brand IS NOT NULL AND p.brand != '') AS all_brands,
          ARRAY_AGG(DISTINCT al.condition ORDER BY al.condition) FILTER (WHERE al.condition IS NOT NULL AND al.condition != '') AS all_conditions
        FROM MatchedProducts mp
        INNER JOIN products p ON p.id = mp.product_id
        INNER JOIN ActiveListingsAll al ON al.product_id = mp.product_id
      ),

      Suggestion AS (
        SELECT brand AS suggested_term FROM products
        WHERE brand % '${safeQuery}'
        ORDER BY similarity(brand, '${safeQuery}') DESC
        LIMIT 1
      ),

      FinalResults AS (
        SELECT * FROM BaseProducts
        ORDER BY
          CASE WHEN '${escapeSqlLiteral(sortBy)}' = 'relevance'
            THEN (relevance_score + brand_authority_boost + price_tier_boost + accessory_penalty)
          END DESC,
          CASE WHEN '${escapeSqlLiteral(sortBy)}' = 'lowest' THEN sale_price END ASC,
          CASE WHEN '${escapeSqlLiteral(sortBy)}' = 'highest' THEN sale_price END DESC,
          last_updated DESC
        LIMIT ${limit} OFFSET ${offset}
      )

      SELECT
        (SELECT COUNT(*) FROM BaseProducts)::int AS total_count,
        COALESCE((SELECT all_brands FROM FilterMetadata), ARRAY[]::text[]) AS meta_brands,
        COALESCE((SELECT all_conditions FROM FilterMetadata), ARRAY[]::text[]) AS meta_conditions,
        COALESCE((SELECT json_agg(FinalResults.*) FROM FinalResults), '[]'::json) AS items,
        (SELECT suggested_term FROM Suggestion LIMIT 1) AS correction;
    `);

    // 4. PROCESSAMENTO DOS DADOS
    const firstRow = rawResult?.[0];

    if (!firstRow || Number(firstRow.total_count) === 0) {
      return NextResponse.json({
        items: [],
        didYouMean: null,
        meta: { totalItems: 0, totalPages: 0, currentPage: page, brands: [], conditions: [] },
      });
    }

    const products = Array.isArray(firstRow.items) ? firstRow.items : [];
    const totalCount = Number(firstRow.total_count) || 0;

    const result = {
      items: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        image: p.final_image,
        slug: p.slug,
        brand: p.brand,
        condition: p.condition,
        store: p.store,
        url: p.url,
        affiliateUrl: p.affiliate_url,
        salePrice: Number(p.sale_price),
        regularPrice: Number(p.regular_price),
        internalCategory: p.internal_category,
        relevance: p.relevance_score,
      })),
      didYouMean:
        firstRow.correction && firstRow.correction.toLowerCase() !== query.toLowerCase()
          ? firstRow.correction
          : null,
      meta: {
        brands: firstRow.meta_brands || [],
        conditions: firstRow.meta_conditions || [],
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
      },
    };

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("❌ Search API V25 Error:", error);
    return NextResponse.json(
      {
        error: "Search execution failed",
        ...(process.env.NODE_ENV !== "production"
          ? { message: error?.message || String(error), code: error?.code }
          : {}),
      },
      { status: 500 },
    );
  }
}