import { PrismaClient, Prisma } from "@prisma/client";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

/**
 * CONFIGURAÇÃO DO PRISMA
 * No seu novo schema, o datasource está em SANDBOX_URL.
 */
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.PRICELAB_SUPABASE_DB_DIRECT,
    },
  },
});

const BBY_API_KEY = process.env.BBY_API_KEY;
const BBY_BASE_URL = process.env.BBY_BASE_URL;

// Configurações de limites e controle
const DAILY_REQUEST_LIMIT = 49000;
const SKIP_THRESHOLD = 50;
let consecutive403Count = 0; // Contador de bloqueios seguidos
const MAX_403_RETRIES = 3;   // Máximo de chances antes de desistir

// Categorias para busca profunda
const PRIORITY_CATEGORIES = [
  { name: "Laptops", id: "abcat0502000" },
  { name: "Video Cards", id: "abcat0507002" },
  { name: "Headphones", id: "abcat0204000" },
  { name: "Vacuums", id: "abcat0911000" },
  { name: "Cell Phones", id: "abcat0800000" },
  { name: "Consoles", id: "abcat0700000" },
  { name: "Refrigerators", id: "abcat0901000" },
  { name: "TVs", id: "abcat0101000" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const slugify = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

/**
 * TRAVAS DE SEGURANÇA E AUXILIARES (versão BestBuy alinhada ao eBay)
 */

async function handleRateLimit(error) {
  // BestBuy costuma retornar 403 em burst, mas 429 pode acontecer dependendo do edge/infra
  if (error?.response?.status === 429) {
    console.error(
      "\n🛑 CRITICAL: Erro 429 (Too Many Requests) detectado! Iniciando protocolo de emergência...",
    );

    // 1) Passa a vassoura nos órfãos para manter DB limpo (mesma filosofia do eBay)
    await cleanOrphanedProducts();

    // 2) Desconecta do banco com segurança
    await prisma.$disconnect();

    console.error("🛑 Script abortado com segurança.");
    process.exit(1);
  }
}

/**
 * FUNÇÃO DE LIMPEZA DE ÓRFÃOS
 * Deleta products que não possuem mais listings (ofertas).
 */
async function cleanOrphanedProducts() {
  try {
    console.log("\n🧹 Iniciando limpeza de produtos órfãos no banco de dados...");

    const deletedCount = await prisma.$executeRawUnsafe(`
      DELETE FROM products 
      WHERE id NOT IN (SELECT product_id FROM listings);
    `);

    console.log(
      `✅ Limpeza concluída! ${deletedCount} produtos sem ofertas foram removidos.`,
    );
  } catch (error) {
    console.error("❌ Erro ao limpar produtos órfãos:", error.message);
  }
}

/**
 * GERA SLUG NO MODELO PROFISSIONAL: nome-do-produto-hashCurto
 * (Obrigatório implantar a mesma lógica do eBay)
 */
function generateProfessionalSlug(name, technicalId, brand) {
  const cleanName = (name || "PRODUCT")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const normalizedBrand = (brand || "VARIOUS")
    .toString()
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  const shortHash = crypto
    .createHash("sha1")
    .update(`${technicalId}-${normalizedBrand}`)
    .digest("hex")
    .slice(0, 6);

  return `${cleanName}-${shortHash}`;
}

/**
 * Sanitiza identificadores (UPC/Model/etc) para evitar lixo
 * (Obrigatório implantar a mesma lógica do eBay)
 */
function sanitizeIdentifier(id) {
  if (!id) return null;
  const junkValues = [
    "does not apply",
    "null",
    "n/a",
    "none",
    "nan",
    "undefined",
    "not applicable",
    "unbranded",
    "unknown",
    "generic",
    "nd",
    "na",
  ];
  const cleanId = id.toString().trim();
  if (!cleanId) return null;
  if (junkValues.includes(cleanId.toLowerCase())) return null;
  if (/[^\x00-\x7F]/.test(cleanId)) return null; // bloqueia unicode “esquisito”
  if (cleanId.length < 3) return null;
  return cleanId;
}

/**
 * SANITIZAÇÃO DE MARCA (Brand)
 * Regras mais brandas para aceitar marcas de 2 letras (HP, LG, GE, WD) e limpar lixo.
 */
function sanitizeBrand(brand) {
  if (!brand) return null;
  const junkValues = [
    "does not apply", "null", "n/a", "none", "nan", "undefined", 
    "unbranded", "unknown", "generic", "various", "brand", "na", "nd"
  ];
  const cleanBrand = brand.toString().trim();
  if (!cleanBrand) return null;
  if (junkValues.includes(cleanBrand.toLowerCase())) return null;
  // Aceita 2 letras para salvar HP, LG, etc.
  if (cleanBrand.length < 2) return null; 
  return cleanBrand;
}

/**
 * Limpeza semântica para nome (alinhado ao eBay: remove ruído e marca duplicada)
 * Mantém robustez sem depender de IA; o campo aiNameCleaned continua sendo respeitado.
 */
function cleanSemanticName(title, brand) {
  if (!title) return "PRODUCT";

  // 1) Remove Emojis e símbolos de marca
  let clean = title.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    "",
  );
  clean = clean.replace(/®|™/g, "");

  // 2) Filtros de ruído comuns
  const noiseFilters = [
    /\b(?:Refurbished|Certified|New|Sealed|Open Box|Factory|Unlocked|Locked|Excellent|Geek Squad)\b/gi,
    /\b(?:High Quality|Best Price|Clearance|Warranty|Free Shipping|HOT!|DEAL!)\b/gi,
    /OPEN-BOX\s?[:\-]?/gi,
    /^\s*NEW\s*-\s*/gi,
    /^\s*USED\s*-\s*/gi,
    /^\s*REFURBISHED\s*-\s*/gi,
    /\(\s*\)/g,
    /\.\.\./g,
    /\[.*?\]/g,
  ];

  noiseFilters.forEach((regex) => {
    clean = clean.replace(regex, " ");
  });

  // Marca “válida”
  const isGenericBrand =
    /^(various|brand|multibrand|generic|unbranded|unknown|does not apply|null|n\/a|na)$/i.test(
      brand ? brand.trim() : "",
    );
  const brandName = brand && !isGenericBrand ? brand.trim().toUpperCase() : "";

  // 3) Anti-repetição de marca no início
  if (brandName) {
    const duplicateBrandRegex = new RegExp(
      `^\\s*${brandName}\\s*[:\\-\\s|/]+${brandName}\\s*`,
      "i",
    );
    const singleBrandRegex = new RegExp(
      `^\\s*${brandName}\\s*[:\\-\\s|/]+`,
      "i",
    );

    if (duplicateBrandRegex.test(clean)) {
      clean = clean.replace(duplicateBrandRegex, "");
    } else if (singleBrandRegex.test(clean)) {
      clean = clean.replace(singleBrandRegex, "");
    }
  }

  // 4) Limpeza de bordas
  clean = clean.replace(/^[:\s\-\|]+|[:\s\-\|]+$/g, "").trim();

  // 5) Formatação final: MARCA - NOME (se marca válida)
  const finalName = brandName
    ? `${brandName} - ${clean.toUpperCase()}`
    : clean.toUpperCase();

  return finalName.replace(/\s+/g, " ").trim().substring(0, 190);
}

/**
 * Normaliza condição (BestBuy tende a vir "New", "Pre-Owned" etc; padronizamos como no eBay)
 */
function normalizeCondition(condition) {
  if (!condition) return "NEW";
  const c = condition.toString().toUpperCase();
  if (c.includes("NEW")) return "NEW";
  if (c.includes("REFURB")) return "REFURBISHED";
  if (c.includes("USED") || c.includes("PRE-OWNED") || c.includes("PREOWNED"))
    return "REFURBISHED"; // <- mata USED
  if (c.includes("OPEN BOX") || c.includes("OPEN-BOX") || c.includes("OPENBOX"))
    return "OPEN_BOX";
  return "NEW";
}

/**
 * Helpers para garantir compatibilidade com limites do schema novo
 */
function safeVarchar(value, maxLen) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  if (!maxLen) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * MAPEAMENTO DE CATEGORIAS
 */
const mapInternalCategory = (categoryPathArray, productName) => {
  const ids = (categoryPathArray || []).map((c) => c.id);
  const name = productName?.toLowerCase() || "";

  if (ids.includes("abcat0502000") || name.includes("laptop")) return "laptops";
  if (ids.includes("abcat0501000") || name.includes("desktop")) return "desktops";
  if (
    ids.includes("abcat0507002") ||
    name.includes("graphics card") ||
    name.includes("gpu")
  )
    return "video-cards";
  if (ids.includes("abcat0507010") || name.includes("processor") || name.includes("cpu"))
    return "processors";
  if (ids.includes("abcat0506000")) return "memory-ram";
  if (ids.includes("abcat0507008")) return "motherboards";
  if (ids.includes("abcat0504001") || name.includes("ssd") || name.includes("hard drive"))
    return "storage";
  if (ids.includes("abcat0509000") || name.includes("monitor")) return "monitors";
  if (ids.includes("abcat0513000")) return "keyboards-mice";
  if (ids.includes("abcat0503000") || name.includes("router")) return "networking";
  if (ids.includes("abcat0801000") || ids.includes("abcat0800000") || name.includes("iphone"))
    return "smartphones";
  if (ids.includes("abcat0700000")) return "gaming-consoles";
  if (ids.includes("abcat0101000")) return "tvs";
  if (ids.includes("abcat0204000") || name.includes("headphone")) return "audio-headphones";
  if (ids.includes("abcat0401000")) return "cameras";
  if (ids.includes("abcat0901000")) return "refrigerators";
  if (ids.includes("abcat0912000")) return "small-appliances";
  if (ids.includes("abcat0903000")) return "microwaves";
  if (ids.includes("abcat0910000")) return "washers-dryers";
  if (ids.includes("abcat0911000")) return "vacuums";

  if (categoryPathArray && categoryPathArray.length > 0) {
    return slugify(categoryPathArray[categoryPathArray.length - 1].name);
  }
  return "general";
};

/**
 * (Mantida) Log de SKUs não encontrados
 * Você pediu para remover a geração de arquivo. Mantive a função para não quebrar o fluxo,
 * mas agora ela só imprime no console (sem criar .txt).
 */
async function logMissingSkus(skus) {
  try {
    const timestamp = new Date().toLocaleString();
    console.warn(
      `⚠️ [${timestamp}] SKUs sumidos da API (BestBuy): ${Array.isArray(skus) ? skus.join(", ") : skus}`,
    );
  } catch (e) {
    // noop
  }
}

/**
 * PROCESSAMENTO INDIVIDUAL DE PRODUTO
 * Correção: extrai e persiste TODOS os campos que o script antigo recebia da API BestBuy,
 * mas agora distribuindo corretamente entre Product (entidade) e Listing (oferta).
 */
async function processProduct(item) {
  const skuStr = String(item.sku);
  if (!item.salePrice || Number(item.salePrice) <= 0) return;

  // --- CAMPOS “ANTIGOS” EXTRAÍDOS DA API (mesma fonte do script anterior) ---
  const apiName = item.name; // antigo: product.name
  const apiBrand = item.brand || item.manufacturer; // CORRIGIDO: Agora tenta pegar de ambos os campos da BestBuy
  const apiImage = item.image; // antigo: product.image
  const apiUrl = item.url; // antigo: product.url
  const apiSalePrice = parseFloat(item.salePrice); // antigo: product.salePrice
  const apiRegularPrice = parseFloat(item.regularPrice || item.salePrice); // antigo: product.regularPrice
  const apiOnSale = Boolean(item.onSale); // antigo: product.onSale
  const apiConditionRaw = item.condition || "New"; // antigo: product.condition
  const apiOnlineAvailability = item.onlineAvailability === true; // antigo: product.onlineAvailability
  const apiIsExpired = !apiOnlineAvailability; // antigo: product.isExpired
  const apiUpc = item.upc; // antigo: product.upc
  const apiModelNumber = item.modelNumber; // antigo: rawDetails.model_number + fallback groupId
  const apiCategoryPathArr = item.categoryPath || [];
  const apiCategoryPathStr = apiCategoryPathArr.map((c) => c.name).join(" > "); // antigo: product.categoryPath

  const apiCustomerReviewAverage = item.customerReviewAverage; // antigo: product.customerReviewAverage
  const apiCustomerReviewCount = item.customerReviewCount; // antigo: product.customerReviewCount

  // --- TRANSFORMAÇÕES (BestBuy alinhado ao eBay) ---
  const internalCat = mapInternalCategory(apiCategoryPathArr, apiName);
  const cleanCond = normalizeCondition(apiConditionRaw);

  // resolvedGroupId (antigo)
  const resolvedGroupId = sanitizeIdentifier(apiUpc) || sanitizeIdentifier(apiModelNumber) || skuStr;

  // Marca (CORRIGIDO: Agora usa sanitizeBrand para permitir marcas de 2 letras como HP, LG)
  const capturedBrand = sanitizeBrand(apiBrand);
  const brand = capturedBrand || "VARIOUS";

  // Nome “limpo” (semântica)
  const finalDisplayName = cleanSemanticName(apiName, brand);

  // --- technicalId / normalizedModelKey (obrigatório, estilo eBay) ---
  // Prioridade: UPC > modelNumber > sku
  const technicalId =
    sanitizeIdentifier(apiUpc) || sanitizeIdentifier(apiModelNumber) || skuStr;
  const modelKey = technicalId; // âncora técnica pura
  const isGlobalId = technicalId && /^\d+$/.test(technicalId);

  // Campos de Product no schema novo possuem limites
  const category_path_db = safeVarchar(apiCategoryPathStr, 255);
  const brand_db = safeVarchar(brand.toUpperCase(), 100);
  const internalCat_db = safeVarchar(internalCat, 100);
  const group_id_db = safeVarchar(resolvedGroupId, 255);
  const upc_db = safeVarchar(isGlobalId ? technicalId : sanitizeIdentifier(apiUpc), 50);
  const normalizedModelKey_db = safeVarchar(modelKey, 255);

  // --- DETAILS (antigo rawDetails: enrichedData) ---
  const allTechnicalSpecs = {};
  if (Array.isArray(item.details) && item.details.length > 0) {
    item.details.forEach((detail) => {
      if (!detail?.name) return;
      const cleanKey = detail.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_");
      allTechnicalSpecs[cleanKey] = detail.value;
    });
  }

  // enrichedData antigo (mantido)
  const enrichedData = {
    ...allTechnicalSpecs,
    model_number: apiModelNumber ? String(apiModelNumber).trim() : null,
    color: item.color || null,
    sync_at: new Date().toISOString(),
    // EXTRA: inclui campos “antigos” para rastreabilidade (sem perder nada)
    bby: {
      sku: skuStr,
      name: apiName || null,
      manufacturer: item.manufacturer || null,
      categoryPath: apiCategoryPathStr || null,
      upc: apiUpc || null,
      modelNumber: apiModelNumber || null,
      condition: apiConditionRaw || null,
      onlineAvailability: apiOnlineAvailability,
      isExpired: apiIsExpired,
      salePrice: apiSalePrice,
      regularPrice: apiRegularPrice,
      onSale: apiOnSale,
      image: apiImage || null,
      url: apiUrl || null,
      customerReviewAverage:
        apiCustomerReviewAverage !== undefined ? apiCustomerReviewAverage : null,
      customerReviewCount:
        apiCustomerReviewCount !== undefined ? apiCustomerReviewCount : null,
    },
  };

  try {
    // --- HIERARQUIA DE MATCHING (UPC -> normalizedModelKey -> group_id) ---
    let existingProduct = null;

    // A) UPC (se global)
    if (isGlobalId) {
      existingProduct = await prisma.product.findFirst({
        where: { upc: technicalId },
        select: { id: true, slug: true, aiNameCleaned: true },
      });
    }

    // B) normalizedModelKey
    if (!existingProduct) {
      existingProduct = await prisma.product.findFirst({
        where: { normalizedModelKey: normalizedModelKey_db },
        select: { id: true, slug: true, aiNameCleaned: true },
      });
    }

    // C) group_id
    if (!existingProduct && group_id_db) {
      existingProduct = await prisma.product.findFirst({
        where: { group_id: group_id_db },
        select: { id: true, slug: true, aiNameCleaned: true },
      });
    }

    let product;

    if (existingProduct) {
      // Update Product sem tocar no slug (imutável)
      const updateData = {
        lastUpdated: new Date(),
        category_path: category_path_db || undefined,
        internalCategory: internalCat_db || undefined,
        group_id: group_id_db || undefined,
        normalizedModelKey: normalizedModelKey_db || undefined,
        upc: upc_db || undefined,
      };

      // Reviews: só atualiza se vier definido (evita “reset”)
      if (apiCustomerReviewAverage != null) {
        updateData.customerReviewAverage = new Prisma.Decimal(
          String(apiCustomerReviewAverage),
        );
      }
      if (apiCustomerReviewCount != null) {
        updateData.customerReviewCount = Number(apiCustomerReviewCount);
      }

      // Nome e Marca: só se não estiver protegido pela IA
      if (existingProduct.aiNameCleaned === false) {
        updateData.name = finalDisplayName;
        updateData.brand = brand_db;
      }

      product = await prisma.product.update({
        where: { id: existingProduct.id },
        data: updateData,
      });
    } else {
      // Create Product: gera slug uma única vez
      const initialSlug = safeVarchar(
        generateProfessionalSlug(finalDisplayName, technicalId, brand),
        255,
      );

      product = await prisma.product.create({
        data: {
          name: finalDisplayName,
          brand: brand_db,
          category_path: category_path_db,
          internalCategory: internalCat_db,
          upc: upc_db,
          normalizedModelKey: normalizedModelKey_db,
          group_id: group_id_db,
          slug: initialSlug,
          customerReviewAverage:
            apiCustomerReviewAverage != null
              ? new Prisma.Decimal(String(apiCustomerReviewAverage))
              : null,
          customerReviewCount:
            apiCustomerReviewCount != null ? Number(apiCustomerReviewCount) : null,
          aiNameCleaned: false,
          lastUpdated: new Date(),
        },
      });
    }

    // --- LISTING (oferta BestBuy) ---
    const listing = await prisma.listing.upsert({
      where: { sku: skuStr },
      update: {
        productId: product.id,
        store: "BestBuy",
        url: apiUrl || null,
        image: apiImage || null,
        condition: cleanCond, // agora normalizado; no antigo era raw condition no Product
        regularPrice: new Prisma.Decimal(String(apiRegularPrice)),
        salePrice: new Prisma.Decimal(String(apiSalePrice)),
        onSale: apiOnSale,
        onlineAvailability: apiOnlineAvailability,
        isExpired: apiIsExpired,
        rawDetails: enrichedData, // mantém specs + campos antigos
        lastUpdated: new Date(),
      },
      create: {
        sku: skuStr,
        productId: product.id,
        store: "BestBuy",
        url: apiUrl || null,
        image: apiImage || null,
        condition: cleanCond,
        regularPrice: new Prisma.Decimal(String(apiRegularPrice)),
        salePrice: new Prisma.Decimal(String(apiSalePrice)),
        onSale: apiOnSale,
        onlineAvailability: apiOnlineAvailability,
        isExpired: apiIsExpired,
        rawDetails: enrichedData,
        lastUpdated: new Date(),
      },
      select: { id: true, sku: true },
    });

    // --- PRICE HISTORY por LISTING ---
    const lastHistory = await prisma.priceHistory.findFirst({
      where: { listingId: listing.id },
      orderBy: { capturedAt: "desc" },
    });

    const lastPriceStr = lastHistory?.price ? lastHistory.price.toString() : null;
    const salePriceStr = new Prisma.Decimal(String(apiSalePrice)).toString();

    if (!lastHistory || lastPriceStr !== salePriceStr) {
      await prisma.priceHistory.create({
        data: {
          price: new Prisma.Decimal(String(apiSalePrice)),
          listingId: listing.id,
          condition: cleanCond,
          capturedAt: new Date(),
        },
      });
      process.stdout.write(`📈`);
    } else {
      process.stdout.write(`✅`);
    }
  } catch (e) {
    await handleRateLimit(e);
    console.error(`\n❌ Erro SKU ${skuStr}:`, e?.message || e);
  }
}

/**
 * LIMPEZA DE SEGURANÇA
 * Expiração é em Listing (oferta), não em Product.
 */
async function invalidateOldOffers() {
  console.log(`\n🧹 Iniciando limpeza de segurança (Safety Net)...`);
  const threshold = new Date();
  threshold.setHours(threshold.getHours() - 48);

  const result = await prisma.listing.updateMany({
    where: {
      store: "BestBuy",
      isExpired: false,
      lastUpdated: { lt: threshold },
    },
    data: {
      isExpired: true,
      onlineAvailability: false,
    },
  });

  console.log(
    `\n✅ Limpeza concluída: ${result.count} ofertas antigas marcadas como expiradas.`,
  );
}

/**
 * FUNÇÃO PRINCIPAL
 * Controle diário baseado em Listing.lastUpdated (BestBuy).
 */
async function syncProducts() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  console.log(`🚀 Sincronização Direta Iniciada: ${new Date().toLocaleString()}`);

  try {
    if (!BBY_API_KEY || !BBY_BASE_URL) {
      throw new Error("BBY_API_KEY ou BBY_BASE_URL não definidos no ambiente.");
    }

    let currentUpdatedToday = await prisma.listing.count({
      where: { lastUpdated: { gte: todayStart }, store: "BestBuy" },
    });

    // --- PASSO 1: ATUALIZAÇÃO ---
    console.log(`\n--- Passo 1: Atualizando itens existentes ---`);
    while (currentUpdatedToday < DAILY_REQUEST_LIMIT) {
      const batchSize = 100;

      const outdatedProducts = await prisma.listing.findMany({
        where: {
          store: "BestBuy",
          OR: [{ lastUpdated: { lt: todayStart } }, { lastUpdated: null }],
        },
        select: { sku: true },
        take: 100,
        orderBy: { lastUpdated: "asc" },
      });

      if (outdatedProducts.length === 0) {
        console.log("\n✅ Todos os itens existentes estão em dia.");
        break;
      }

      for (let i = 0; i < outdatedProducts.length; i += batchSize) {
        const batch = outdatedProducts.slice(i, i + batchSize);
        const skuList = batch.map((p) => p.sku).join(",");
        const url = `${BBY_BASE_URL}/products(sku in(${skuList}))?apiKey=${BBY_API_KEY}&format=json&pageSize=${batchSize}&show=all`;

        try {
          const response = await axios.get(url);
          consecutive403Count = 0; // Zera o contador no sucesso
          const apiProducts = response.data.products || [];
          const foundSkus = apiProducts.map((p) => String(p.sku));

          for (const item of apiProducts) {
            await processProduct(item);
          }

          const missing = batch.map((p) => p.sku).filter((s) => !foundSkus.includes(s));
          if (missing.length > 0) {
            await logMissingSkus(missing);

            await prisma.listing.updateMany({
              where: { sku: { in: missing }, store: "BestBuy" },
              data: {
                isExpired: true,
                onlineAvailability: false,
                lastUpdated: new Date(),
              },
            });

            process.stdout.write(`👻(${missing.length})`);
          }

          await sleep(4000);
        } catch (err) {
          await handleRateLimit(err);

          if (err.response?.status === 403) {
            consecutive403Count++;
            if (consecutive403Count >= MAX_403_RETRIES) {
              throw new Error("💀 API da Best Buy bloqueou de vez (Cota diária ou IP). Abortando script.");
            }
            console.log(`\n🛑 403 Detectado (Tentativa ${consecutive403Count}/3). Pausando 65 segundos...`);
            await sleep(65000);
            i -= batchSize; 
            continue; 
          } else {
            console.error(`\n🚨 Erro de conexão ou API:`, err.message);
            console.log(`Pausando 10 segundos para estabilizar...`);
            await sleep(10000);
          }
        }
      }

      currentUpdatedToday = await prisma.listing.count({
        where: { lastUpdated: { gte: todayStart }, store: "BestBuy" },
      });
      console.log(`\n📦 Progresso: ${currentUpdatedToday} verificados hoje.`);
    }

    // --- PASSO 2: NOVOS LANÇAMENTOS ---
    if (currentUpdatedToday < DAILY_REQUEST_LIMIT) {
      console.log(`\n--- Passo 2: Buscando novos lançamentos ---`);
      let page = 1;
      let consecutiveSkips = 0;

      while (page <= 100 && currentUpdatedToday < DAILY_REQUEST_LIMIT) {
        const newsUrl = `${BBY_BASE_URL}/products(active=true&salePrice>0)?apiKey=${BBY_API_KEY}&format=json&pageSize=100&page=${page}&sort=startDate.desc&show=all`;

        try {
          const response = await axios.get(newsUrl);
          consecutive403Count = 0; // Zera o contador no sucesso
          const products = response.data.products;
          if (!products || products.length === 0) break;

          for (const item of products) {
            const skuStr = String(item.sku);
            const existsToday = await prisma.listing.findFirst({
              where: { sku: skuStr, store: "BestBuy", lastUpdated: { gte: todayStart } },
              select: { id: true },
            });

            if (!existsToday) {
              await processProduct(item);
              consecutiveSkips = 0;
            } else {
              consecutiveSkips++;
              process.stdout.write(`⏩`);
            }

            if (consecutiveSkips >= SKIP_THRESHOLD) {
              console.log(`\n✋ Alcançamos itens conhecidos na varredura global.`);
              break;
            }
          }
          if (consecutiveSkips >= SKIP_THRESHOLD) break;

          console.log(`\n✨ Página ${page} de novidades verificada.`);
          page++;
          await sleep(3000);

          currentUpdatedToday = await prisma.listing.count({
            where: { lastUpdated: { gte: todayStart }, store: "BestBuy" },
          });
        } catch (err) {
          await handleRateLimit(err);
          if (err.response?.status === 403) {
            consecutive403Count++;
            if (consecutive403Count >= MAX_403_RETRIES) {
              throw new Error("💀 API da Best Buy bloqueou de vez (Cota diária ou IP). Abortando script.");
            }
            console.log(`\n🛑 403 Detectado (Tentativa ${consecutive403Count}/3). Pausando 65 segundos...`);
            await sleep(65000);
            continue; 
          } else {
             console.error(`\n❌ Erro na varredura:`, err.message);
             break;
          }
        }
      }
    }

    // --- PASSO 3: BUSCA PROFUNDA ---
    if (currentUpdatedToday < DAILY_REQUEST_LIMIT) {
      console.log(`\n--- Passo 3: Busca profunda em categorias prioritárias ---`);
      for (const cat of PRIORITY_CATEGORIES) {
        console.log(`\n🔎 Explorando: ${cat.name}`);
        let catPage = 1;
        let catSkips = 0;

        while (catPage <= 20 && currentUpdatedToday < DAILY_REQUEST_LIMIT) {
          const catUrl = `${BBY_BASE_URL}/products(categoryPath.id=${cat.id}&active=true&salePrice>0)?apiKey=${BBY_API_KEY}&format=json&pageSize=100&page=${catPage}&sort=bestSellingRank.asc&show=all`;

          try {
            const response = await axios.get(catUrl);
            consecutive403Count = 0; // Zera o contador no sucesso
            const products = response.data.products;
            if (!products || products.length === 0) break;

            for (const item of products) {
              const skuStr = String(item.sku);
              const existsToday = await prisma.listing.findFirst({
                where: { sku: skuStr, store: "BestBuy", lastUpdated: { gte: todayStart } },
                select: { id: true },
              });

              if (!existsToday) {
                await processProduct(item);
                catSkips = 0;
              } else {
                catSkips++;
                process.stdout.write(`⏩`);
              }
            }

            if (catSkips >= 100) {
              console.log(`\n⏭️ Categoria ${cat.name} parece atualizada.`);
              break;
            }

            catPage++;
            await sleep(3500);

            currentUpdatedToday = await prisma.listing.count({
              where: { lastUpdated: { gte: todayStart }, store: "BestBuy" },
            });
          } catch (err) {
            await handleRateLimit(err);
            if (err.response?.status === 403) {
              consecutive403Count++;
              if (consecutive403Count >= MAX_403_RETRIES) {
                throw new Error("💀 API da Best Buy bloqueou de vez (Cota diária ou IP). Abortando script.");
              }
              console.log(`\n🛑 403 Detectado (Tentativa ${consecutive403Count}/3). Pausando 65 segundos...`);
              await sleep(65000);
              continue; 
            } else {
              console.error(`\n❌ Erro na categoria ${cat.name}:`, err.message);
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    await handleRateLimit(error);
    console.error("\n🚨 Erro Crítico:", error.message);
  } finally {
    await invalidateOldOffers();
    await cleanOrphanedProducts();
    await prisma.$disconnect();
    console.log("\n🏁 Sincronização finalizada.");
  }
}

syncProducts();