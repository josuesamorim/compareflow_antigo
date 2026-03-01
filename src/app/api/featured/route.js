import HomeClient from '../../../components/HomeClient.js'; 
import { prisma } from '../../../lib/prisma.js'; 

/**
 * CONFIGURAÇÃO DO AMBIENTE
 * Revalidação configurada para 3600 segundos (1 hora).
 * O Next.js usará o ISR (Incremental Static Regeneration) para manter o cache.
 */
export const revalidate = 3600;

export default async function Page() {
  
  /**
   * FUNÇÃO AUXILIAR: getInitialDeals
   * Adaptada para o Schema V25: Products JOIN Listings.
   */
  async function getInitialDeals(category, limit = 4) {
    try {
      const blockedBrandsArray = [
        'AMPD', 'Anker', 'Backbone', 'Baseus', 'Beats', 'Belkin', 'Bellroy', 
        'Best Buy essentials™', 'Bracketron', 'Canon', 'Case-Mate', 'CASETiFY', 
        'Chargeworx', 'Cobra', 'dbrand', 'DJI', 'EcoFlow', 'Energizer', 'Escort', 
        'FLAUNT', 'Fremo', 'Fujifilm', 'HOCO', 'HP', 'INIU', 'Insignia™', 'iOttie', 
        'Jackery', 'JOBY', 'JOURNEY', 'kate spade new york', 'KeySmart', 'Kodak', 
        'LAUT', 'Liene', 'Lively®', 'Mint Mobile', 'mophie', 'myCharge', 'Native Union', 
        'NETGEAR', 'Nimble', 'Octobuddy', 'OhSnap', 'OtterBox', 'Peak Design', 
        'Pelican', 'PopSockets', 'REL', 'Rexing', 'SaharaCase', 'Scosche', 'Shure', 
        'SIMO', 'Simple Mobile', 'Speck', 'Spigen', 'SureCall', 'Tech21', 
        'The Ridge Wallet', 'TORRAS', 'Total Wireless', 'Tracfone', 'Twelve South', 
        'UAG', 'UGREEN', 'Ultra Mobile', 'UltraLast', 'Unplugged', 'VELVET CAVIAR', 
        'Verizon', 'Visible', 'weBoost', 'WORX', 'XREAL', 'ZAGG'
      ];

      /**
       * QUERY SQL V25:
       * 1. Calcula a média histórica por LISTING (oferta).
       * 2. Faz JOIN com a tabela PRODUCTS para filtrar por categoria e marca.
       * 3. Prioriza a melhor oferta de cada marca para diversificar a Home.
       */
      const rawResult = await prisma.$queryRaw`
        WITH AvgPriceHistory AS (
          -- No V25, a média é por listing_id
          SELECT listing_id, AVG(price) as historic_avg
          FROM price_history
          GROUP BY listing_id
        ),
        CleanProducts AS (
          SELECT 
            p.id as product_id, 
            l.id as listing_id,
            l.sku, 
            p.name, 
            COALESCE(l.image, p.image) as image, 
            p.slug, 
            p.brand, 
            l.sale_price, 
            l.regular_price, 
            p.internal_category,
            COALESCE(ph.historic_avg, l.sale_price) as avg_price,
            (l.sale_price / COALESCE(ph.historic_avg, l.sale_price)) as price_ratio
          FROM products p
          INNER JOIN listings l ON p.id = l.product_id
          LEFT JOIN AvgPriceHistory ph ON l.id = ph.listing_id
          WHERE p.internal_category = ${category}::TEXT
            AND l.is_expired = false 
            AND l.online_availability = true
            AND l.sale_price > 15
            AND (l.image IS NOT NULL OR p.image IS NOT NULL)
            AND p.brand IS NOT NULL AND p.brand != ''
            
            -- Filtro de Marcas Bloqueadas (Acessórios/Baixo Valor)
            AND NOT (p.brand::TEXT = ANY(${blockedBrandsArray}::TEXT[]))

            -- LÓGICA DE DEAL: Somente se estiver no preço médio ou abaixo
            AND (l.sale_price <= COALESCE(ph.historic_avg, l.sale_price))

            -- Filtro Semântico para evitar acessórios irrelevantes na Home
            AND p.name NOT ILIKE '%case %'
            AND p.name NOT ILIKE '%case%'
            AND p.name NOT ILIKE '%AppleCare%'
            AND p.name NOT ILIKE '%cover%'
            AND p.name NOT ILIKE '%PLAN%'
            AND p.name NOT ILIKE '%screen protector%'
            AND p.name NOT ILIKE '%pelicula%'
            AND p.name NOT ILIKE '%cable%'
            AND p.name NOT ILIKE '%adapter%'
            AND p.name NOT ILIKE '%strap%'
            AND p.name NOT ILIKE '%mount%'

            -- Filtro de Preço Mínimo por Categoria para garantir qualidade no "Featured"
            AND (
              (p.internal_category = 'smartphones' AND l.sale_price >= 149) OR
              (p.internal_category = 'tvs' AND l.sale_price >= 199) OR
              (p.internal_category NOT IN ('smartphones', 'tvs'))
            )
        ),
        PriceBounds AS (
          -- Filtra outliers (preços absurdamente baixos ou altos que indicam erro de scraping)
          SELECT 
            *,
            percent_rank() OVER (PARTITION BY internal_category ORDER BY sale_price) as price_percentile
          FROM CleanProducts
        ),
        RelevantProducts AS (
          SELECT * FROM PriceBounds
          WHERE price_percentile BETWEEN 0.05 AND 0.95
        ),
        DistinctBrands AS (
          -- Garante que não apareçam 4 aparelhos da mesma marca seguidos na Home
          SELECT DISTINCT ON (brand) 
            product_id, listing_id, sku, name, image, slug, brand, sale_price, regular_price, internal_category, avg_price, price_ratio
          FROM RelevantProducts
          ORDER BY brand, price_ratio ASC
        )
        SELECT *
        FROM DistinctBrands
        ORDER BY price_ratio ASC
        LIMIT ${limit}
      `;

      /**
       * 2. FORMATAÇÃO DOS DADOS PARA O CLIENT COMPONENT
       */
      const formattedItems = rawResult.map(p => {
        const brandRaw = p.brand || "Deal";
        const firstWord = brandRaw.trim().split(/\s+/)[0];
        const cleanBrand = firstWord.replace(/[^a-zA-Z0-9]/g, '');

        const diff = ((Number(p.sale_price) - Number(p.avg_price)) / Number(p.avg_price)) * 100;

        return {
          id: p.product_id.toString(),
          listingId: p.listing_id.toString(),
          sku: p.sku,
          name: p.name,
          image: p.image,
          slug: p.slug,
          brand: cleanBrand || firstWord || "Deal",
          salePrice: Number(p.sale_price),
          regularPrice: Number(p.regular_price || p.sale_price),
          avgPrice: Number(p.avg_price),
          priceStatus: diff <= -5 ? 'Great Deal' : diff < 0 ? 'Good Price' : 'Fair Price',
          internalCategory: p.internal_category 
            ? p.internal_category.replace(/-/g, ' ') 
            : "Electronics",
          discountLabel: p.regular_price > p.sale_price 
            ? `${Math.round(((Number(p.regular_price) - Number(p.sale_price)) / Number(p.regular_price)) * 100)}% OFF` 
            : null
        };
      });

      return { items: formattedItems };
    } catch (e) {
      console.error(`❌ Erro SQL na Home para ${category}:`, e.message);
      return { items: [] };
    }
  }

  /**
   * BUSCA PARALELA DE DADOS
   * Otimiza o tempo de resposta do servidor
   */
  const [smartphonesData, tvsData, gamingData] = await Promise.all([
    getInitialDeals('smartphones'),
    getInitialDeals('tvs'),
    getInitialDeals('gaming-consoles')
  ]);

  /**
   * ESTRUTURAÇÃO DOS DADOS INICIAIS
   */
  const initialData = {
    smartphones: smartphonesData?.items || [],
    tvs: tvsData?.items || [],
    gaming: gamingData?.items || [] // Corrigido de 'kitchen' para 'gaming' para bater com o fetch
  };

  /**
   * RENDERIZAÇÃO DO COMPONENTE CLIENTE
   */
  return <HomeClient initialData={initialData} />;
}