// deals/route.js

import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

/**
 * Deals API (V27.1 - Today Drops + Condition Priority + Anti-Manipulation + Pagination-safe + Anti-Overpriced + Confidence-safe)
 * - Paginação consistente (COUNT() OVER()).
 * - Seleção por normalized_model_key (DISTINCT ON) com PRIORIDADE DE CONDIÇÃO:
 *   NEW > OPEN-BOX > REFURBISHED > USED > OTHER (evita feed virar só refurbished).
 * - Referência robusta: mediana 30d (percentile_cont 0.5) por listing_id, com fallback seguro.
 * - Anti-manipulation: penaliza spikes (âncoras) sem matar flash sales legítimas.
 * - Dedup do histórico por (listing_id, day, price) para evitar inflar amostras.
 * - ✅ Anti-Overpriced: bloqueia aparecer em Today's Deals quando preço atual > +10% do baseline
 *   SOMENTE quando há confiança (samples_30d >= 6) E baseline_30d existe.
 * - ✅ "Today": só entra se houve queda REAL recente (últimas 24h) no listing_id.
 * - ✅ Confidence UX: expõe baseline_source + price_data_confidence para o client NÃO acusar "overpriced" com pouco histórico.
 *
 * IMPORTANT FIXES:
 * - Remove duplicação acidental do arquivo (você colou 2x antes).
 * - Evita filtros super restritivos matarem tudo: dropped_recently continua obrigatório,
 *   mas agora você recebe telemetria (confidence) para mostrar "not enough data" no produto.
 */

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  const limit = Math.min(40, parseInt(searchParams.get("limit"), 10) || 12);
  const offset = (page - 1) * limit;

  // Thresholds (ajustáveis)
  const MIN_SALE_PRICE = 49;
  const MIN_SAVINGS = 20;

  // Baseline/Confidence
  const BASELINE_WINDOW_DAYS = 30; // baseline robusto (mediana 30d)
  const BASELINE_MIN_SAMPLES = 5; // baseline "válido" para referência
  const OVERPRICED_CONF_SAMPLES = 6; // "confiança" (bloqueio anti-overpriced)
  const OVERPRICED_PCT = 0.10; // +10% acima do baseline => overpriced

  // ✅ Today drop detection (considera descontos do dia)
  const DROP_WINDOW_HOURS = 24; // últimas 24h
  const DROP_MIN_ABS = 5; // pelo menos $5 de queda (evita ruído)
  const DROP_MIN_PCT = 0.02; // ou 2% (evita ruído em produtos caros)
  const RECENT_DEDUPE_HOURS = 96; // janela de leitura do histórico recente sem explodir

  // Anti-manipulation tuning
  const SPIKE_RATIO = 3.0; // âncora absurda
  const SPIKE_RATIO_SOFT = 2.0; // spikes moderados
  const SPIKE_DAYS_MAX_FOR_HARD_FLAG = 3; // âncora rara (<=3 dias) + ratio alto => suspeito forte
  const TRUST_HARD = 0.1;
  const TRUST_SOFT = 0.6;
  const TRUST_OK = 1.0;

  try {
    const rawResult = await prisma.$queryRaw`
      WITH Hist30 AS (
        SELECT DISTINCT
          ph.listing_id,
          date_trunc('day', ph.captured_at) AS day,
          ph.price::numeric AS price
        FROM price_history ph
        WHERE ph.captured_at >= NOW() - INTERVAL '${BASELINE_WINDOW_DAYS} days'
      ),
      Baseline30 AS (
        SELECT
          listing_id,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS baseline_30d,
          COUNT(*)::integer AS samples_30d
        FROM Hist30
        GROUP BY listing_id
      ),
      SpikeDays AS (
        SELECT
          h.listing_id,
          COUNT(DISTINCT h.day)::integer AS spike_days_30d,
          MAX(h.price)::numeric AS max_price_30d
        FROM Hist30 h
        JOIN Baseline30 b ON b.listing_id = h.listing_id
        WHERE b.baseline_30d IS NOT NULL
          AND b.baseline_30d > 0
          AND h.price >= (b.baseline_30d * ${SPIKE_RATIO_SOFT}::numeric)
        GROUP BY h.listing_id
      ),

      -- ✅ Histórico recente deduplicado (por hora+preço) para detectar "queda do dia"
      HistRecent AS (
        SELECT DISTINCT ON (ph.listing_id, date_trunc('hour', ph.captured_at), ph.price)
          ph.listing_id,
          ph.captured_at,
          ph.price::numeric AS price
        FROM price_history ph
        WHERE ph.captured_at >= NOW() - INTERVAL '${RECENT_DEDUPE_HOURS} hours'
        ORDER BY ph.listing_id, date_trunc('hour', ph.captured_at), ph.price, ph.captured_at DESC
      ),
      RankedRecent AS (
        SELECT
          listing_id,
          captured_at,
          price,
          ROW_NUMBER() OVER (PARTITION BY listing_id ORDER BY captured_at DESC) AS rn
        FROM HistRecent
      ),
      LastTwo AS (
        SELECT
          r1.listing_id,
          r1.price AS last_price,
          r1.captured_at AS last_captured_at,
          r2.price AS prev_price,
          r2.captured_at AS prev_captured_at
        FROM RankedRecent r1
        LEFT JOIN RankedRecent r2
          ON r2.listing_id = r1.listing_id
         AND r2.rn = 2
        WHERE r1.rn = 1
      ),
      TodayDrop AS (
        SELECT
          listing_id,
          last_price,
          prev_price,
          last_captured_at,
          prev_captured_at,
          CASE
            WHEN prev_price IS NULL OR prev_price <= 0 THEN false
            WHEN last_captured_at < NOW() - INTERVAL '${DROP_WINDOW_HOURS} hours' THEN false
            WHEN last_price >= prev_price THEN false
            WHEN (prev_price - last_price) < ${DROP_MIN_ABS}::numeric
              AND ((prev_price - last_price) / prev_price) < ${DROP_MIN_PCT}::numeric
            THEN false
            ELSE true
          END AS dropped_recently,
          (prev_price - last_price) AS drop_amount,
          CASE
            WHEN prev_price IS NOT NULL AND prev_price > 0 THEN ((prev_price - last_price) / prev_price)
            ELSE NULL
          END AS drop_pct
        FROM LastTwo
      ),

      BestOffer AS (
        SELECT DISTINCT ON (p.normalized_model_key)
          p.id AS product_id,
          l.id AS listing_id,
          l.sku,
          p.name,
          l.image AS image,
          p.slug,
          p.brand,
          l.condition,
          l.store,
          l.sale_price::numeric AS sale_price_raw,
          l.regular_price::numeric AS listing_regular_price_raw,
          p.normalized_model_key,
          b.baseline_30d,
          b.samples_30d,
          COALESCE(s.spike_days_30d, 0)::integer AS spike_days_30d,
          COALESCE(s.max_price_30d, 0)::numeric AS max_price_30d,
          COALESCE(td.dropped_recently, false) AS dropped_recently,
          td.drop_amount::numeric AS drop_amount,
          td.drop_pct::numeric AS drop_pct,
          td.last_captured_at AS last_price_at
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        LEFT JOIN Baseline30 b ON b.listing_id = l.id
        LEFT JOIN SpikeDays s ON s.listing_id = l.id
        LEFT JOIN TodayDrop td ON td.listing_id = l.id
        WHERE l.is_expired = false
          AND l.online_availability = true
          AND l.sale_price >= ${MIN_SALE_PRICE}::numeric
          -- blacklist de acessórios (mantido)
          AND p.name NOT ILIKE '%capinha%'
          AND p.name NOT ILIKE '%case %'
          AND p.name NOT ILIKE '%cover%'
          AND p.name NOT ILIKE '%pelicula%'
          AND p.name NOT ILIKE '%cabo %'
          AND p.name NOT ILIKE '%cable%'
          AND p.name NOT ILIKE '%adapter%'
          AND p.name NOT ILIKE '%screen protector%'
          AND p.name NOT ILIKE '%fone de ouvido%'
        -- ✅ PRIORIDADE DE CONDIÇÃO + melhor preço dentro da condição
        ORDER BY
          p.normalized_model_key,
          CASE
            WHEN l.condition ILIKE '%new%' THEN 0
            WHEN l.condition ILIKE '%open%' AND l.condition ILIKE '%box%' THEN 1
            WHEN l.condition ILIKE '%refurb%' OR l.condition ILIKE '%renewed%' OR l.condition ILIKE '%reconditioned%' OR l.condition ILIKE '%certified%' THEN 2
            WHEN l.condition ILIKE '%used%' OR l.condition ILIKE '%pre-owned%' OR l.condition ILIKE '%preowned%' THEN 3
            ELSE 4
          END ASC,
          l.sale_price ASC
      ),

      DealsCalc AS (
        SELECT
          *,

          -- ✅ Baseline source + confidence (para o client não acusar "overpriced" com histórico raso)
          CASE
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${BASELINE_MIN_SAMPLES}::integer
              THEN 'baseline_30d'
            WHEN listing_regular_price_raw IS NOT NULL AND listing_regular_price_raw > 0
              THEN 'listing_regular_price'
            ELSE 'sale_price_fallback'
          END AS baseline_source,

          CASE
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${OVERPRICED_CONF_SAMPLES}::integer
              THEN 'high'
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= 3
              THEN 'medium'
            ELSE 'low'
          END AS price_data_confidence,

          -- referência robusta: baseline 30d se houver amostra suficiente; fallback: listing regular; fallback: sale
          CASE
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${BASELINE_MIN_SAMPLES}::integer
              THEN baseline_30d
            WHEN listing_regular_price_raw IS NOT NULL AND listing_regular_price_raw > 0
              THEN listing_regular_price_raw
            ELSE sale_price_raw
          END AS regular_price_raw,

          -- economia absoluta vs referência
          (
            (
              CASE
                WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${BASELINE_MIN_SAMPLES}::integer
                  THEN baseline_30d
                WHEN listing_regular_price_raw IS NOT NULL AND listing_regular_price_raw > 0
                  THEN listing_regular_price_raw
                ELSE sale_price_raw
              END
            ) - sale_price_raw
          ) AS savings_raw,

          -- desconto vs referência
          CASE
            WHEN (
              CASE
                WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${BASELINE_MIN_SAMPLES}::integer
                  THEN baseline_30d
                WHEN listing_regular_price_raw IS NOT NULL AND listing_regular_price_raw > 0
                  THEN listing_regular_price_raw
                ELSE sale_price_raw
              END
            ) > 0
            THEN ROUND(
              (
                (
                  (
                    CASE
                      WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${BASELINE_MIN_SAMPLES}::integer
                        THEN baseline_30d
                      WHEN listing_regular_price_raw IS NOT NULL AND listing_regular_price_raw > 0
                        THEN listing_regular_price_raw
                      ELSE sale_price_raw
                    END
                  ) - sale_price_raw
                )
                /
                (
                  CASE
                    WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 AND samples_30d >= ${BASELINE_MIN_SAMPLES}::integer
                      THEN baseline_30d
                    WHEN listing_regular_price_raw IS NOT NULL AND listing_regular_price_raw > 0
                      THEN listing_regular_price_raw
                    ELSE sale_price_raw
                  END
                )
              ) * 100
            )
            ELSE 0
          END AS discount_percent_raw,

          -- ratio do máximo vs baseline (para flag)
          CASE
            WHEN baseline_30d IS NOT NULL AND baseline_30d > 0 THEN (max_price_30d / baseline_30d)
            ELSE NULL
          END AS max_to_baseline_ratio,

          -- ✅ Anti-Overpriced: SOMENTE quando baseline_30d existe e há confiança (NUNCA com fallback)
          CASE
            WHEN baseline_30d IS NOT NULL
              AND baseline_30d > 0
              AND samples_30d >= ${OVERPRICED_CONF_SAMPLES}::integer
              AND sale_price_raw > (baseline_30d * ${(1 + OVERPRICED_PCT).toFixed(2)}::numeric)
            THEN true
            ELSE false
          END AS is_overpriced_confident
        FROM BestOffer
      ),

      TrustCalc AS (
        SELECT
          *,
          CASE
            WHEN max_to_baseline_ratio IS NOT NULL
              AND max_to_baseline_ratio >= ${SPIKE_RATIO}::numeric
              AND spike_days_30d <= ${SPIKE_DAYS_MAX_FOR_HARD_FLAG}::integer
            THEN ${TRUST_HARD}::numeric

            WHEN max_to_baseline_ratio IS NOT NULL
              AND max_to_baseline_ratio >= ${SPIKE_RATIO_SOFT}::numeric
              AND spike_days_30d >= 4
            THEN ${TRUST_SOFT}::numeric

            ELSE ${TRUST_OK}::numeric
          END AS trust_multiplier,

          (discount_percent_raw * (
            CASE
              WHEN max_to_baseline_ratio IS NOT NULL
                AND max_to_baseline_ratio >= ${SPIKE_RATIO}::numeric
                AND spike_days_30d <= ${SPIKE_DAYS_MAX_FOR_HARD_FLAG}::integer
              THEN ${TRUST_HARD}::numeric
              WHEN max_to_baseline_ratio IS NOT NULL
                AND max_to_baseline_ratio >= ${SPIKE_RATIO_SOFT}::numeric
                AND spike_days_30d >= 4
              THEN ${TRUST_SOFT}::numeric
              ELSE ${TRUST_OK}::numeric
            END
          )) AS deal_score
        FROM DealsCalc
      ),

      FinalFiltered AS (
        SELECT
          *,
          COUNT(*) OVER()::integer AS total_count_int
        FROM TrustCalc
        WHERE regular_price_raw > sale_price_raw
          AND savings_raw >= ${MIN_SAVINGS}::numeric
          AND sale_price_raw >= ${MIN_SALE_PRICE}::numeric
          AND is_overpriced_confident = false
          -- ✅ "do dia": só entra se houve queda real recente
          AND dropped_recently = true
      )

      SELECT * FROM FinalFiltered
      ORDER BY deal_score DESC, discount_percent_raw DESC, sale_price_raw ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const totalCount = rawResult.length > 0 ? Number(rawResult[0].total_count_int) : 0;

    const formattedItems = rawResult.map((p) => {
      const item = {
        id: p.product_id.toString(),
        listingId: p.listing_id.toString(),
        sku: p.sku,
        name: p.name,
        image: p.image,
        slug: p.slug,
        brand: p.brand,
        condition: p.condition,
        store: p.store,
        salePrice: Number(p.sale_price_raw || 0),
        regularPrice: Number(p.regular_price_raw || 0),
        discountPercent: Number(p.discount_percent_raw || 0),
        normalizedModelKey: p.normalized_model_key,

        // Campos extras úteis (não quebram o front; se não usar, ignora)
        trustMultiplier: Number(p.trust_multiplier || 1),
        spikeDays30d: Number(p.spike_days_30d || 0),
        maxToBaselineRatio:
          p.max_to_baseline_ratio !== null && p.max_to_baseline_ratio !== undefined
            ? Number(p.max_to_baseline_ratio)
            : null,
        baseline30d:
          p.baseline_30d !== null && p.baseline_30d !== undefined ? Number(p.baseline_30d) : null,
        samples30d: Number(p.samples_30d || 0),
        dealScore: p.deal_score !== null && p.deal_score !== undefined ? Number(p.deal_score) : null,

        // ✅ Transparência (para UI não acusar enganação com pouco histórico)
        baselineSource: p.baseline_source,
        priceDataConfidence: p.price_data_confidence,

        // Anti-overpriced (debug/telemetria)
        isOverpricedConfident: Boolean(p.is_overpriced_confident),

        // ✅ Today drop telemetry (debug/UX opcional)
        droppedRecently: Boolean(p.dropped_recently),
        dropAmount: p.drop_amount !== null && p.drop_amount !== undefined ? Number(p.drop_amount) : null,
        dropPct: p.drop_pct !== null && p.drop_pct !== undefined ? Number(p.drop_pct) : null,
        lastPriceAt: p.last_price_at ? new Date(p.last_price_at).toISOString() : null,
      };

      item.savings = Number((item.regularPrice - item.salePrice).toFixed(2));
      return item;
    });

    const finalResult = {
      items: formattedItems,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
    };

    return NextResponse.json(finalResult, {
      headers: {
        "X-Cache": "BYPASS",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("❌ Deals API Error:", error);

    const msg = error?.message ? String(error.message) : "Unknown error";

    if (msg.includes("column") || msg.includes("relation")) {
      return NextResponse.json(
        {
          error: "Database Schema Mismatch",
          message:
            "A estrutura de dados mudou. Verifique se as tabelas Listings e PriceHistory estão atualizadas.",
          details: msg,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Internal Server Error", message: msg }, { status: 500 });
  }
}