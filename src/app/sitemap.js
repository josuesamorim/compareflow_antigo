import { prisma } from "../lib/prisma";

/**
 * CONFIGURAÇÃO DE CACHE DE 1 HORA
 * O Sitemap será revalidado a cada 3600 segundos (1 hora).
 */
export const revalidate = 3600;

/**
 * Helpers (SEO-safe)
 */
function toIsoDate(v) {
  try {
    const d = v ? new Date(v) : new Date();
    const t = d.getTime();
    return Number.isFinite(t) ? d.toISOString() : new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Normaliza slug de categoria sem “inventar” formato.
 * ✅ Preferimos usar o internalCategory como já está no DB (provavelmente já é slug).
 * - Se vier com espaços, normaliza.
 * - Se vier com coisas estranhas, limpa.
 */
function normalizeCategorySlug(input) {
  const raw = (input ?? "").toString().trim();
  if (!raw) return "";

  // Se já estiver no formato slug (contém hífen e sem espaços), apenas sanitiza leve
  const hasSpaces = /\s/.test(raw);

  const base = hasSpaces ? raw.toLowerCase().replace(/\s+/g, "-") : raw.toLowerCase();

  // Mantém apenas [a-z0-9-_] e hífen
  return base.replace(/[^\w-]+/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export default async function sitemap() {
  const baseUrl = "https://www.compareflow.club";

  /**
   * Rotas estáticas importantes (SEO / trust / Merchant compliance)
   * ✅ Incluímos rotas de descoberta (categories, todays-deals) e institucionais.
   * ⚠️ Não adicionamos rotas que você possa querer noindex (ex.: search) sem você pedir.
   */
  const nowIso = new Date().toISOString();

  const staticPages = [
    { url: `${baseUrl}/`, priority: 1.0, changeFrequency: "hourly" },

    // Discovery pages
    { url: `${baseUrl}/categories`, priority: 0.9, changeFrequency: "daily" },
    { url: `${baseUrl}/todays-deals`, priority: 0.95, changeFrequency: "hourly" },
    { url: `${baseUrl}/black-friday`, priority: 0.9, changeFrequency: "daily" },

    // Trust / Compliance pages
    { url: `${baseUrl}/how-it-works`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${baseUrl}/about`, priority: 0.6, changeFrequency: "monthly" },
    { url: `${baseUrl}/contact`, priority: 0.7, changeFrequency: "monthly" },
    { url: `${baseUrl}/privacy`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${baseUrl}/terms`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${baseUrl}/shipping-policy`, priority: 0.5, changeFrequency: "monthly" },
    { url: `${baseUrl}/return-policy`, priority: 0.5, changeFrequency: "monthly" },
  ].map((p) => ({
    ...p,
    lastModified: nowIso,
  }));

  try {
    /**
     * 1) PRODUTOS INDEXÁVEIS
     * ✅ Só entram produtos com ao menos 1 listing ativa, em estoque e com imagem.
     * ✅ lastModified: usa product.lastUpdated (ou now fallback).
     */
    const products = await prisma.product.findMany({
      where: {
        slug: { not: null },
        listings: {
          some: {
            isExpired: false,
            onlineAvailability: true,
            image: { not: null, not: "" },
          },
        },
      },
      select: {
        slug: true,
        lastUpdated: true,
      },
    });

    /**
     * 2) CATEGORIAS INDEXÁVEIS (com “freshness” real)
     * ✅ Em vez de DISTINCT com lastUpdated arbitrário, pegamos MAX(last_updated) por categoria.
     * ✅ Isso dá lastModified melhor para o Google.
     *
     * Observação:
     * - Aqui usamos SQL raw para não depender do comportamento de distinct+select em ORM.
     */
    const categoriesAgg = await prisma.$queryRaw`
      SELECT
        p.internal_category as "internalCategory",
        MAX(p.last_updated) as "lastUpdated"
      FROM products p
      WHERE p.internal_category IS NOT NULL
        AND p.internal_category != ''
        AND EXISTS (
          SELECT 1
          FROM listings l
          WHERE l.product_id = p.id
            AND l.is_expired = false
            AND l.online_availability = true
            -- imagem na listing garante que a categoria não leve para cards vazios
            AND l.image IS NOT NULL
            AND l.image != ''
        )
      GROUP BY p.internal_category
    `;

    // Se o banco retornar vazio, registramos aviso (ajuda debug no log da Vercel)
    if (!products || products.length === 0) {
      console.warn("Aviso: Nenhum produto indexável encontrado para o Sitemap.");
    }

    /**
     * 3) Montagem de entradas de Produtos
     * ✅ encodeURIComponent no slug por segurança (evita quebrar sitemap com caracteres estranhos).
     */
    const productEntries = (products || [])
      .filter((p) => p?.slug)
      .map((p) => ({
        url: `${baseUrl}/product/${encodeURIComponent(String(p.slug))}`,
        lastModified: toIsoDate(p.lastUpdated),
        changeFrequency: "daily",
        priority: 0.8,
      }));

    /**
     * 4) Montagem de entradas de Categorias
     * ✅ Usa internalCategory do DB como base, normaliza só se necessário.
     * ✅ encodeURIComponent para segurança.
     */
    const categoryEntries = (categoriesAgg || [])
      .map((c) => ({
        internalCategory: c?.internalCategory,
        lastUpdated: c?.lastUpdated,
      }))
      .filter((c) => c.internalCategory)
      .map((c) => {
        const normalized = normalizeCategorySlug(c.internalCategory);
        const slug = normalized || normalizeCategorySlug(String(c.internalCategory));
        const safeSlug = encodeURIComponent(slug);

        return {
          url: `${baseUrl}/category/${safeSlug}`,
          lastModified: toIsoDate(c.lastUpdated),
          changeFrequency: "weekly",
          priority: 0.75,
        };
      });

    /**
     * 5) Sitemap final
     * ✅ Ordem pensada para crawlers:
     *   - Home + discovery
     *   - Trust/compliance
     *   - Categories
     *   - Products
     */
    const fullSitemap = [
      ...staticPages,
      ...categoryEntries,
      ...productEntries,
    ];

    return fullSitemap;
  } catch (error) {
    // Esse log aparecerá no painel de monitoramento da Vercel
    console.error("CRITICAL SITEMAP ERROR:", error);

    // Fallback de segurança: nunca quebrar o /sitemap.xml
    return [
      {
        url: baseUrl,
        lastModified: nowIso,
        changeFrequency: "hourly",
        priority: 1.0,
      },
      ...staticPages,
    ];
  }
}