import { PrismaClient } from "@prisma/client";
import axios from "axios";
import dotenv from "dotenv";
import http from "http";
import https from "https";

dotenv.config();

const prisma = new PrismaClient();

/**
 * CONFIGURAÇÕES DE FLUXO E LIMITES
 */
const BATCH_SIZE = 50;
const LIMITE_REQUISICOES_DIARIO = 1000; 
const DELAY_ENTRE_LOTES_MS = 120000; // 2 minutos para máxima segurança
const TEMPO_ESPERA_EXAUSTAO_MS = 5 * 60 * 1000; // 5 minutos de pausa se todas as chaves falharem

const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

/**
 * CONFIGURAÇÃO DE MULTI-KEYS (GROQ)
 * Adicione no seu .env: GROK_KEY_1, GROK_KEY_2, etc.
 */
const API_KEYS = [
  process.env.GROK_EXPERT_BOT1,
  process.env.GROK_EXPERT_BOT2,
  process.env.GROK_EXPERT_BOT3,
].filter((key) => typeof key === "string" && key.length > 0);

if (API_KEYS.length === 0) {
  console.error("🚨 ERRO CRÍTICO: Nenhuma chave GROK definida no .env!");
  process.exit(1);
}

let currentKeyIndex = 0;
let chavesFalhasSeguidas = 0;
let voltasCompletasSemSucesso = 0;

function getCurrentKey() {
  return API_KEYS[currentKeyIndex];
}

async function getNextKey() {
  if (API_KEYS.length === 0) return null;

  chavesFalhasSeguidas++;
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;

  if (currentKeyIndex === 0) {
    voltasCompletasSemSucesso++;
    console.warn(`\n🔄 Volta completa no carrossel de chaves Groq (${voltasCompletasSemSucesso}/2).`);
  }

  // TRAVA DE EMERGÊNCIA: Se rodou o carrossel 2 vezes e nada, mata o processo.
  if (voltasCompletasSemSucesso >= 2) {
    console.error("🚨 [LIMITE EXCEDIDO] Todas as chaves Groq esgotadas após 2 voltas.");
    await prisma.$disconnect();
    process.exit(0); 
  }

  if (chavesFalhasSeguidas >= API_KEYS.length) {
    console.error(`⚠️ Todas as chaves Groq em RPM. Pausando ${TEMPO_ESPERA_EXAUSTAO_MS / 60000} min...`);
    await new Promise((r) => setTimeout(r, TEMPO_ESPERA_EXAUSTAO_MS));
    chavesFalhasSeguidas = 0; 
  }

  console.log(`🔑 Rotação: Alternando para a Chave Groq #${currentKeyIndex + 1}...`);
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

/**
 * FUNÇÃO DE LIMPEZA CORRIGIDA: FOCO EM PRODUTOS DO EBAY MARCADOS COMO FALSE
 */
async function runCleaner() {
  console.log(`\n🧹 [WORKER 1] Iniciando AI Name Cleaner via Groq (Batch: ${BATCH_SIZE})...`);
  console.log(`🎯 Limite de requisições configurado: ${LIMITE_REQUISICOES_DIARIO}`);

  let requisicoesRealizadas = 0;

  try {
    while (requisicoesRealizadas < LIMITE_REQUISICOES_DIARIO) {
      let apiKeyAtiva = getCurrentKey();
      
      // QUERY ATUALIZADA:
      // 1. Removemos a restrição de UPC Regex (para pegar IDs como 19204 que possuem UPC válido mas nome sujo)
      // 2. Adicionamos o JOIN com a tabela de listagens para focar apenas em produtos que vieram do Ebay
      const productsToProcess = await prisma.$queryRaw`
        SELECT DISTINCT p.id, p.name, p.brand, p.upc
        FROM products p
        INNER JOIN listings l ON l.product_id = p.id
        WHERE p.ai_name_cleaned = false
          AND l.store ILIKE 'Ebay'
          AND p.name IS NOT NULL
          AND TRIM(p.name) != ''
        ORDER BY p.id DESC
        LIMIT ${BATCH_SIZE};
      `;

      if (!productsToProcess || productsToProcess.length === 0) {
        console.log("\n✅ Fila de limpeza concluída. Nenhum produto do Ebay pendente!");
        break;
      }

      console.log(`\n🔄 Lote ${requisicoesRealizadas + 1}: Limpando ${productsToProcess.length} nomes...`);

      const grokPrompt = `You are a Data Engineer specializing in e-commerce data cleansing. Clean and standardize the following product names.
      
      RULES:
      - Remove ALL promotional spam (e.g., "*BLACK FRIDAY*", "READ", "LOT OF", "NEWEST MODEL", "WTY!", "NEW", "SHIP", "PREPAID", "CARRIER NAMES").
      - Remove orphaned punctuation (e.g., ", ,", "( )", " - ").
      - Format as: [BRAND] [SERIES/MODEL] [KEY SPECS]. Convert to UPPERCASE.
      - Return ONLY a valid JSON object where keys are Product IDs and values are cleaned names. Do not use Markdown blocks.

      PRODUCTS TO CLEAN:
      ${JSON.stringify(productsToProcess.map(p => ({ id: p.id, original_name: p.name, brand: p.brand }))) }`;

      try {
        const grokResponse = await axios.post(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: grokPrompt }],
            temperature: 0.1
          },
          {
            headers: { 
              "Content-Type": "application/json", 
              "Authorization": `Bearer ${apiKeyAtiva}` 
            },
            httpAgent, httpsAgent, timeout: 45000
          }
        );

        if (grokResponse.status === 200) {
          chavesFalhasSeguidas = 0;
          voltasCompletasSemSucesso = 0;
        }

        const grokSanitized = sanitizeAiJson(grokResponse.data?.choices?.[0]?.message?.content);

        if (grokSanitized) {
          const cleanedNamesMap = JSON.parse(grokSanitized);
          
          await Promise.all(productsToProcess.map(async (product) => {
            const newName = cleanedNamesMap[product.id];
            
            // Usamos Number(product.id) para garantir compatibilidade com o update do Prisma
            if (newName && newName.length > 5) {
              console.log(`   ✨ [ID: ${product.id}] -> "${newName}"`);
              await prisma.product.update({
                where: { id: Number(product.id) },
                data: { name: newName, aiNameCleaned: true }
              });
            } else {
               // Mesmo que a IA falhe, marcamos como true para tirar da fila do loop
               await prisma.product.update({
                where: { id: Number(product.id) },
                data: { aiNameCleaned: true }
              });
            }
          }));
          
          requisicoesRealizadas++;
          console.log(`✅ Lote finalizado com sucesso. (${requisicoesRealizadas}/${LIMITE_REQUISICOES_DIARIO})`);

        } else {
          console.error("⚠️ Falha ao processar JSON da IA neste lote.");
        }

      } catch (apiError) {
        if (apiError.response && apiError.response.status === 429) {
          console.warn(`⚠️ Rate limit (429) no Groq. Rotacionando chave...`);
          await getNextKey();
          continue; // Tenta o mesmo lote com a nova chave
        } else {
          console.error("🚨 Erro na chamada da API:", apiError.message);
        }
      }

      if (requisicoesRealizadas < LIMITE_REQUISICOES_DIARIO) {
        console.log(`⏳ Aguardando ${DELAY_ENTRE_LOTES_MS / 1000}s para o próximo lote...`);
        await new Promise((r) => setTimeout(r, DELAY_ENTRE_LOTES_MS));
      }
    }
  } catch (error) {
    console.error("🚨 Erro Crítico:", error.message);
  } finally {
    await prisma.$disconnect();
    console.log("🏁 Worker 1 finalizado.");
  }
}

runCleaner();