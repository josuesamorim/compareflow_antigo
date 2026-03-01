import { getProducts } from "../../../../lib/search-service";
import { NextResponse } from "next/server";

/**
 * ROTA DE API: GET /api/category/[slug]
 * Responsável por retornar produtos de uma categoria específica com suporte a:
 * 1. Paginação e Limite.
 * 2. Ordenação dinâmica (relevance, price-asc, price-desc).
 * 3. Filtros por marca e condição.
 * * V25: Adaptado para refletir a disponibilidade via Listings.
 */
export async function GET(request, { params }) {
  try {
    // No Next.js 15+, params deve ser aguardado (Awaited)
    const { slug } = await params;
    
    const { searchParams } = new URL(request.url);
    
    // Captura os parâmetros da URL para passar ao motor de busca
    const page = parseInt(searchParams.get("page")) || 1;
    const limit = parseInt(searchParams.get("limit")) || 24;
    const sortBy = searchParams.get("sortBy") || "relevance";
    const brand = searchParams.get("brand") || "all";
    const condition = searchParams.get("condition") || "all";

    /**
     * OBSERVAÇÃO: Lógica de cacheKey e Redis removida para garantir
     * consistência total com o banco de dados pós-sincronização.
     */

    // 1. Chama o motor compartilhado (getProducts)
    /**
     * IMPORTANTE (V25): O getProducts agora realiza um JOIN entre Products e Listings.
     * Ele filtra apenas produtos que possuem ao menos uma oferta com online_availability = true.
     */
    const result = await getProducts({ 
      category: slug, 
      page, 
      limit, 
      sortBy,
      brand,
      condition,
      // Forçamos o motor a buscar apenas itens com estoque ativo
      onlyAvailable: true 
    });

    /**
     * 2. RETORNO FINAL
     * Ajustado s-maxage para 60 segundos para garantir que
     * alterações de estoque (out-of-stock) das lojas (BestBuy/eBay) 
     * reflitam rapidamente na visualização da categoria.
     */
    return NextResponse.json(result, {
      headers: { 
        'X-Cache': 'BYPASS',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30'
      }
    });

  } catch (error) {
    console.error("❌ Category API Error:", error);
    
    // Fallback amigável em caso de erro no motor de busca
    return NextResponse.json(
      { 
        error: "Failed to fetch category products", 
        details: error.message,
        category: slug 
      }, 
      { status: 500 }
    );
  }
}