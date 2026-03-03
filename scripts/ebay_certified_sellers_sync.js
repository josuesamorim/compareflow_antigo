const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

// --- CONFIGURAÇÕES DE CREDENCIAIS ---
const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;

// --- CONFIGURAÇÕES DE CONTROLE ---
const MAX_REQUESTS_DAILY = 500; // limite diário
const MAX_PRODUCTS_PER_PAGE = 5; 
const MAX_PAGES_PER_CATEGORY = 1;  

const TARGET_CATEGORIES = [
  { id: '9355',   name: 'Cell Phones' } 
];

// Auxiliares de Controle e Estado
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let totalRequestsPerformed = 0;

/**
 * MAPPER: Converte a estrutura aninhada do eBay no formato plano (Flat) da BestBuy
 * Inclui normalização de chaves para garantir que eBay e BestBuy falem a mesma língua.
 */
function mapEbayToBestBuyStructure(ebayRaw) {
  const flatSpecs = {};

  // 1. Extrai os Aspectos Técnicos (localizedAspects) para a raiz do objeto
  if (Array.isArray(ebayRaw.localizedAspects)) {
    ebayRaw.localizedAspects.forEach(aspect => {
      // Normaliza a chave base: "Region Code" -> "region_code"
      let key = aspect.name.toLowerCase().replace(/ /g, '_').replace(/[^a-z0-9_]/g, '');
      
      /**
       * ALIASING (DE-PARA): Força a nomenclatura da BestBuy
       * Garante que campos essenciais tenham nomes idênticos em todas as lojas.
       */
      if (key === 'model') key = 'model_number';
      if (key === 'main_color' || key === 'colour') key = 'color';
      if (key === 'title') key = 'product_name';

      flatSpecs[key] = aspect.value;
    });
  }

  // 2. Mapeia campos globais importantes para o padrão V25 (Garantia de Preenchimento)
  flatSpecs.brand = ebayRaw.brand || flatSpecs.brand || "N/A";
  flatSpecs.model_number = flatSpecs.model_number || ebayRaw.gtin || "N/A";
  flatSpecs.product_name = ebayRaw.title || flatSpecs.product_name || "N/A";
  flatSpecs.upc = ebayRaw.gtin || flatSpecs.upc || "N/A";
  flatSpecs.condition = ebayRaw.condition || "N/A";
  flatSpecs.sync_at = new Date().toISOString();

  return flatSpecs;
}

/**
 * Obtém o Token de Acesso (Application Access Token) do eBay via OAuth2
 */
async function getEbayAccessToken() {
    console.log('🔑 Obtendo novo token de acesso do eBay...');
    const authHeader = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64');
    
    try {
        const response = await axios.post(
            'https://api.ebay.com/identity/v1/oauth2/token',
            'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${authHeader}`
                }
            }
        );
        totalRequestsPerformed++;
        console.log('✅ Token obtido com sucesso.');
        return response.data.access_token;
    } catch (error) {
        console.error('❌ Erro ao obter token do eBay:', error.response?.data || error.message);
        throw new Error('Falha na autenticação inicial.');
    }
}

/**
 * Detecta se o título contém múltiplas opções de armazenamento
 */
function hasMultipleStorageVariations(title) {
  const upperTitle = title.toUpperCase();
  const storagePatterns = [/\b64\s?GB\b/g, /\b128\s?GB\b/g, /\b256\s?GB\b/g, /\b512\s?GB\b/g, /\b1\s?TB\b/g];
  let matchesFound = 0;
  storagePatterns.forEach(pattern => {
    pattern.lastIndex = 0;
    if (pattern.test(upperTitle)) matchesFound++;
  });
  return matchesFound >= 2;
}

/**
 * Padroniza a condição para o comparador
 */
function normalizeCondition(condition) {
  if (!condition) return 'NEW';
  const c = condition.toString().toUpperCase();
  if (c.includes('NEW') || c.includes('1000')) return 'NEW';
  if (c.includes('REFURBISHED') || c.includes('2000') || c.includes('2500')) return 'REFURBISHED';
  if (c.includes('USED') || c.includes('3000')) return 'USED';
  return 'NEW';
}

/**
 * Filtra identificadores inúteis e caracteres estranhos.
 */
function sanitizeIdentifier(id) {
  if (!id) return null;
  const junkValues = ['does not apply', 'null', 'n/a', 'none', 'nan', 'undefined', 'not applicable', 'unbranded', 'unknown', 'generic', 'nd', 'na', '不适用'];
  const cleanId = id.toString().trim();
  if (junkValues.includes(cleanId.toLowerCase())) return null;
  if (/[^\x00-\x7F]/.test(cleanId)) return null;
  if (cleanId.length < 3) return null;
  return cleanId;
}

/**
 * Remove emojis e limpa ruídos.
 */
function removeEmojisAndClean(str) {
  if (!str) return '';
  return str.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '')
            .replace(/\(\s*\)/g, '')
            .replace(/\s+/g, ' ')
            .trim();
}

function getAspect(aspects, name) {
  const found = aspects.find(a => a.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : null;
}

/**
 * Limpeza Semântica para nomes de produtos.
 */
function cleanSemanticName(title, brand, categoryId, technicalCodes = []) {
  let name = removeEmojisAndClean(title);
  technicalCodes.forEach(code => {
    if (code && code.length > 3) {
      const escapedCode = code.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      name = name.replace(new RegExp(escapedCode, 'gi'), ' ');
    }
  });
  const filters = [/\b(?:Refurbished|Certified|New|Sealed|Open Box|Factory|Unlocked|Locked)\b/gi, /\b(?:High Quality|Best Price|Clearance|Warranty|Free Shipping)\b/gi, /\[.*?\]/g];
  filters.forEach(regex => { name = name.replace(regex, ' '); });
  const cleanBrand = (brand && !/generic|unbranded/i.test(brand)) ? brand : '';
  if (cleanBrand) name = name.replace(new RegExp(`\\b${cleanBrand}\\b`, 'gi'), ' ');
  return `${cleanBrand} ${name}`.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Chave única profissional.
 */
function createProfessionalKey(brand, semanticName, cpu = '', ram = '') {
  const namePart = semanticName.toLowerCase().replace(/\s+/g, '-');
  const brandPart = brand ? brand.toLowerCase() : 'unknown';
  let keyComponents = [brandPart, namePart];
  if (cpu) keyComponents.push(cpu.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (ram) keyComponents.push(ram.toLowerCase().replace(/[^a-z0-9]/g, ''));
  return keyComponents.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * FUNÇÃO PRINCIPAL OTIMIZADA
 */
async function syncEbayMultiCategory() {
  try {
    const EBAY_TOKEN = await getEbayAccessToken();
    
    console.log('🚀 Iniciando Exploração Resiliente...');
    console.log(`📊 Limite diário: ${MAX_REQUESTS_DAILY} reqs.`);

    for (const category of TARGET_CATEGORIES) {
      console.log(`\n📂 Categoria: ${category.name}`);
      let currentPage = 1;
      let nextUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?category_ids=${category.id}&filter=conditionIds:{2000},buyingOptions:{FIXED_PRICE}&limit=${MAX_PRODUCTS_PER_PAGE}`;

      while (nextUrl && currentPage <= MAX_PAGES_PER_CATEGORY) {
        
        if (totalRequestsPerformed >= MAX_REQUESTS_DAILY) {
            console.warn('⚠️ Limite diário atingido.');
            return;
        }

        console.log(`\n   📄 Processando Página ${currentPage}...`);
        
        let searchResponse;
        try {
            searchResponse = await axios.get(nextUrl, { headers: { Authorization: `Bearer ${EBAY_TOKEN}` } });
            totalRequestsPerformed++;
        } catch (err) {
            if (err.response?.status === 429) process.exit(1);
            throw err;
        }

        const items = searchResponse.data.itemSummaries || [];
        nextUrl = searchResponse.data.next || null;
        currentPage++;

        const itemIds = items.map(i => i.itemId);
        const existingListings = await prisma.listing.findMany({
          where: { sku: { in: itemIds } },
          select: { sku: true, lastUpdated: true }
        });

        const lastUpdateMap = new Map(existingListings.map(l => [l.sku, l.lastUpdated]));
        const todayStr = new Date().toISOString().split('T')[0];

        const chunkSize = 2;
        for (let i = 0; i < items.length; i += chunkSize) {
          const chunk = items.slice(i, i + chunkSize);
          
          await Promise.all(chunk.map(async (summary) => {
            if (totalRequestsPerformed >= MAX_REQUESTS_DAILY) return;
            if (summary.itemId.startsWith('EBAY-')) return;

            const lastUpdated = lastUpdateMap.get(summary.itemId);
            if (lastUpdated && lastUpdated.toISOString().split('T')[0] === todayStr) return; 

            try {
              await sleep(1000);

              const detailResponse = await axios.get(`https://api.ebay.com/buy/browse/v1/item/${summary.itemId}`, { 
                headers: { Authorization: `Bearer ${EBAY_TOKEN}` } 
              });
              totalRequestsPerformed++;

              const item = detailResponse.data;

              // --- CONVERSÃO PARA NOVO LAYOUT JSON + PADRONIZAÇÃO DE CHAVES ---
              const normalizedRawDetails = mapEbayToBestBuyStructure(item);

              if (item.primaryItemGroup && item.primaryItemGroup.itemGroupType === 'SELLER_DEFINED_VARIATIONS') return;
              if (hasMultipleStorageVariations(summary.title)) return;

              const aspects = item.localizedAspects || [];

              let brand = sanitizeIdentifier(item.brand) || sanitizeIdentifier(getAspect(aspects, 'Brand'));
              if (!brand || /generic|unbranded/i.test(brand)) return;

              const mpn = sanitizeIdentifier(item.mpn) || sanitizeIdentifier(getAspect(aspects, 'MPN'));
              const upc = sanitizeIdentifier(item.gtin) || sanitizeIdentifier(getAspect(aspects, 'UPC'));
              const technicalId = upc || mpn || sanitizeIdentifier(getAspect(aspects, 'Model'));
              if (!technicalId) return;

              const finalDisplayName = cleanSemanticName(summary.title, brand, category.id, [upc, mpn]);
              if (finalDisplayName.length < 5) return;

              const modelKey = createProfessionalKey(brand, finalDisplayName, getAspect(aspects, 'Processor'), getAspect(aspects, 'RAM Size'));
              const targetSlug = technicalId.toLowerCase().replace(/[^a-z0-9-]/gi, '-');

              const productInDb = await prisma.product.findUnique({
                where: { slug: targetSlug },
                include: { listings: { where: { store: { mode: 'insensitive', equals: 'BestBuy' } } } }
              });

              const isBestBuyProduct = productInDb && productInDb.listings.length > 0;
              const alreadyCleanedByAi = productInDb && productInDb.aiNameCleaned === true;

              const product = await prisma.product.upsert({
                where: { slug: targetSlug },
                update: {
                  url: item.itemWebUrl, 
                  lastUpdated: new Date(),
                  name: (isBestBuyProduct || alreadyCleanedByAi) ? productInDb.name : finalDisplayName
                },
                create: {
                  name: finalDisplayName,
                  brand,
                  upc: technicalId, 
                  internalCategory: category.name, 
                  normalizedModelKey: modelKey,
                  slug: targetSlug,
                  aiNameCleaned: false
                }
              });

              const salePrice = parseFloat(item.price.value);
              const avail = item.estimatedAvailabilities?.[0];
              const isAvailable = avail ? (avail.estimatedAvailabilityStatus === 'IN_STOCK') : true;
              const cleanCondition = normalizeCondition(item.condition || summary.condition);

              const isNewListing = !lastUpdateMap.has(item.itemId);
              const listing = await prisma.listing.upsert({
                where: { sku: item.itemId },
                update: { 
                  salePrice, 
                  lastUpdated: new Date(), 
                  isExpired: false, 
                  onlineAvailability: isAvailable,
                  condition: cleanCondition,
                  rawDetails: normalizedRawDetails // SALVANDO O NOVO LAYOUT PLANO PADRONIZADO
                },
                create: {
                  sku: item.itemId,
                  productId: product.id,
                  store: 'Ebay',
                  url: item.itemWebUrl,
                  image: item.image?.imageUrl,
                  condition: cleanCondition,
                  salePrice,
                  regularPrice: item.marketingPrice?.originalPrice?.value ? parseFloat(item.marketingPrice.originalPrice.value) : null,
                  onSale: !!item.marketingPrice,
                  onlineAvailability: isAvailable,
                  isExpired: false,
                  rawDetails: normalizedRawDetails // SALVANDO O NOVO LAYOUT PLANO PADRONIZADO
                }
              });

              const statusTag = isNewListing ? ' [NOVO]' : ' [ATUALIZADO]';
              console.log(`      ✨${statusTag}: ${finalDisplayName} - $${salePrice}`);

              const lastHistory = await prisma.priceHistory.findFirst({
                  where: { listingId: listing.id },
                  orderBy: { capturedAt: 'desc' }
              });

              if (!lastHistory || parseFloat(lastHistory.price) !== salePrice) {
                  await prisma.priceHistory.create({
                    data: { listingId: listing.id, price: salePrice, condition: cleanCondition }
                  });
              }
            } catch (err) {
              if (err.response?.status === 404) {
                await prisma.listing.updateMany({ where: { sku: summary.itemId }, data: { isExpired: true } });
              }
              if (err.response?.status === 429) process.exit(1); 
            }
          }));
          await sleep(1000);
          if (totalRequestsPerformed >= MAX_REQUESTS_DAILY) break;
        }
      }
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

syncEbayMultiCategory();