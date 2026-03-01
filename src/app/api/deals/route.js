// deals/route.js

import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  
  const page = Math.max(1, parseInt(searchParams.get("page")) || 1);
  const limit = Math.min(40, parseInt(searchParams.get("limit")) || 12);
  const offset = (page - 1) * limit;

  try {
    /**
     * 1. QUERY SQL V25 - CORRIGIDA E SINCRONIZADA COM PAGE.JS
     * O filtro de desconto foi movido para DEPOIS do agrupamento (DISTINCT ON),
     * garantindo que o número total de páginas (47) seja idêntico no SSR e no Client.
     */
    const rawResult = await prisma.$queryRaw`
      WITH SixMonthMax AS (
        -- Encontra o valor máximo histórico de cada oferta individual nos últimos 6 meses
        SELECT 
          listing_id, 
          MAX(price) as max_price_6m
        FROM price_history
        WHERE captured_at >= NOW() - INTERVAL '6 months'
        GROUP BY listing_id
      ),
      BestOffer AS (
        -- Passo 1: Pega APENAS a melhor oferta de cada modelo, sem checar desconto ainda
        SELECT DISTINCT ON (p.normalized_model_key)
          p.id as product_id,
          l.id as listing_id,
          l.sku, 
          p.name, 
          l.image as image, 
          p.slug, 
          p.brand, 
          l.condition, 
          l.store,
          l.sale_price as "sale_price_raw", 
          COALESCE(h.max_price_6m, l.regular_price, l.sale_price) as "regular_price_raw",
          p.normalized_model_key
        FROM products p
        INNER JOIN listings l ON p.id = l.product_id
        LEFT JOIN SixMonthMax h ON l.id = h.listing_id
        WHERE l.is_expired = false 
        AND l.online_availability = true
        AND l.sale_price >= 49
        AND p.name NOT ILIKE '%capinha%'
        AND p.name NOT ILIKE '%case %'
        AND p.name NOT ILIKE '%cover%'
        AND p.name NOT ILIKE '%pelicula%'
        AND p.name NOT ILIKE '%cabo %'
        AND p.name NOT ILIKE '%cable%'
        AND p.name NOT ILIKE '%adapter%'
        AND p.name NOT ILIKE '%screen protector%'
        AND p.name NOT ILIKE '%fone de ouvido%'
        ORDER BY p.normalized_model_key, l.sale_price ASC
      ),
      DealsCalculation AS (
        -- Passo 2: Agora sim, das melhores ofertas, filtramos apenas as que são "Deals" reais
        SELECT 
          *,
          CASE 
            WHEN regular_price_raw > 0 THEN 
              ROUND(((regular_price_raw - sale_price_raw) / regular_price_raw) * 100)
            ELSE 0 
          END as "discount_percent_raw"
        FROM BestOffer
        WHERE regular_price_raw > sale_price_raw
          AND (regular_price_raw - sale_price_raw) >= 20
      ),
      FinalFiltered AS (
        -- Passo 3: Contagem precisa do total após todos os filtros
        SELECT 
          *,
          COUNT(*) OVER()::integer as total_count_int
        FROM DealsCalculation
      )
      SELECT * FROM FinalFiltered
      ORDER BY "discount_percent_raw" DESC, "sale_price_raw" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // 2. TRATAMENTO DE SERIALIZAÇÃO (V25)
    const totalCount = rawResult.length > 0 ? Number(rawResult[0].total_count_int) : 0;
    
    const formattedItems = rawResult.map(p => {
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
        normalizedModelKey: p.normalized_model_key
      };
      
      item.savings = Number((item.regularPrice - item.salePrice).toFixed(2));
      return item;
    });

    const finalResult = {
      items: formattedItems,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page
    };

    return NextResponse.json(finalResult, { 
      headers: { 
        'X-Cache': 'BYPASS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60'
      } 
    });

  } catch (error) {
    console.error("❌ Deals API Error:", error);
    
    if (error.message.includes('column') || error.message.includes('relation')) {
      return NextResponse.json(
        { 
          error: "Database Schema Mismatch", 
          message: "A estrutura de dados mudou. Verifique se as tabelas Listings e PriceHistory estão atualizadas.",
          details: error.message 
        }, 
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal Server Error", message: error.message }, 
      { status: 500 }
    );
  }
}