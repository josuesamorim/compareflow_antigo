import { PrismaClient } from "@prisma/client";
import axios from "axios";
import dotenv from "dotenv";
import http from "http";
import https from "https";
import { z } from "zod";

dotenv.config();

const prisma = new PrismaClient();
const INTERVALO_MS = 60000; 
const TEMPO_ESPERA_EXAUSTAO_MS = 2 * 60 * 1000;
const BATCH_SIZE = 50; 
const LIMITE_DIARIO = 1000; 

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// Added 'color' to the schema to store the detected variant
const UpcResultSchema = z.object({
  upc: z.string().nullable(),
  color: z.string().nullable(),
  confidence_level: z.enum(["HIGH", "MEDIUM", "LOW", "NONE"]),
  search_notes: z.string(),
});

const API_KEYS = [
  process.env.GEMINI_EXPERT_BOT,
  process.env.GEMINI_EXPERT_BOT7
].filter(Boolean);

let currentKeyIndex = 0;
let chavesFalhasSeguidas = 0;
let voltasCompletasSemSucesso = 0;

async function getNextKey() {
  if (API_KEYS.length === 0) return null;
  chavesFalhasSeguidas++;
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;

  if (currentKeyIndex === 0) {
    voltasCompletasSemSucesso++;
    console.warn(`\n🔄 Key carousel complete rotation (${voltasCompletasSemSucesso}/2).`);
  }

  if (voltasCompletasSemSucesso >= 2) {
    console.error("🚨 [DAILY LIMIT REACHED] All keys exhausted after 2 rotations.");
    await prisma.$disconnect();
    process.exit(0); 
  }

  if (chavesFalhasSeguidas >= API_KEYS.length) {
    console.error(`⚠️ All keys in RPM limit. Pausing for ${TEMPO_ESPERA_EXAUSTAO_MS / 60000} min...`);
    await new Promise((r) => setTimeout(r, TEMPO_ESPERA_EXAUSTAO_MS));
    chavesFalhasSeguidas = 0; 
  }
  
  return API_KEYS[currentKeyIndex];
}

function sanitizeAiJson(rawText) {
  if (!rawText) return null;
  try {
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) return null;
    return rawText.substring(firstBrace, lastBrace + 1)
      .replace(/\\n/g, " ")
      .replace(/,\s*([\]}])/g, "$1")
      .trim();
  } catch (e) {
    return null;
  }
}

function isNumericUpc(upc) {
  if (!upc) return false;
  return /^[0-9]{12,14}$/.test(upc.replace(/\D/g, ''));
}

async function runUpcFetcher() {
  console.log(`🚀 [WORKER 2] Starting Gemini UPC Fetcher (Batch: ${BATCH_SIZE})...`);
  console.log(`🎯 Daily limit configured: ${LIMITE_DIARIO} requests.`);

  let processadosHoje = 0;

  try {
    while (processadosHoje < LIMITE_DIARIO) {
      console.log(`\n🔄 Fetching new batch from DB (Processed today: ${processadosHoje}/${LIMITE_DIARIO})...`);

      const productsToProcess = await prisma.$queryRaw`
        SELECT id, name, brand, upc
        FROM products
        WHERE upc_not_found = false
          AND ai_name_cleaned = true
          AND name IS NOT NULL
          AND (upc IS NULL OR upc !~ '^[0-9]{12,14}$')
        ORDER BY upc_last_checked ASC NULLS FIRST
        LIMIT ${BATCH_SIZE};
      `;

      if (!productsToProcess || productsToProcess.length === 0) {
        console.log("\n✅ No cleaned products needing UPC found! Queue empty.");
        break;
      }

      for (let i = 0; i < productsToProcess.length; i++) {
        if (processadosHoje >= LIMITE_DIARIO) {
          console.log(`\n🛑 Daily limit of ${LIMITE_DIARIO} reached. Stopping batch.`);
          break;
        }

        const product = productsToProcess[i];
        const loopStart = Date.now();
        const agora = new Date();
        let apiKeyAtiva = API_KEYS[currentKeyIndex];

        console.log(`[${i + 1}/${productsToProcess.length}] 📦 Searching: ${product.name} (ID: ${product.id})`);

        // Dynamic search URLs for the AI to prioritize
        const upcSearchUrl = `https://www.upc-search.org/?q=${encodeURIComponent(product.name)}`;
        const productSearchUrl = `https://pt.product-search.net/?q=${encodeURIComponent(product.name)}`;

        const prompt = `You are a Data Engineer specializing in the US E-commerce market. 
        Your task is to find the official 12-14 digit numeric UPC/EAN/GTIN for this product.

        Product: ${product.name}
        Brand: ${product.brand}
        Seller Hint: ${product.upc || "None"}

        INSTRUCTIONS:
        1. PRIORITIZE THESE DATABASES:
           - Check results for: ${upcSearchUrl}
           - Check results for: ${productSearchUrl}
        2. COLOR LOGIC: 
           - If the product name specifies a color, find the UPC for that specific color.
           - If NO color is specified in the name, use "BLACK" as the default and find the corresponding UPC.
        3. FORMATTING: Return ONLY numbers (12-14 digits). No alphanumeric MPNs.
        4. Return ONLY valid JSON:
        {
          "upc": "123456789012" or null,
          "color": "detected_color_or_black",
          "confidence_level": "HIGH", 
          "search_notes": "Found on upc-search.org"
        }`;

        try {
          processadosHoje++; 
          
          const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyAtiva}`,
            {
              contents: [{ parts: [{ text: prompt }] }],
              tools: [{ google_search: {} }],
              generationConfig: { temperature: 0.1 },
            },
            { headers: { "Content-Type": "application/json" }, httpAgent, httpsAgent, timeout: 60000 }
          );

          if (response.status === 200) {
            chavesFalhasSeguidas = 0;
            voltasCompletasSemSucesso = 0;
          }

          const candidate = response.data?.candidates?.[0];
          
          if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "OTHER") {
              await prisma.product.update({ where: { id: product.id }, data: { upcNotFound: true, upcLastChecked: agora } });
              continue;
          }

          const sanitized = sanitizeAiJson(candidate?.content?.parts?.[0]?.text);

          if (sanitized) {
            const result = UpcResultSchema.parse(JSON.parse(sanitized));
            
            if (result.upc && isNumericUpc(result.upc) && ["HIGH", "MEDIUM"].includes(result.confidence_level)) {
              const cleanUpc = result.upc.replace(/\D/g, ''); 
              // We could also save 'result.color' if you add a 'color' column to your Product table
              await prisma.product.update({
                where: { id: product.id },
                data: { 
                  upc: cleanUpc, 
                  upcNotFound: false, 
                  upcLastChecked: agora 
                } 
              });
              console.log(`   ✅ UPC Found: ${cleanUpc} | Color: ${result.color || 'BLACK'} (${result.confidence_level})`);
            } else {
              await prisma.product.update({
                where: { id: product.id },
                data: { upcNotFound: true, upcLastChecked: agora } 
              });
              console.log(`   ⏭️ UPC not found for this product.`);
            }
          }
        } catch (error) {
          if (error?.response?.status === 429) {
            console.warn(`   ⚠️ Rate Limit hit. Rotating key...`);
            await getNextKey();
          } else {
            console.error(`   ❌ Error: ${error.message}`);
            await prisma.product.update({ where: { id: product.id }, data: { upcLastChecked: agora } });
          }
        }

        const elapsed = Date.now() - loopStart;
        const waitTime = Math.max(0, INTERVALO_MS - elapsed);
        
        if (i < productsToProcess.length - 1 && processadosHoje < LIMITE_DIARIO) {
            console.log(`   ⏳ Waiting ${Math.round(waitTime / 1000)}s for next request...\n`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }
  } catch (error) {
    console.error("🚨 GENERAL ERROR:", error);
  } finally {
    await prisma.$disconnect();
    if (processadosHoje >= LIMITE_DIARIO) {
      console.log(`\n🛑 Daily limit of ${LIMITE_DIARIO} reached successfully.`);
    }
    console.log("🏁 Execution UPC Fetcher finished.");
  }
}

runUpcFetcher();