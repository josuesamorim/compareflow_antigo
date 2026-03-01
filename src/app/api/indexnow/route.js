import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

export async function POST(request) {
  // 1. Verificação de Segurança (Prevenir abusos)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.INDEXNOW_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Captura o parâmetro 'offset' da URL (ex: ?offset=10000) para paginação
  const { searchParams } = new URL(request.url);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  try {
    /**
     * OTIMIZAÇÃO DE BANCO DE DADOS (DB PERFORMANCE)
     * 1. Usamos findMany com select estrito.
     * 2. 'take: 10000' para respeitar o limite do IndexNow.
     * 3. 'skip: offset' permite paginação.
     * ADICIONADO: onlineAvailability: true para indexar apenas itens em estoque.
     */
    const products = await prisma.product.findMany({
      where: { 
        isExpired: false,
        onlineAvailability: true,
        slug: { not: null }
      },
      select: { 
        slug: true 
      },
      orderBy: { 
        lastUpdated: 'desc' 
      },
      take: 10000,
      skip: offset
    });

    /**
     * BUSCA DE CATEGORIAS ÚNICAS
     * Buscamos apenas se for o primeiro lote (offset 0) para não repetir categorias nos lotes seguintes.
     */
    let categoryUrls = [];
    if (offset === 0) {
      const categories = await prisma.product.findMany({
        where: {
          isExpired: false,
          onlineAvailability: true, // Garante que a categoria indexada tenha itens ativos
          internalCategory: { not: null, not: "" }
        },
        distinct: ['internalCategory'],
        select: {
          internalCategory: true
        }
      });

      categoryUrls = categories.map(cat => {
        const slug = cat.internalCategory
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^\w-]+/g, '');
        return `https://pricelab.tech/category/${slug}`;
      });

      // Adiciona a página de Black Friday na lista de prioridade
      categoryUrls.push("https://pricelab.tech/black-friday");
    }

    // Se não houver produtos nem categorias, encerramos
    if (products.length === 0 && categoryUrls.length === 0) {
      return NextResponse.json({ message: "Nenhum conteúdo novo para indexar." });
    }

    /**
     * OTIMIZAÇÃO DE MEMÓRIA (MAP)
     * Criamos a lista de URLs combinando Categorias + Produtos.
     */
    const productUrls = products.map(p => `https://pricelab.tech/product/${p.slug}`);
    
    // Unimos as listas. O slice(0, 10000) garante que nunca passaremos do limite do IndexNow.
    const urlList = [...categoryUrls, ...productUrls].slice(0, 10000);

    // 3. Estrutura o Payload para o Bing/IndexNow
    const payload = {
      host: "pricelab.tech",
      key: process.env.INDEXNOW_KEY,
      keyLocation: `https://pricelab.tech/${process.env.INDEXNOW_KEY}.txt`,
      urlList: urlList
    };

    /**
     * OTIMIZAÇÃO DE TIMEOUT
     * Fetch com timeout curto para evitar que o worker do Next.js fique preso.
     */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15 segundos

    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (response.ok) {
      return NextResponse.json({ 
        message: `Sucesso! ${urlList.length} URLs enviadas (Categorias: ${categoryUrls.length}, Produtos: ${products.length}, Offset: ${offset}).`,
        status: 200 
      });
    } else {
      const errorData = await response.text();
      return NextResponse.json({ error: errorData }, { status: response.status });
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: "Timeout na resposta do Bing" }, { status: 504 });
    }
    console.error("Erro IndexNow:", error);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}