import { PrismaClient } from "@prisma/client";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

// --- CONFIGURAÇÕES DE CREDENCIAIS ---
const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;

// --- CONFIGURAÇÕES DE CONTROLE ---
const MAX_REQUESTS_DAILY = 7000;
const MAX_PRODUCTS_PER_CATEGORY = 100;

/**
 * DICIONÁRIO DE LOJAS OFICIAIS E MAPEAMENTO DE CATEGORIAS DO EBAY
 */
const OFFICIAL_RETAILERS_DICT = {
  best_buy: {
    name: "Best Buy Official Store",
    categoryMap: {
      58058: { q: "laptop", label: "Computers" },
      293: { q: "audio", label: "Consumer Electronics" },
      15032: { q: "phone", label: "Cell Phones" },
      1249: { q: "console", label: "Video Games" },
      11700: { q: "appliance", label: "Home & Garden" },
      625: { q: "camera", label: "Cameras" },
      11071: { q: "tv", label: "Televisions" },
      178893: { q: "smartwatch", label: "Wearable Tech" },
      183067: { q: "vr", label: "Virtual Reality" },
      171485: { q: "tablet", label: "Tablets" },
      9355: { q: "iphone", label: "Cell Phones" },
      139973: { q: "nintendo", label: "Video Games" },
      38583: { q: "playstation", label: "Video Games" },
    },
  },
  adidas_official: {
    name: "adidas",
    categoryMap: {
      15709: { q: "shoes", label: "Men's Shoes" },
      95672: { q: "shoes", label: "Women's Shoes" },
      11450: { q: "clothing", label: "Clothing & Accessories" },
    },
  },
  officialpumastore: {
    name: "PUMA Official Store",
    categoryMap: {
      15709: { q: "sneakers", label: "Men's Shoes" },
      95672: { q: "sneakers", label: "Women's Shoes" },
      11450: { q: "apparel", label: "Clothing & Accessories" },
    },
  },
  reebok_official: {
    name: "Reebok Official Store",
    categoryMap: {
      15709: { q: "shoes", label: "Men's Shoes" },
      95672: { q: "shoes", label: "Women's Shoes" },
      11450: { q: "clothing", label: "Clothing & Accessories" },
    },
  },
  dysonofficial: {
    name: "Dyson Official Store",
    categoryMap: {
      20614: { q: "vacuum", label: "Vacuum Cleaners" },
      177042: { q: "hair", label: "Hair Care" },
      69981: { q: "fan", label: "Heating & Cooling" },
    },
  },
  kitchenaid: {
    name: "KitchenAid Official Store",
    categoryMap: {
      20667: { q: "mixer", label: "Small Kitchen Appliances" },
      20669: { q: "blender", label: "Small Kitchen Appliances" },
      20675: { q: "processor", label: "Small Kitchen Appliances" },
    },
  },
  ankerdirect: {
    name: "Anker Direct Official Store",
    categoryMap: {
      122969: { q: "charger", label: "Power & Cables" },
      112529: { q: "headphones", label: "Audio" },
      14969: { q: "speaker", label: "Audio" },
      48556: { q: "hub", label: "Computer Accessories" },
    },
  },
  acer: {
    name: "Acer Official Store",
    categoryMap: {
      58058: { q: "laptop", label: "Computers" },
      80053: { q: "monitor", label: "Monitors" },
      171957: { q: "desktop", label: "Computers" },
    },
  },
  officialhpstore: {
    name: "HP Official Store",
    categoryMap: {
      58058: { q: "laptop", label: "Computers" },
      171957: { q: "desktop", label: "Computers" },
      80053: { q: "monitor", label: "Monitors" },
      1245: { q: "printer", label: "Printers" },
    },
  },
  bose: {
    name: "Bose Official Store",
    categoryMap: {
      112529: { q: "headphones", label: "Headphones" },
      14969: { q: "speaker", label: "Speakers" },
      122649: { q: "soundbar", label: "Home Audio" },
    },
  },
  dell: {
    name: "Dell Official Store",
    categoryMap: {
      58058: { q: "laptop", label: "Computers" },
      171957: { q: "desktop", label: "Computers" },
      80053: { q: "monitor", label: "Monitors" },
      175672: { q: "alienware", label: "Gaming Computers" },
    },
  },
  irobot: {
    name: "iRobot Official Store",
    categoryMap: {
      20614: { q: "roomba", label: "Vacuum Cleaners" },
      43526: { q: "braava", label: "Vacuum Accessories" },
    },
  },
  worxtools: {
    name: "WORX Official Store",
    categoryMap: {
      42230: { q: "tool", label: "Power Tools" },
      71256: { q: "mower", label: "Outdoor Power Equipment" },
      122827: { q: "trimmer", label: "Outdoor Power Equipment" },
    },
  },
  cuisinart: {
    name: "Cuisinart Official Store",
    categoryMap: {
      20667: { q: "appliance", label: "Small Kitchen Appliances" },
      20682: { q: "coffee", label: "Small Kitchen Appliances" },
      20633: { q: "cookware", label: "Cookware" },
    },
  },
  "hasbro-toy-shop": {
    name: "Hasbro Toy Shop Official Store",
    categoryMap: {
      220: { q: "toy", label: "Toys" },
      246: { q: "figure", label: "Action Figures" },
      233: { q: "game", label: "Board Games" },
    },
  },
  lenovo: {
    name: "Lenovo Official Store",
    categoryMap: {
      58058: { q: "laptop", label: "Computers" },
      171957: { q: "desktop", label: "Computers" },
      171485: { q: "tablet", label: "Tablets" },
      80053: { q: "monitor", label: "Monitors" },
    },
  },
  "tcl-official-store": {
    name: "TCL Official Store",
    categoryMap: {
      11071: { q: "tv", label: "Televisions" },
      122649: { q: "soundbar", label: "Home Audio" },
      15032: { q: "phone", label: "Cell Phones" },
    },
  },
  logitech: {
    name: "Logitech Official Store",
    categoryMap: {
      23895: { q: "mouse", label: "Computer Accessories" },
      33963: { q: "keyboard", label: "Computer Accessories" },
      112529: { q: "headset", label: "Audio" },
      4616: { q: "webcam", label: "Computer Accessories" },
    },
  },
  secondipity: {
    name: "Secondipity Official Store",
    categoryMap: {
      112529: { q: "sony headphones", label: "Audio" },
      14969: { q: "speaker", label: "Audio" },
      11071: { q: "tv", label: "Televisions" },
      58058: { q: "laptop", label: "Computers" },
    },
  },
  "ninja-kitchen": {
    name: "Ninja Kitchen Official Store",
    categoryMap: {
      20667: { q: "air fryer", label: "Small Kitchen Appliances" },
      20669: { q: "blender", label: "Small Kitchen Appliances" },
      20682: { q: "coffee", label: "Small Kitchen Appliances" },
    },
  },
  "shark-clean": {
    name: "Shark Clean Official Store",
    categoryMap: {
      20614: { q: "vacuum", label: "Vacuum Cleaners" },
      43526: { q: "mop", label: "Vacuum Accessories" },
      177042: { q: "hair", label: "Hair Care" },
    },
  },
};

const OFFICIAL_STORES = Object.keys(OFFICIAL_RETAILERS_DICT);

/**
 * DICIONÁRIO EXPANDIDO DE INFERÊNCIA DE MARCAS
 * Se o eBay não fornecer a marca, o script procurará por essas palavras-chave no título de forma robusta.
 */
const BRAND_INFERENCE_DICT = {
  NINTENDO: [
    "NINTENDO",
    "ZELDA",
    "MARIO",
    "DONKEY KONG",
    "SPLATOON",
    "LUIGI",
    "POKEMON",
    "ANIMAL CROSSING",
    "METROID",
    "KIRBY",
    "SUPER SMASH BROS",
  ],
  SONY: ["PLAYSTATION", " PS5 ", " PS4 ", "DUALSENSE", "DUALSHOCK", "SONY"],
  MICROSOFT: ["XBOX", "XBOX ONE", "XBOX SERIES", "SURFACE", "MICROSOFT"],
  APPLE: [
    "IPHONE",
    "IPAD",
    "MACBOOK",
    "APPLE WATCH",
    "AIRPODS",
    "IMAC",
    "APPLE TV",
    "AIRTAG",
    "APPLE",
  ],
  SAMSUNG: ["GALAXY", "SAMSUNG", "QLED", "NEO QLED"],
  HP: ["HP", "ENVY", "SPECTRE", "OMEN", "PAVILION", "HEWLETT PACKARD"],
  LENOVO: ["LENOVO", "THINKPAD", "YOGA", "IDEAPAD", "LEGION"],
  ASUS: ["ASUS", "ROG ", "ZENBOOK", "VIVOBOOK", "TUF GAMING"],
  DELL: ["DELL", "ALIENWARE", "INSPIRON", "XPS", "LATITUDE"],
  ACER: ["ACER", "PREDATOR", "NITRO", "ASPIRE"],
  LG: [" LG ", "OLED TV", "LG NANOCELL", "ULTRAGEAR"],
  LIVELY: ["LIVELY", "JITTERBUG"],
  GE: [" GE ", "XWFE", "GENERAL ELECTRIC"],
  MOTOROLA: ["MOTOROLA", "MOTO G", "MOTO EDGE"],
  GOOGLE: ["GOOGLE", "PIXEL", "NEST HUB", "CHROMECAST"],
  GARMIN: ["GARMIN", "FORERUNNER", "FENIX", "VENU"],
  BEATS: ["BEATS", "POWERBEATS", "STUDIO BUDS"],
  JBL: [" JBL ", "FLIP 5", "FLIP 6", "CHARGE 5", "CHARGE 4", "BOOMBOX"],
  BOSE: ["BOSE", "QUIETCOMFORT", "SOUNDLINK"],
  NINJA: ["NINJA", "FOODI"],
  SHARK: ["SHARK", "ROTATOR", "NAVIGATOR", "STRATOS"],
  DYSON: ["DYSON", "SUPERSONIC", "AIRWRAP", "V8", "V10", "V11", "V12", "V15"],
  KITCHENAID: ["KITCHENAID", "ARTISAN"],
  CUISINART: ["CUISINART"],
  IROBOT: ["IROBOT", "ROOMBA", "BRAAVA"],
  LOGITECH: ["LOGITECH", "MX MASTER", "MX KEYS", "LIGHTSPEED"],
  CORSAIR: ["CORSAIR"],
  RAZER: ["RAZER", "BLACKWIDOW", "DEATHADDER", "KRAKEN", "VIPER"],
  MSI: [" MSI ", "OPTIX", "KATANA", "STEALTH", "RAIDER"],
  TCL: [" TCL ", "ALCATEL"],
  HISENSE: ["HISENSE"],
  VIZIO: ["VIZIO"],
  PANASONIC: ["PANASONIC", "LUMIX"],
  PHILIPS: ["PHILIPS", "HUE", "SONICARE", "NORELCO"],
  ANKER: ["ANKER", "SOUNDCORE", "EUFY", "NEBULA"],
  DJI: [" DJI ", "MAVIC", "MINI 2", "MINI 3", "MINI 4", "OSMO", "RONIN"],
  GOPRO: ["GOPRO", "HERO9", "HERO10", "HERO11", "HERO12", "HERO13"],
  CANON: ["CANON", "EOS", "POWERSHOT", "PIXMA"],
  NIKON: ["NIKON", "COOLPIX"],
  EPSON: ["EPSON", "ECOTANK"],
  BROTHER: ["BROTHER", "LASER PRINTER"],
  WD: ["WESTERN DIGITAL", " WD ", "MY PASSPORT", "WD_BLACK", "WD BLACK"],
  SEAGATE: ["SEAGATE", "BARRACUDA", "FIRECUDA"],
  SANDISK: ["SANDISK", "EXTREME PRO"],
  CRUCIAL: ["CRUCIAL"],
  KINGSTON: ["KINGSTON", "HYPERX"],
  META: [" META ", "QUEST 2", "QUEST 3", "OCULUS"],
  "AUDIO-TECHNICA": ["AUDIO-TECHNICA", "AUDIO TECHNICA"],
  SENNHEISER: ["SENNHEISER"],
  YAMAHA: ["YAMAHA"],
  PIONEER: ["PIONEER"],
  "TP-LINK": ["TP-LINK", "TPLINK", "DECO", "ARCHER"],
  NETGEAR: ["NETGEAR", "NIGHTHAWK", "ORBI"],
  BELKIN: ["BELKIN"],
  ADIDAS: ["ADIDAS", "YEEZY"],
  PUMA: ["PUMA"],
  REEBOK: ["REEBOK"],
  NIKE: ["NIKE", "AIR MAX", "JORDAN"],
  "UNDER ARMOUR": ["UNDER ARMOUR", "CURRY"],
  HASBRO: ["HASBRO", "NERF", "PLAY-DOH", "MONOPOLY", "TRANSFORMERS"],
  MATTEL: ["MATTEL", "BARBIE", "HOT WHEELS", "FISHER-PRICE"],
  LEGO: ["LEGO"],
  BANDAI: ["BANDAI"],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let totalRequestsPerformed = 0;

/**
 * FUNÇÃO CAÇA-ZUMBIS (EXPIRE ZOMBIES)
 * Identifica e inativa ofertas do eBay que não foram vistas nas últimas buscas.
 * Se uma oferta não foi atualizada nas últimas 24 horas, significa que o produto
 * esgotou, o anúncio foi pausado ou removido pelo vendedor.
 */
async function expireZombies() {
  try {
    console.log("\n🧟 Iniciando varredura de ofertas zumbis do eBay...");

    // Define o limite de tempo (24 horas atrás)
    // Qualquer oferta do eBay que não foi atualizada após esse horário virou zumbi
    const zombieThreshold = new Date();
    zombieThreshold.setHours(zombieThreshold.getHours() - 24);

    // Executa a atualização em massa no banco de dados
    const result = await prisma.listing.updateMany({
      where: {
        store: "Ebay",
        lastUpdated: {
          lt: zombieThreshold, // lt = less than (data mais antiga que 24h atrás)
        },
        isExpired: false, // Pega apenas os que ainda constam como ativos no sistema
      },
      data: {
        isExpired: true,
        onlineAvailability: false,
      },
    });

    if (result.count > 0) {
      console.log(
        `✅ Sucesso: ${result.count} ofertas zumbis do eBay foram marcadas como esgotadas.`,
      );
    } else {
      console.log(
        `✅ Nenhum zumbi encontrado. Todas as ofertas do eBay estão atualizadas.`,
      );
    }
  } catch (error) {
    console.error("❌ Erro ao inativar ofertas zumbis:", error.message);
  }
}

/**
 * FUNÇÃO DE LIMPEZA DE ÓRFÃOS
 * Executa a query SQL para deletar produtos que não possuem mais listings (ofertas) ativas.
 * Pode ser chamada no final da sua função principal (syncEbayOfficialStores).
 */
async function cleanOrphanedProducts() {
  try {
    console.log(
      "\n🧹 Iniciando limpeza de produtos órfãos no banco de dados...",
    );

    // Executa a query SQL crua exatamente como você solicitou
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
 * TRAVAS DE SEGURANÇA E AUXILIARES
 */
async function handleRateLimit(error) {
  if (error.response && error.response.status === 429) {
    console.error(
      "\n🛑 CRITICAL: Erro 429 (Too Many Requests) detectado! Iniciando protocolo de emergência...",
    );

    // 1. Passa a vassoura nos órfãos
    await cleanOrphanedProducts();

    // 2. Desconecta do banco de dados com segurança
    await prisma.$disconnect();

    console.error("🛑 Script abortado com segurança.");
    // 3. Puxa a tomada
    process.exit(1);
  }
}

/**
 * GERA SLUG NO MODELO PROFISSIONAL: nome-do-produto-hashCurto
 */
function generateProfessionalSlug(name, technicalId, brand) {
  const cleanName = name
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

function normalizeCondition(condition) {
  if (!condition) return "NEW";
  const c = condition.toString().toUpperCase();
  if (c.includes("NEW") || c.includes("1000")) return "NEW";
  if (c.includes("REFURBISHED") || c.includes("2000") || c.includes("2500"))
    return "REFURBISHED";
  if (c.includes("USED") || c.includes("PRE-OWNED") || c.includes("PREOWNED") || c.includes("3000"))
    return "REFURBISHED"; 
  return "NEW";
}

function hasMultipleStorageVariations(title) {
  const upperTitle = title.toUpperCase();
  const storagePatterns = [
    /\b64\s?GB\b/g,
    /\b128\s?GB\b/g,
    /\b256\s?GB\b/g,
    /\b512\s?GB\b/g,
    /\b1\s?TB\b/g,
  ];
  let matchesFound = 0;
  storagePatterns.forEach((pattern) => {
    pattern.lastIndex = 0;
    if (pattern.test(upperTitle)) matchesFound++;
  });
  return matchesFound >= 2;
}

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
  if (junkValues.includes(cleanId.toLowerCase())) return null;
  if (/[^\x00-\x7F]/.test(cleanId)) return null;
  if (cleanId.length < 3) return null;
  return cleanId;
}

function sanitizeBrand(brand) {
  if (!brand) return null;
  const junkValues = [
    "does not apply", "null", "n/a", "none", "nan", "undefined", 
    "unbranded", "unknown", "generic", "various", "brand", "na", "nd"
  ];
  const cleanBrand = brand.toString().trim();
  if (!cleanBrand) return null;
  if (junkValues.includes(cleanBrand.toLowerCase())) return null;
  // Aceita 2 letras para salvar HP, LG, GE, etc.
  if (cleanBrand.length < 2) return null; 
  return cleanBrand;
}

/**
 * LIMPEZA SEMÂNTICA DE ALTA PRECISÃO E TRAVA CONTRA PREFIXOS LIXO
 * Remove prefixos de condição, formata o nome e evita repetição da marca.
 */
function cleanSemanticName(title, brand) {
  if (!title) return "PRODUCT";

  // 1. Remove Emojis e Símbolos de marca logo de cara
  let clean = title.replace(
    /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
    "",
  );
  clean = clean.replace(/®|™/g, "");

  // 2. Filtros de ruído específicos - INCLUINDO "NEW" E "USED" NO INÍCIO DO TÍTULO
  const noiseFilters = [
    /\b(?:Refurbished|Certified|New|Sealed|Open Box|Factory|Unlocked|Locked|Excellent|Geek Squad)\b/gi,
    /\b(?:High Quality|Best Price|Clearance|Warranty|Free Shipping|HOT!|DEAL!)\b/gi,
    /OPEN-BOX\s?[:\-]?/gi,
    /^\s*NEW\s*-\s*/gi, // Trava de segurança extra para garantir que a palavra NEW seja removida do início
    /^\s*USED\s*-\s*/gi,
    /^\s*REFURBISHED\s*-\s*/gi,
    /\(\s*\)/g, // Remove parênteses vazios tipo ( )
    /\.\.\./g, // Remove reticências no final do título
    /\[.*?\]/g,
  ];

  noiseFilters.forEach((regex) => {
    clean = clean.replace(regex, " ");
  });

  // Lógica de Marca: TRAVA DE SEGURANÇA MÁXIMA
  // Ignora terminantemente palavras que representam ausência de marca ou lixo (nem "BRAND", nem "VARIOUS" entrarão no título)
  const isGenericBrand =
    /^(various|brand|multibrand|generic|unbranded|unknown|does not apply|null|n\/a|na)$/i.test(
      brand ? brand.trim() : "",
    );
  const brandName = brand && !isGenericBrand ? brand.trim().toUpperCase() : "";

  // 3. Lógica Anti-Repetição (apenas se houver marca válida)
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

  // 4. Limpeza de bordas (tira hífens extras gerados pela limpeza)
  clean = clean.replace(/^[:\s\-\|]+|[:\s\-\|]+$/g, "").trim();

  // 5. Formatação Final: MARCA - NOME ou apenas NOME (se não houver marca válida)
  const finalName = brandName
    ? `${brandName} - ${clean.toUpperCase()}`
    : clean.toUpperCase();

  // Remove espaços duplos criados pelos replaces
  return finalName.replace(/\s+/g, " ").trim().substring(0, 190);
}

/**
 * MAPPER V25 - Estrutura Plana e Padronizada
 */
function mapEbayToPriceLab(ebayRaw, sellerUsername) {
  const flatSpecs = {};
  if (Array.isArray(ebayRaw.localizedAspects)) {
    ebayRaw.localizedAspects.forEach((aspect) => {
      let key = aspect.name
        .toLowerCase()
        .replace(/ /g, "_")
        .replace(/[^a-z0-9_]/g, "");
      if (key === "model") key = "model_number";
      if (key === "main_color" || key === "colour") key = "color";
      flatSpecs[key] = aspect.value;
    });
  }

  flatSpecs.gtin = ebayRaw.gtin || null;
  flatSpecs.seller_username = sellerUsername;
  flatSpecs.seller_friendly_name =
    OFFICIAL_RETAILERS_DICT[sellerUsername]?.name || "Ebay Verified Seller";
  flatSpecs.sync_at = new Date().toISOString();

  return flatSpecs;
}

/**
 * OBTENÇÃO DE TOKEN
 */
async function getEbayAccessToken() {
  const authHeader = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString(
    "base64",
  );
  try {
    const response = await axios.post(
      "https://api.ebay.com/identity/v1/oauth2/token",
      "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authHeader}`,
        },
      },
    );
    totalRequestsPerformed++;
    return response.data.access_token;
  } catch (error) {
    await handleRateLimit(error);
    console.error("❌ Erro Auth:", error.response?.data || error.message);
    throw new Error("Falha na autenticação.");
  }
}

/**
 * FUNÇÃO PRINCIPAL DE SINCRONIZAÇÃO
 */
async function syncEbayOfficialStores() {
  try {
    const EBAY_TOKEN = await getEbayAccessToken();
    console.log("🚀 Iniciando Sincronização Segura e Resiliente (USA)...");

    const ebayHeaders = {
      Authorization: `Bearer ${EBAY_TOKEN}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "Content-Type": "application/json",
    };

    for (const seller of OFFICIAL_STORES) {
      const storeData = OFFICIAL_RETAILERS_DICT[seller];
      console.log(`\n🏪 Loja: ${storeData.name}`);

      const categories = Object.keys(storeData.categoryMap);

      for (const catId of categories) {
        if (totalRequestsPerformed >= MAX_REQUESTS_DAILY) {
          console.warn("🏁 Limite diário de requisições atingido.");
          return;
        }

        const catConfig = storeData.categoryMap[catId];
        console.log(
          `   📂 Categoria: ${catConfig.label} (ID: ${catId}) | Busca: "${catConfig.q}"`,
        );

        const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(catConfig.q)}&category_ids=${catId}&filter=sellers:{${seller}},buyingOptions:{FIXED_PRICE}&limit=${MAX_PRODUCTS_PER_CATEGORY}`;

        try {
          const searchResponse = await axios.get(url, { headers: ebayHeaders });
          totalRequestsPerformed++;

          const items = searchResponse.data.itemSummaries || [];
          if (items.length === 0) continue;

          for (const summary of items) {
            try {
              if (hasMultipleStorageVariations(summary.title)) continue;
              if (summary.itemId.startsWith("EBAY-")) continue;

              await sleep(700);

              const detailResponse = await axios.get(
                `https://api.ebay.com/buy/browse/v1/item/${summary.itemId}`,
                { headers: ebayHeaders },
              );
              totalRequestsPerformed++;
              const item = detailResponse.data;

              // --- LOGICA DE CAPTURA DE MARCA AVANÇADA + INFERÊNCIA COM DICIONÁRIO ---
              let capturedBrand = sanitizeBrand(item.brand);

              if (!capturedBrand && Array.isArray(item.localizedAspects)) {
                const brandAspect = item.localizedAspects.find(
                  (a) =>
                    a.name.toLowerCase() === "brand" ||
                    a.name.toLowerCase() === "publisher",
                );
                if (brandAspect)
                  capturedBrand = sanitizeBrand(brandAspect.value);
              }

              // INFERÊNCIA INTELIGENTE BASEADA NO DICIONÁRIO
              if (
                !capturedBrand ||
                /various|multibrand|generic|unbranded|unknown/i.test(
                  capturedBrand,
                )
              ) {
                const titleUpper = item.title.toUpperCase();
                let inferredBrand = null;

                for (const [brandKey, keywords] of Object.entries(
                  BRAND_INFERENCE_DICT,
                )) {
                  if (keywords.some((kw) => titleUpper.includes(kw))) {
                    inferredBrand = brandKey;
                    break; // Achou a marca, sai da busca
                  }
                }

                if (inferredBrand) {
                  capturedBrand = inferredBrand;
                }
              }

            // CORREÇÃO: O fallback aqui é salvar 'VARIOUS' no DB, e a função cleanSemanticName agora é instruída a JAMAIS usá-lo no título.
              const brand = capturedBrand || "VARIOUS";

              // --- DEFINIÇÃO DO IDENTIFICADOR TÉCNICO LIMPO ---
              // Prioridade: GTIN/UPC Mundial > Modelo (Aspects) > Fallback ItemId
              let technicalId = sanitizeIdentifier(item.gtin) || sanitizeIdentifier(item.upc);
              
              if (!technicalId && Array.isArray(item.localizedAspects)) {
                  const modelAspect = item.localizedAspects.find(a => 
                    ["mpn", "model number", "model", "part number"].includes(a.name.toLowerCase())
                  );
                  if (modelAspect) technicalId = sanitizeIdentifier(modelAspect.value);
              }
              
              if (!technicalId) technicalId = item.itemId;

              // Constroi o nome. A trava interna garante que lixo não passará.
              const finalDisplayName = cleanSemanticName(item.title, brand);

              // --- INÍCIO DA LÓGICA DE SLUG IMUTÁVEL E ÂNCORA TÉCNICA ---
              // Removido o prefixo "universal-upc-". A âncora é o dado técnico PURO.
              const modelKey = technicalId; 
              
              // Verifica se o technicalId é um código numérico (UPC/EAN) e não um ID de anúncio do eBay
              const isGlobalId = technicalId && !technicalId.startsWith('v1|') && /^\d+$/.test(technicalId);

              // 1. Busca o produto pela hierarquia de confiança
              let existingProduct = null;

              // A. Busca prioritária pelo campo UPC direto (Se for um código global)
              if (isGlobalId) {
                  existingProduct = await prisma.product.findFirst({
                      where: { upc: technicalId },
                      select: { id: true, slug: true, aiNameCleaned: true }
                  });
              }

              // B. Busca de fallback pela normalizedModelKey (Para modelos ou IDs específicos)
              if (!existingProduct) {
                  existingProduct = await prisma.product.findFirst({
                      where: { normalizedModelKey: modelKey },
                      select: { id: true, slug: true, aiNameCleaned: true }
                  });
              }

              let product;

              if (existingProduct) {
                // 2. O PRODUTO JÁ EXISTE: Vamos apenas ATUALIZAR
                const updateData = {
                  lastUpdated: new Date(),
                  internalCategory: catConfig.label,
                };

                // Atualiza Nome e Marca (se não estiver protegido pela IA)
                // NOTA CRÍTICA: O campo 'slug' NÃO está aqui. Ele fica blindado e imutável!
                if (existingProduct.aiNameCleaned === false) {
                  updateData.name = finalDisplayName;
                  updateData.brand = brand.toUpperCase();
                }

                product = await prisma.product.update({
                  where: { id: existingProduct.id },
                  data: updateData,
                });
              } else {
                // 3. O PRODUTO É NOVO: Vamos CRIAR e batizar o slug pela primeira e única vez
                // Geração de Slug com HASH curto no lugar do UPC, visando segurança contra scraping
                const initialSlug = generateProfessionalSlug(
  finalDisplayName,
  technicalId,
  brand
);
                product = await prisma.product.create({
                  data: {
                    name: finalDisplayName,
                    brand: brand.toUpperCase(),
                    // Salva de forma organizada: Se for código global vai pro UPC, senão vai apenas pra Key
                    upc: isGlobalId ? technicalId : null,
                    normalizedModelKey: modelKey,
                    slug: initialSlug, // O slug com hash nasce aqui e fica cravado no banco
                    internalCategory: catConfig.label,
                    aiNameCleaned: false
                  },
                });
              }
              // --- FIM DA LÓGICA DO PRODUTO ---

              // Upsert do Listing (A condição é capturada corretamente no campo apropriado)
              const salePrice = parseFloat(item.price.value);
              const cleanCond = normalizeCondition(item.condition);
              const avail = item.estimatedAvailabilities?.[0];
              const isAvailable = avail
                ? avail.estimatedAvailabilityStatus === "IN_STOCK"
                : true;

              const listing = await prisma.listing.upsert({
                where: { sku: item.itemId },
                update: {
                  productId: product.id, // <-- CORREÇÃO ESSENCIAL: Atualiza a FK para o produto certo sempre
                  salePrice,
                  lastUpdated: new Date(),
                  isExpired: false,
                  onlineAvailability: isAvailable,
                  condition: cleanCond, // Salva o status "NEW", "USED" etc.
                  rawDetails: mapEbayToPriceLab(item, seller),
                },
                create: {
                  sku: item.itemId,
                  productId: product.id,
                  store: "Ebay",
                  url: item.itemWebUrl,
                  image: item.image?.imageUrl,
                  condition: cleanCond, // Salva o status "NEW", "USED" etc.
                  salePrice,
                  regularPrice: item.marketingPrice?.originalPrice?.value
                    ? parseFloat(item.marketingPrice.originalPrice.value)
                    : salePrice,
                  onSale: !!item.marketingPrice,
                  onlineAvailability: isAvailable,
                  isExpired: false,
                  rawDetails: mapEbayToPriceLab(item, seller),
                },
              });

              // Histórico de Preços
              const lastHistory = await prisma.priceHistory.findFirst({
                where: { listingId: listing.id },
                orderBy: { capturedAt: "desc" },
              });

              if (!lastHistory || parseFloat(lastHistory.price) !== salePrice) {
                await prisma.priceHistory.create({
                  data: {
                    listingId: listing.id,
                    price: salePrice,
                    condition: cleanCond,
                  },
                });
              }

              const statusTag = existingProduct?.aiNameCleaned
                ? "🛡️ [PROTEGIDO]"
                : "✨ [OK]";
              console.log(
                `      ${statusTag}: ${product.slug.substring(0, 40)}... - $${salePrice}`,
              );
            } catch (error) {
              await handleRateLimit(error);
              if (error.response?.status === 404) {
                await prisma.listing.updateMany({
                  where: { sku: summary.itemId },
                  data: { isExpired: true },
                });
              }
              console.error(
                `      ⚠️ Erro no item ${summary.itemId}:`,
                error.message,
              );
            }
          }
        } catch (error) {
          await handleRateLimit(error);
          console.error(`   ❌ Erro na categoria ${catId}:`, error.message);
        }
        await sleep(1500);
      }
      await sleep(3000);
    }
    console.log("\n✅ Sincronização Finalizada com Sucesso.");
  } catch (error) {
    handleRateLimit(error);
    console.error("❌ Erro Crítico:", error.message);
  } finally {
    await expireZombies();
    await cleanOrphanedProducts();
    await prisma.$disconnect();
  }
}

syncEbayOfficialStores();
