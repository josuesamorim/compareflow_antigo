import { prisma } from "../lib/prisma";

/**
 * CONFIGURAÇÃO DE CACHE DE 1 HORA
 * O Sitemap agora será revalidado a cada 3600 segundos (1 hora).
 * Isso garante performance e mantém os links atualizados para o Google Bot.
 */
export const revalidate = 3600;

export default async function sitemap() {
  const baseUrl = "https://pricelab.tech";
  
  /**
   * OBSERVAÇÃO: Lógica de Redis (cacheKey) removida para evitar timeouts na Vercel.
   * O sitemap agora gera as entradas consultando diretamente o banco de dados.
   */

  try {
    // 1. BUSCAR PRODUTOS E CATEGORIAS NO BANCO (PRISMA)
    
    /**
     * BUSCA PRODUTOS ATIVOS (V25)
     * Filtros aplicados para compliance com Google Merchant Center:
     * - listings.some: Garante que o produto tenha ao menos uma oferta válida.
     * - isExpired: false (Somente ofertas válidas na listing)
     * - onlineAvailability: true (Somente itens em estoque na listing)
     * - image: Not null (Garante que o produto ou a listing tenha imagem)
     */
    const products = await prisma.product.findMany({
      where: {
        slug: { not: null },
        listings: {
          some: {
            isExpired: false,
            onlineAvailability: true,
            // Verificamos se há imagem na oferta ativa
            image: { not: null, not: "" }
          }
        }
      },
      select: {
        slug: true,
        lastUpdated: true, 
      },
    });

    /**
     * BUSCA CATEGORIAS ÚNICAS (V25)
     * Aplicamos os mesmos filtros de integridade para que a página de categoria 
     * não leve a uma lista vazia de itens expirados.
     */
    const categories = await prisma.product.findMany({
      where: {
        internalCategory: { not: null, not: "" },
        listings: {
          some: {
            isExpired: false,
            onlineAvailability: true
          }
        }
      },
      distinct: ['internalCategory'],
      select: {
        internalCategory: true,
        lastUpdated: true,
      },
    });

    // Se o banco retornar vazio, registramos o aviso no log da Vercel
    if (!products || products.length === 0) {
      console.warn("Aviso: Nenhum produto encontrado no Prisma para o Sitemap.");
    }

    // Mapeamento dos Produtos
    const productEntries = products.map((product) => ({
      url: `${baseUrl}/product/${product.slug}`,
      lastModified: product.lastUpdated ? new Date(product.lastUpdated).toISOString() : new Date().toISOString(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    // Mapeamento das Categorias (Transformando o nome da categoria em slug de URL)
    const categoryEntries = categories.map((cat) => {
      // Normaliza o nome da categoria para a URL
      const categorySlug = cat.internalCategory
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '');

      return {
        url: `${baseUrl}/category/${categorySlug}`,
        lastModified: cat.lastUpdated ? new Date(cat.lastUpdated).toISOString() : new Date().toISOString(),
        changeFrequency: 'weekly',
        priority: 0.7,
      };
    });

    /**
     * 2. PÁGINAS INSTITUCIONAIS (CRÍTICO PARA GOOGLE MERCHANT COMPLIANCE)
     * Estas páginas ajudam a evitar a suspensão por "Misrepresentation" (Deturpação).
     */
    const staticPages = [
      { url: `${baseUrl}/how-it-works`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${baseUrl}/privacy`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${baseUrl}/shipping-policy`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${baseUrl}/return-policy`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${baseUrl}/about`, priority: 0.6, changeFrequency: 'monthly' },
      { url: `${baseUrl}/contact`, priority: 0.7, changeFrequency: 'monthly' },
      { url: `${baseUrl}/terms`, priority: 0.5, changeFrequency: 'monthly' },
    ].map(page => ({
      ...page,
      lastModified: new Date().toISOString(),
    }));

    // 3. CONSTRUÇÃO DO SITEMAP COMPLETO
    const fullSitemap = [
      {
        url: baseUrl,
        lastModified: new Date().toISOString(),
        changeFrequency: 'hourly',
        priority: 1.0,
      },
      // ADICIONADO: Rota específica para Black Friday
      {
        url: `${baseUrl}/black-friday`,
        lastModified: new Date().toISOString(),
        changeFrequency: 'daily',
        priority: 0.9,
      },
      ...staticPages,
      ...categoryEntries,
      ...productEntries,
    ];

    /**
     * OBSERVAÇÃO: A persistência no Redis (redisClient.set) foi removida.
     * Isso evita o erro de "fetch failed" durante a geração do sitemap em produção.
     */

    return fullSitemap;

  } catch (error) {
    // Esse log aparecerá no painel de monitoramento da Vercel
    console.error("CRITICAL SITEMAP ERROR:", error);
    
    // Fallback de segurança: retorna pelo menos a Home para não quebrar o sitemap.xml
    return [
      { 
        url: baseUrl, 
        lastModified: new Date().toISOString(),
        changeFrequency: 'hourly',
        priority: 1.0 
      }
    ];
  }
}