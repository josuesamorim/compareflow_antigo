import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('t');

  if (token !== process.env.FEED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    /**
     * 1. BUSCA ADAPTADA PARA SCHEMA V25
     * Buscamos os produtos incluindo suas Listings (ofertas), 
     * pois é onde residem os dados de SKU, Imagem e Loja.
     */
    const allProducts = await prisma.product.findMany({
      include: {
        listings: {
          where: { isExpired: false }
        }
      }
    });

    const report = {
      total_produtos_analisados: allProducts.length,
      total_ofertas_analisadas: 0,
      gtin_invalido: [], // UPCs no mestre que não têm 12 ou 13 dígitos
      ofertas_sem_identificador: [], // Ofertas sem SKU (Crítico para Google Shopping)
      ofertas_sem_imagem: [], // Ofertas que não possuem URL de imagem
      resumo_por_loja: {}
    };

    allProducts.forEach(product => {
      // 1. Validar GTIN (UPC) no Produto Mestre
      // O Google exige 12 (UPC) ou 13 (EAN) dígitos numéricos
      const isGtinValid = product.upc && /^\d{12,13}$/.test(product.upc);
      
      if (!isGtinValid && product.upc) {
        report.gtin_invalido.push({ 
          product_id: product.id, 
          name: product.name, 
          upc_atual: product.upc 
        });
      }

      // 2. Analisar as Ofertas (Listings) vinculadas
      product.listings.forEach(listing => {
        report.total_ofertas_analisadas++;

        // Validar Identificador da Oferta (SKU)
        if (!listing.sku) {
          report.ofertas_sem_identificador.push({ 
            product_id: product.id, 
            listing_id: listing.id,
            name: product.name,
            store: listing.store 
          });
        }

        // Validar Imagem da Oferta
        if (!listing.image || listing.image.trim() === "" || listing.image.includes("placeholder")) {
          report.ofertas_sem_image.push({
            product_id: product.id,
            store: listing.store,
            name: product.name
          });
        }

        // Contagem por loja (V25: store vem da listing)
        const storeName = listing.store || "Unknown";
        report.resumo_por_loja[storeName] = (report.resumo_por_loja[storeName] || 0) + 1;
      });
    });

    /**
     * RETORNO DE AUDITORIA COMPLETO
     */
    return NextResponse.json({
      status: "Análise de Integridade V25 Concluída",
      estatisticas: {
        total_produtos: report.total_produtos_analisados,
        total_ofertas_ativas: report.total_ofertas_analisadas,
        media_ofertas_por_produto: (report.total_ofertas_analisadas / (report.total_produtos_analisados || 1)).toFixed(2)
      },
      erros_criticos_google_merchant: {
        upc_formato_errado: report.gtin_invalido.length,
        ofertas_sem_sku_ou_mpn: report.ofertas_sem_identificador.length,
        ofertas_sem_imagem_valida: report.ofertas_sem_image.length
      },
      amostragem_correcao: {
        detalhes_gtin_invalido: report.gtin_invalido.slice(0, 20),
        detalhes_ofertas_sem_id: report.ofertas_sem_identificador.slice(0, 20)
      },
      distribuicao_mercado: report.resumo_por_loja
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (error) {
    console.error("❌ Integrity Report Error:", error);
    return NextResponse.json({ 
      error: "Erro ao processar auditoria", 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}