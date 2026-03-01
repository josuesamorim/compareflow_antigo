import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fs from 'fs';

/**
 * CONFIGURAÇÃO DO PRISMA
 * Forçamos a conexão direta (Porta 5432) para evitar o erro P1001 do PgBouncer
 * durante operações massivas de escrita (upsert/updateMany).
 */
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL_SUPABASE, // Garanta que ele lê a 5432 do seu .env
    },
  },
});

const BBY_API_KEY = process.env.BBY_API_KEY; 
const BBY_BASE_URL = process.env.BBY_BASE_URL;

// Configurações de limites e controle
const DAILY_REQUEST_LIMIT = 49000; 
const SKIP_THRESHOLD = 50; 

// Categorias para busca profunda
const PRIORITY_CATEGORIES = [
    { name: 'Laptops', id: 'abcat0502000' },
    { name: 'Video Cards', id: 'abcat0507002' },
    { name: 'Processors', id: 'abcat0507010' },
    { name: 'Monitors', id: 'abcat0509000' },
    { name: 'Cell Phones', id: 'abcat0800000' },
    { name: 'Consoles', id: 'abcat0700000' },
    { name: 'Memory RAM', id: 'abcat0506000' },
    { name: 'Motherboards', id: 'abcat0507008' }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const slugify = (str) => {
    if (!str) return "";
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-') 
        .replace(/^-|-$/g, '');
};

/**
 * MAPEAMENTO DE CATEGORIAS
 */
const mapInternalCategory = (categoryPathArray, productName) => {
    const ids = (categoryPathArray || []).map(c => c.id);
    const name = productName?.toLowerCase() || "";
    
    if (ids.includes('abcat0502000') || name.includes('laptop')) return 'laptops';
    if (ids.includes('abcat0501000') || name.includes('desktop')) return 'desktops';
    if (ids.includes('abcat0507002') || name.includes('graphics card') || name.includes('gpu')) return 'video-cards';
    if (ids.includes('abcat0507010') || name.includes('processor') || name.includes('cpu')) return 'processors';
    if (ids.includes('abcat0506000')) return 'memory-ram';
    if (ids.includes('abcat0507008')) return 'motherboards';
    if (ids.includes('abcat0504001') || name.includes('ssd') || name.includes('hard drive')) return 'storage';
    if (ids.includes('abcat0509000') || name.includes('monitor')) return 'monitors';
    if (ids.includes('abcat0513000')) return 'keyboards-mice';
    if (ids.includes('abcat0503000') || name.includes('router')) return 'networking';
    if (ids.includes('abcat0801000') || ids.includes('abcat0800000') || name.includes('iphone')) return 'smartphones';
    if (ids.includes('abcat0700000')) return 'gaming-consoles';
    if (ids.includes('abcat0101000')) return 'tvs';
    if (ids.includes('abcat0204000') || name.includes('headphone')) return 'audio-headphones';
    if (ids.includes('abcat0401000')) return 'cameras';
    if (ids.includes('abcat0901000')) return 'refrigerators';
    if (ids.includes('abcat0912000')) return 'small-appliances';
    if (ids.includes('abcat0903000')) return 'microwaves';
    if (ids.includes('abcat0910000')) return 'washers-dryers';
    if (ids.includes('abcat0911000')) return 'vacuums';

    if (categoryPathArray && categoryPathArray.length > 0) {
        return slugify(categoryPathArray[categoryPathArray.length - 1].name);
    }
    return 'general'; 
};

/**
 * PROCESSAMENTO INDIVIDUAL DE PRODUTO
 */
async function processProduct(item) {
    const skuStr = String(item.sku);
    if (!item.salePrice || item.salePrice <= 0) return;

    // VERIFICAÇÃO DE DISPONIBILIDADE ONLINE
    const isAvailable = item.onlineAvailability === true;

    const categoryPathStr = (item.categoryPath || []).map(c => c.name).join(' > ');
    const resolvedGroupId = item.upc || item.modelNumber || skuStr;
    const internalCat = mapInternalCategory(item.categoryPath, item.name);
    
    // CONDIÇÃO ORIGINAL DA API
    const currentCondition = item.condition || 'New';

    const allTechnicalSpecs = {};
    if (item.details?.length > 0) {
        item.details.forEach(detail => {
            const cleanKey = detail.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
            allTechnicalSpecs[cleanKey] = detail.value;
        });
    }

    const enrichedData = {
        ...allTechnicalSpecs,
        model_number: item.modelNumber?.trim(),
        color: item.color,
        sync_at: new Date().toISOString()
    };

    try {
        const product = await prisma.product.upsert({
            where: { sku: skuStr },
            update: {
                name: item.name,
                salePrice: parseFloat(item.salePrice),
                regularPrice: parseFloat(item.regularPrice || item.salePrice),
                onSale: item.onSale ? "true" : "false",
                brand: item.manufacturer,
                categoryPath: categoryPathStr,
                internalCategory: internalCat,
                rawDetails: enrichedData,
                lastUpdated: new Date(),
                groupId: resolvedGroupId,
                upc: item.upc,
                condition: currentCondition,
                store: "BestBuy",
                onlineAvailability: isAvailable,
                isExpired: !isAvailable 
            },
            create: {
                sku: skuStr,
                name: item.name,
                brand: item.manufacturer,
                salePrice: parseFloat(item.salePrice),
                regularPrice: parseFloat(item.regularPrice || item.salePrice),
                onSale: item.onSale ? "true" : "false",
                categoryPath: categoryPathStr,
                internalCategory: internalCat,
                image: item.image,
                url: item.url,
                condition: currentCondition,
                store: "BestBuy",
                slug: `${slugify(item.name)}-${skuStr}`,
                customerReviewAverage: item.customerReviewAverage,
                customerReviewCount: item.customerReviewCount,
                rawDetails: enrichedData,
                lastUpdated: new Date(),
                groupId: resolvedGroupId,
                upc: item.upc,
                onlineAvailability: isAvailable,
                isExpired: !isAvailable
            }
        });

        const lastHistory = await prisma.priceHistory.findFirst({
            where: { productSku: skuStr },
            orderBy: { capturedAt: 'desc' }
        });

        if (!lastHistory || Number(lastHistory.price) !== Number(item.salePrice)) {
            await prisma.priceHistory.create({
                data: { price: item.salePrice, productSku: skuStr, condition: currentCondition, capturedAt: new Date() }
            });
            process.stdout.write(`📈`);
        } else {
            process.stdout.write(`✅`);
        }

        const internalIdSuffix = `-${product.id}`;
        if (!product.slug.endsWith(internalIdSuffix)) {
            await prisma.product.update({
                where: { id: product.id },
                data: { slug: `${slugify(item.name)}${internalIdSuffix}` }
            });
        }
    } catch (e) { console.error(`\n❌ Erro SKU ${skuStr}:`, e.message); }
}

async function logMissingSkus(skus) {
    const timestamp = new Date().toLocaleString();
    fs.appendFileSync('produtos_nao_encontrados.txt', `[${timestamp}] SKUs sumidos da API: ${skus.join(', ')}\n`);
}

/**
 * LIMPEZA DE SEGURANÇA
 */
async function invalidateOldOffers() {
    console.log(`\n🧹 Iniciando limpeza de segurança (Safety Net)...`);
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - 48); 

    const result = await prisma.product.updateMany({
        where: {
            store: "BestBuy",
            isExpired: false,
            lastUpdated: { lt: threshold }
        },
        data: {
            isExpired: true,
            onlineAvailability: false
        }
    });
    console.log(`\n✅ Limpeza concluída: ${result.count} ofertas antigas marcadas como expiradas.`);
}

/**
 * FUNÇÃO PRINCIPAL
 */
async function syncProducts() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    console.log(`🚀 Sincronização Direta Iniciada: ${new Date().toLocaleString()}`);

    try {
        let currentUpdatedToday = await prisma.product.count({
            where: { lastUpdated: { gte: todayStart }, store: "BestBuy" }
        });

        // --- PASSO 1: ATUALIZAÇÃO ---
        console.log(`\n--- Passo 1: Atualizando itens existentes ---`);
        while (currentUpdatedToday < DAILY_REQUEST_LIMIT) {
            const batchSize = 100; 
            const outdatedProducts = await prisma.product.findMany({
                where: { store: "BestBuy", OR: [{ lastUpdated: { lt: todayStart } }, { lastUpdated: null }] },
                select: { sku: true },
                take: 100, 
                orderBy: { lastUpdated: 'asc' }
            });

            if (outdatedProducts.length === 0) {
                console.log("\n✅ Todos os itens existentes estão em dia.");
                break;
            }

            for (let i = 0; i < outdatedProducts.length; i += batchSize) {
                const batch = outdatedProducts.slice(i, i + batchSize);
                const skuList = batch.map(p => p.sku).join(',');
                const url = `${BBY_BASE_URL}/products(sku in(${skuList}))?apiKey=${BBY_API_KEY}&format=json&pageSize=${batchSize}&show=all`;

                try {
                    const response = await axios.get(url);
                    const apiProducts = response.data.products || [];
                    const foundSkus = apiProducts.map(p => String(p.sku));

                    for (const item of apiProducts) {
                        await processProduct(item);
                    }

                    const missing = batch.map(p => p.sku).filter(s => !foundSkus.includes(s));
                    if (missing.length > 0) {
                        await logMissingSkus(missing);
                        await prisma.product.updateMany({ 
                            where: { sku: { in: missing } }, 
                            data: { 
                                isExpired: true,
                                onlineAvailability: false,
                                lastUpdated: new Date() 
                            } 
                        });
                        process.stdout.write(`👻(${missing.length})`);
                    }

                    await sleep(4000); 
                } catch (err) { 
                    if (err.response?.status === 403) {
                        console.log("\n🛑 403 Detectado. Pausando 61 segundos...");
                        await sleep(61000);
                        i -= batchSize; 
                    } else {
                        console.error(`\n🚨 Erro de conexão ou API:`, err.message);
                        console.log(`Pausando 10 segundos para estabilizar...`);
                        await sleep(10000);
                    }
                }
            }
            currentUpdatedToday = await prisma.product.count({ where: { lastUpdated: { gte: todayStart }, store: "BestBuy" } });
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
                    const products = response.data.products;
                    if (!products || products.length === 0) break;

                    for (const item of products) {
                        const skuStr = String(item.sku);
                        const existsToday = await prisma.product.findFirst({
                            where: { sku: skuStr, lastUpdated: { gte: todayStart } },
                            select: { id: true }
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
                    currentUpdatedToday = await prisma.product.count({ where: { lastUpdated: { gte: todayStart }, store: "BestBuy" } });
                } catch (err) {
                    console.error(`\n❌ Erro na varredura:`, err.message);
                    if (err.response?.status === 403) await sleep(61000);
                    else break;
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
                        const products = response.data.products;
                        if (!products || products.length === 0) break;

                        for (const item of products) {
                            const skuStr = String(item.sku);
                            const existsToday = await prisma.product.findFirst({
                                where: { sku: skuStr, lastUpdated: { gte: todayStart } },
                                select: { id: true }
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
                        currentUpdatedToday = await prisma.product.count({ where: { lastUpdated: { gte: todayStart }, store: "BestBuy" } });
                    } catch (err) {
                        console.error(`\n❌ Erro na categoria ${cat.name}:`, err.message);
                        if (err.response?.status === 403) await sleep(61000);
                        else break;
                    }
                }
            }
        }

    } catch (error) {
        console.error("\n🚨 Erro Crítico:", error.message);
    } finally {
        await invalidateOldOffers();
        await prisma.$disconnect();
        console.log("\n🏁 Sincronização finalizada.");
    }
}

syncProducts();