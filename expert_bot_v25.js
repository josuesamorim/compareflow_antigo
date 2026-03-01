import { PrismaClient, Prisma } from "@prisma/client";
import axios from "axios";
import dotenv from "dotenv";
import http from "http";
import https from "https";
import crypto from "crypto";
import { z } from "zod";

dotenv.config();

const prisma = new PrismaClient();

/**
 * CONFIGURAÇÕES DE FLUXO E LIMITES
 */
const REQUISICOES_POR_MINUTO = 0.75;
const INTERVALO_MS = 80000;
const LIMITE_DIARIO = 210;
const MAX_TENTATIVAS_POR_PRODUTO = 2;
const TEMPO_ESPERA_EXAUSTAO_MS = 10 * 60 * 1000;

// Agentes globais com KeepAlive
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// Categorias prioritárias
const PRIORITY_CATEGORIES = [
  "smartphones",
  "gaming-consoles",
  "laptops",
  "monitors",
  "desktops",
];

const ExpertReviewSchema = z.object({
  expert_score: z.number().min(0).max(10),
  confidence_level: z.number().min(0).max(1),
  data_maturity: z.enum(["complete", "partial", "pre_release", "insufficient"]),
  target_competitors: z.array(z.string()),
  intro: z.string().min(10),
  technical_specs_analysis: z.object({
    performance_efficiency: z.string(),
    build_longevity: z.string(),
    operational_impact: z.string(),
  }),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  verdict: z.string(),
});

/**
 * CONFIGURAÇÃO DE MULTI-KEYS
 */
const API_KEYS = [
  process.env.GEMINI_EXPERT_BOT,
  process.env.GEMINI_EXPERT_BOT2,
  process.env.GEMINI_EXPERT_BOT3,
  process.env.GEMINI_EXPERT_BOT4,
  process.env.GEMINI_EXPERT_BOT5,
  process.env.GEMINI_EXPERT_BOT6,
  process.env.GEMINI_EXPERT_BOT7,
  process.env.GEMINI_EXPERT_BOT8,
  process.env.GEMINI_EXPERT_BOT9,
  process.env.GEMINI_EXPERT_BOT10,
].filter((key) => typeof key === "string" && key.length > 0);

if (API_KEYS.length === 0) {
  console.error("🚨 ERRO CRÍTICO: Nenhuma GEMINI_EXPERT_BOT definida no .env!");
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
    console.warn(
      `\n🔄 Volta completa no carrossel de chaves (${voltasCompletasSemSucesso}/2).`
    );
  }

  if (voltasCompletasSemSucesso >= 2) {
    console.error(
      "🚨 [LIMITE DIÁRIO ATINGIDO] Todas as 10 chaves esgotadas após 2 voltas."
    );
    console.log("🏁 Encerrando para poupar minutos do GitHub Actions.");
    await prisma.$disconnect();
    process.exit(0);
  }

  if (chavesFalhasSeguidas >= API_KEYS.length) {
    console.error(
      `⚠️ Todas as chaves em RPM. Pausando ${TEMPO_ESPERA_EXAUSTAO_MS / 60000} min...`
    );
    await new Promise((r) => setTimeout(r, TEMPO_ESPERA_EXAUSTAO_MS));
    chavesFalhasSeguidas = 0;
  }

  console.log(`🔑 Rotação: Alternando para a Chave API #${currentKeyIndex + 1}...`);
  return API_KEYS[currentKeyIndex];
}

/**
 * ORDENA OBJETO RECURSIVAMENTE
 */
function sortObjectKeys(obj) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;

  const sortedObj = {};
  Object.keys(obj)
    .sort()
    .forEach((key) => {
      sortedObj[key] = sortObjectKeys(obj[key]);
    });
  return sortedObj;
}

/**
 * GERA HASH MD5 ESTÁVEL (agora baseado no rawDetails do LISTING)
 */
function generateSpecsHash(rawDetails) {
  if (!rawDetails) return "null_hash";
  const sortedDetails = sortObjectKeys(rawDetails);
  const normalized = JSON.stringify(sortedDetails);
  return crypto.createHash("md5").update(normalized).digest("hex");
}

/**
 * FUNÇÃO DE SANITIZAÇÃO DE JSON ROBUSTA
 */
function sanitizeAiJson(rawText) {
  if (!rawText) return null;

  try {
    const firstBrace = rawText.indexOf("{");
    const lastBrace = rawText.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      console.error("❌ Falha Crítica: A IA não retornou um objeto JSON válido.");
      return null;
    }

    let cleanJson = rawText.substring(firstBrace, lastBrace + 1);

    cleanJson = cleanJson
      .replace(/\\n/g, " ")
      .replace(/(\w|\")\[\d+\]/g, "$1")
      .replace(/,\s*([\]}])/g, "$1")
      .trim();

    return cleanJson;
  } catch (e) {
    console.error("❌ Erro interno na sanitização:", e.message);
    return null;
  }
}

/**
 * EXPERTBOT RUNNER (Schema V25: Product + Listings)
 */
async function runExpertBot() {
  let processadosHoje = 0;
  let tentativasAtuais = 0;
  let ultimoIdProcessado = null;
  let apiKeyAtiva = getCurrentKey();

  console.log("🚀 Iniciando ExpertBot Enterprise (Lifecycle + Loop Protection)...");
  console.log(
    `⏱️ Ritmo Alvo: ${REQUISICOES_POR_MINUTO} produto/min | Janela: ${INTERVALO_MS / 1000}s`
  );

  try {
    while (processadosHoje < LIMITE_DIARIO) {
      const loopStart = Date.now();
      const agora = new Date();

      // Proteção contra processamento redundante imediato
      const limiteChecagemRecente = new Date(agora.getTime() - 60 * 60 * 1000);

      /**
       * Helper: busca 1 produto elegível + 1 listing ativo (melhor candidato)
       */
      const findCandidate = async (usePriority) => {
        return prisma.product.findFirst({
          where: {
            internalCategory: usePriority
              ? { in: PRIORITY_CATEGORIES }
              : { notIn: PRIORITY_CATEGORIES },

            OR: [
              { expertLastChecked: null },
              { expertLastChecked: { lt: limiteChecagemRecente } },
            ],

            AND: [
              {
                OR: [
                  { expertReview: { equals: Prisma.DbNull } },
                  { expertStatus: { in: ["ERROR", "BLOCKED"] } },
                  {
                    expertNeedsRevalidation: true,
                    expertRevalidateAfter: { lte: agora },
                  },
                ],
              },
            ],

            // ✅ No schema novo, “ativo” é definido por LISTING
            listings: {
              some: {
                isExpired: false,
                onlineAvailability: true,
              },
            },
          },
          select: {
            id: true,
            name: true,
            brand: true,
            internalCategory: true,
            expertReview: true,
            expertSpecsHash: true,
            expertStatus: true,
            expertNeedsRevalidation: true,
            expertRevalidateAfter: true,
            expertLastChecked: true,
            // pegamos 1 listing “ativo”
            listings: {
              where: { isExpired: false, onlineAvailability: true },
              select: {
                sku: true,
                store: true,
                condition: true,
                rawDetails: true,
                salePrice: true,
                regularPrice: true,
                url: true,
                affiliateUrl: true,
              },
              orderBy: [
                { salePrice: "asc" },
                { lastUpdated: "desc" },
              ],
              take: 1,
            },
          },
          orderBy: { lastUpdated: "asc" },
        });
      };

      let product = await findCandidate(true);

      if (!product) {
        product = await findCandidate(false);
      }

      if (!product) {
        console.log("\n🏁 Fila de maturidade total (Prioritária + Global) concluída.");
        break;
      }

      const listing = product.listings?.[0] || null;

      // Sem listing ativo, marca e segue (não deveria acontecer por causa do where.listings.some)
      if (!listing) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            expertStatus: "ERROR",
            expertLastChecked: agora,
            expertReview: {
              error: true,
              message: "Product has no active listing (unexpected).",
            },
          },
        });
        processadosHoje++;
        continue;
      }

      const currentHash = generateSpecsHash(listing.rawDetails);
      const reviewData = product.expertReview;

      const possuiRevalidacaoPendente =
        product.expertNeedsRevalidation === true &&
        product.expertRevalidateAfter &&
        product.expertRevalidateAfter <= agora;

      // DECISÃO DE PULAR (Integridade de Dados)
      if (
        !possuiRevalidacaoPendente &&
        product.expertSpecsHash === currentHash &&
        reviewData &&
        !["ERROR", "BLOCKED"].includes(product.expertStatus)
      ) {
        await prisma.product.update({
          where: { id: product.id },
          data: { expertLastChecked: agora },
        });
        continue;
      }

      // GESTÃO DE TENTATIVAS POR PRODUTO
      if (ultimoIdProcessado === product.id) {
        tentativasAtuais++;
        if (tentativasAtuais >= MAX_TENTATIVAS_POR_PRODUTO) {
          console.error(
            `\n⚠️ ID ${product.id} falhou após ${MAX_TENTATIVAS_POR_PRODUTO} tentativas. Movendo para próximo.`
          );
          await prisma.product.update({
            where: { id: product.id },
            data: {
              expertStatus: "ERROR",
              expertReview: {
                error: true,
                message: "Falha técnica persistente em múltiplas chaves",
              },
              expertSpecsHash: currentHash,
              expertLastChecked: agora,
            },
          });
          tentativasAtuais = 0;
          ultimoIdProcessado = null;
          continue;
        }
      } else {
        ultimoIdProcessado = product.id;
        tentativasAtuais = 0;
      }

      console.log(
        `\n[${processadosHoje + 1}/${LIMITE_DIARIO}] 📡 Auditando: ${product.name} (ID: ${product.id}) | Listing SKU: ${listing.sku} | Store: ${listing.store}`
      );

      try {
        const specsText = listing.rawDetails
          ? JSON.stringify(listing.rawDetails).substring(0, 5000)
          : "No specific details provided.";

        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKeyAtiva}`,
          {
            contents: [
              {
                parts: [
                  {
                    text: `Act as a Lead Product Specialist and Technical Auditor. Your mission is to provide a high-value technical analysis to populate a database with standardized, comparable metrics.

CONTEXT: The user has provided VERIFIED data for the North American market. All products provided are REAL. Use your updated 2026 knowledge base to validate specs for established platforms. Do not deny the product's existence or use placeholder language.

PRODUCT: ${product.name}
Brand: ${product.brand}
Specs Provided (VERIFIED): ${specsText}

STRICT ANALYTICAL MANDATE:
1. ABSOLUTE TRUTH & RESEARCH INTEGRITY: Treat 'Specs Provided' as factual. Complement this by using ONLY official manufacturer sites and reputable technical reviews (e.g., Digital Foundry, RTINGs, AnandTech) to incorporate real-world details.

2. INTERNAL AUDIT & SILENT CORRECTION: If you detect discrepancies, inaccuracies, or omissions in the 'Specs Provided' compared to official technical documentation, you MUST correct them silently. Present the verified technical truth as the only reality. DO NOT mention that the provided specs were wrong, do not list input errors in the 'cons', and do not use phrases like "contrary to provided data". Deliver a polished, expert-grade final result.

3. TOTAL ANTI-HALLUCINATION SILENCE: This rule applies to EVERY field. If a specific technical detail is NOT provided in the specs AND cannot be verified by official sources, DO NOT CITE, HINT, OR INVENT IT.

4. MANDATORY NAMING & FLUENCY RULES:
  - The 'intro' and 'verdict' fields MUST start by mentioning the full PRODUCT NAME.
  - Use professional synonyms like 'This system', 'The architecture', 'The unit', or 'This platform'.
  - No marketing adjectives. Use technical nouns and numerical ranges (e.g., "1.5mm travel", "300 nits").

5. CATEGORY-SPECIFIC KPI HIERARCHY:
  - [GAMES]: 1. Target Res/FPS | 2. Engine Tech | 3. Input Latency.
  - [ELECTRONICS/COMPUTING]: 1. SoC-Architecture/Clock | 2. Thermal Efficiency (TDP) | 3. Interface Bandwidth.
  - [APPLIANCES/INDUSTRIAL]: 1. Peak Draw (W) | 2. Lifecycle (MTBF/IP Rating) | 3. Noise/Vibration (dB).
  - [TOOLS/HARDWARE]: 1. Torque/Power Output | 2. Material Grade | 3. Runtime/Duty Cycle.

6. MERIT CALCULATION ALGORITHM:
  - BASE SCORE: 5.0.
  - KPI PERFORMANCE: Add +1.0 for each KPI exceeding segment average; Subtract -1.0 for each KPI below.
  - LEADERSHIP BONUS: Add +1.5 ONLY if 2 or more KPIs exceed segment standards by >15%.

7. DATA MATURITY & CONFIDENCE:
  - Assign "data_maturity": "complete", "partial", "pre_release", or "insufficient".
  - Assign "confidence_level": 0.0 to 1.0.

8. NO PRICING DATA: Do NOT mention prices or currency.

9. VERDICT COHESION: The 'verdict' must be the technical climax starting with the full PRODUCT NAME. Summarize engineering achievements.

IMPORTANT: Return ONLY a valid raw JSON object. Do not include markdown backticks (e.g., no \`\`\`json). Do not include search citations, grounding links, or footnotes like [1] or [2] inside the values. The response must start with '{' and end with '}'.

OUTPUT STRUCTURE (JSON):
{
  "expert_score": number,
  "confidence_level": number,
  "data_maturity": "string",
  "target_competitors": ["Direct Rival Model 1", "Direct Rival Model 2"],
  "intro": "Technical summary starting with [PRODUCT NAME]...",
  "technical_specs_analysis": {
    "performance_efficiency": "Analysis of core KPIs. No speculation.",
    "build_longevity": "Analysis of durability and lifecycle. No speculation.",
    "operational_impact": "Analysis of physical/digital footprint."
  },
  "pros": ["Specific verified technical advantage"],
  "cons": ["Specific verified technical limitation"],
  "verdict": "Technical climax starting with [PRODUCT NAME]... Strictly no price mentions."
}`,
                  },
                ],
              },
            ],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.1 },
          },
          {
            headers: { "Content-Type": "application/json" },
            httpAgent,
            httpsAgent,
            timeout: 100000,
          }
        );

        if (response.status === 200) {
          chavesFalhasSeguidas = 0;
          voltasCompletasSemSucesso = 0;
          console.log("✅ Chave operacional. Resetando contadores de falha.");
        }

        const candidate = response.data?.candidates?.[0];

        if (
          candidate?.finishReason === "SAFETY" ||
          candidate?.finishReason === "OTHER"
        ) {
          console.warn(`🛑 Bloqueado pela Política de Segurança da Google (ID: ${product.id})`);
          await prisma.product.update({
            where: { id: product.id },
            data: {
              expertStatus: "BLOCKED",
              expertReview: { blocked: true, reason: candidate.finishReason },
              expertSpecsHash: currentHash,
              expertLastChecked: agora,
            },
          });
          processadosHoje++;
          continue;
        }

        const rawText = candidate?.content?.parts?.[0]?.text;
        const sanitized = sanitizeAiJson(rawText);

        if (sanitized) {
          try {
            const parsedData = JSON.parse(sanitized);
            const validation = ExpertReviewSchema.safeParse(parsedData);

            if (!validation.success) {
              throw new Error(
                `Zod Validation: ${JSON.stringify(validation.error.format())}`
              );
            }

            const aiResult = validation.data;

            const scoreFinal = Number(
              Math.min(10, Math.max(0, aiResult.expert_score)).toFixed(1)
            );
            const confidenceFinal = Number(
              Math.min(1, Math.max(0, aiResult.confidence_level)).toFixed(2)
            );

            let finalStatus = "VALID";
            let needsRevalidation = false;
            let revalidateAfter = null;

            if (aiResult.data_maturity !== "complete") {
              needsRevalidation = true;
              finalStatus = aiResult.data_maturity.toUpperCase();
              const dias = finalStatus === "PRE_RELEASE" ? 15 : 30;
              const dateTarget = new Date();
              dateTarget.setDate(dateTarget.getDate() + dias);
              revalidateAfter = dateTarget;
            }

            await prisma.product.update({
              where: { id: product.id },
              data: {
                expertScore: new Prisma.Decimal(scoreFinal),
                expertReview: aiResult,
                expertSpecsHash: currentHash,
                expertStatus: finalStatus,
                expertNeedsRevalidation: needsRevalidation,
                expertRevalidateAfter: revalidateAfter,
                expertLastChecked: agora,
                expertLastUpdated: agora,
              },
            });

            processadosHoje++;
            console.log(
              `✅ [${finalStatus}] ID: ${product.id} | Score: ${scoreFinal} | Conf: ${confidenceFinal}`
            );
          } catch (e) {
            console.error(`❌ Erro de Parsing/Schema no ID ${product.id}:`, e.message);
            await prisma.product.update({
              where: { id: product.id },
              data: {
                expertStatus: "ERROR",
                expertLastChecked: agora,
                expertReview: {
                  error: "JSON_PARSING_OR_VALIDATION_FAILED",
                  message: e.message,
                  raw_preview: rawText ? rawText.substring(0, 500) : "empty",
                },
              },
            });
            processadosHoje++;
          }
        } else {
          throw new Error("Resposta da IA não contém um objeto JSON válido.");
        }
      } catch (error) {
        const status = error?.response?.status;
        const errorMsg = error?.message;

        if (status === 429) {
          console.warn(`⚠️ Quota 429 atingida. Rotacionando chave...`);
          apiKeyAtiva = await getNextKey();
          await new Promise((r) => setTimeout(r, 5000));
        } else if (status === 400) {
          console.error(`🚨 Erro 400 (Bad Request) no ID ${product.id}. Verificando payload...`);
          await prisma.product.update({
            where: { id: product.id },
            data: { expertStatus: "ERROR", expertLastChecked: agora },
          });
          processadosHoje++;
        } else {
          console.error(`🌐 Erro de Rede/API no ID ${product.id}: ${errorMsg}`);
          apiKeyAtiva = await getNextKey();
          await new Promise((r) => setTimeout(r, 10000));
        }
      }

      const elapsed = Date.now() - loopStart;
      const waitTime = Math.max(0, INTERVALO_MS - elapsed);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  } catch (error) {
    console.error("🚨 ERRO CRÍTICO NO RUNNER:", error?.message);
  } finally {
    console.log("🔌 Desconectando Prisma Client...");
    await prisma.$disconnect();
  }
}

runExpertBot().catch((err) => {
  console.error("💀 Falha fatal na inicialização:", err);
  process.exit(1);
});