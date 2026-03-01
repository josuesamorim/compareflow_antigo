// api/product/[slug]/route.js

import { prisma } from "../../../../lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Normaliza condition para uma chave estável (compatível com search/pdp)
 * Retorna sempre em lowercase no padrão:
 * - new
 * - open-box
 * - refurbished
 * - pre-owned
 */
function normalizeConditionKey(condition) {
  const raw = (condition ?? "").toString().trim().toLowerCase();
  if (!raw) return "new";

  if (raw === "new" || raw === "brand new" || raw === "novo") return "new";

  // Open box
  if (raw.includes("open box") || raw.includes("open-box") || raw.includes("openbox") || raw.includes("open_box"))
    return "open-box";

  // Refurb / renewed
  if (raw.includes("refurb") || raw.includes("renewed") || raw.includes("reconditioned") || raw.includes("certified"))
    return "refurbished";

  // Pre-owned / used
  if (raw.includes("pre-owned") || raw.includes("preowned") || raw.includes("used") || raw.includes("seminovo"))
    return "pre-owned";

  return raw.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "new";
}

/**
 * Helper seguro para number
 */
function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET /api/product/[slug]
 *
 * ✅ Consistência Search -> PDP:
 * - aceita ?condition=...&price=... (do clique no card)
 * - seleciona a melhor oferta ativa respeitando a condição solicitada (se existir)
 * - se não houver oferta naquela condição, faz fallback para a melhor oferta global
 * - se não houver ofertas ativas, mantém "Out of Stock" mas ainda retorna specs + imagem (via referenceListing)
 */
export async function GET(request, { params }) {
  try {
    const { searchParams } = new URL(request.url);

    const rawSlug = params?.slug;
    const decodedSlug = decodeURIComponent(rawSlug || "");

    const requestedCondition = normalizeConditionKey(searchParams.get("condition"));
    const requestedPrice = safeNumber(searchParams.get("price"));

    const product = await prisma.product.findFirst({
      where: { slug: { equals: decodedSlug, mode: "insensitive" } },
      include: {
        listings: {
          include: {
            priceHistory: {
              orderBy: { capturedAt: "desc" },
              take: 50,
            },
          },
          orderBy: { salePrice: "asc" },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const listings = Array.isArray(product.listings) ? product.listings : [];

    // Referência para imagem/specs quando não tem estoque
    const referenceListing = listings.find((l) => l?.image && l?.rawDetails) || listings[0] || null;

    // Apenas ofertas ativas e com estoque
    const activeListings = listings.filter((l) => !l?.isExpired && l?.onlineAvailability);

    // Melhor oferta por condição solicitada (se existir), senão menor global
    const bestByRequestedCondition = requestedCondition
      ? activeListings.find((l) => normalizeConditionKey(l?.condition) === requestedCondition)
      : null;

    const bestAny = activeListings[0] || null;

    const selectedOffer = bestByRequestedCondition || bestAny;

    // Preço topo:
    // - oferta selecionada
    // - fallback no price QS (evita flash ao hidratar)
    // - senão 0
    const currentPrice = selectedOffer ? safeNumber(selectedOffer.salePrice) ?? 0 : requestedPrice ?? 0;

    // Consolidação de histórico global (todas as ofertas) com condition (h.condition || l.condition)
    const historyPricesRaw = listings.flatMap((l) =>
      (l.priceHistory || []).map((h) => ({
        price: safeNumber(h.price) ?? 0,
        date: h.capturedAt,
        capturedAt: h.capturedAt,
        store: l.store,
        condition: (h.condition || l.condition || "new").toString(),
        listingId: l.id,
      })),
    );

    // Prioridade specs: product.rawDetails > BestBuy > eBay > referência
    const bestBuyListing = listings.find((l) => (l.store || "").toLowerCase().includes("best"));
    const ebayListing = listings.find((l) => (l.store || "").toLowerCase().includes("ebay"));

    const prioritizedSpecs =
      product.rawDetails ||
      bestBuyListing?.rawDetails ||
      ebayListing?.rawDetails ||
      referenceListing?.rawDetails ||
      {};

    const fullProductData = {
      ...product,

      image: product.image || referenceListing?.image || null,

      lowestPrice: currentPrice,

      selectedCondition: selectedOffer?.condition || (requestedCondition ? requestedCondition : null),
      selectedOfferId: selectedOffer?.id || null,

      priceHistory: historyPricesRaw.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt)),

      rawDetails: prioritizedSpecs,

      offers: activeListings.map((l) => ({
        id: l.id,
        storeName: l.store,
        currentPrice: Number(l.salePrice),
        regularPrice: Number(l.regularPrice),
        affiliateUrl: l.affiliateUrl || l.url,
        condition: l.condition,
        image: l.image,
        isExpired: l.isExpired,
        onlineAvailability: l.onlineAvailability,
        rawDetails: l.rawDetails,
      })),

      salePrice: currentPrice,
      regularPrice: selectedOffer && selectedOffer.regularPrice ? Number(selectedOffer.regularPrice) : currentPrice,
    };

    const finalProductData = JSON.parse(JSON.stringify(fullProductData));

    return NextResponse.json(finalProductData, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("❌ Product API Error:", error);
    return NextResponse.json(
      {
        error: "Product fetch failed",
        ...(process.env.NODE_ENV !== "production"
          ? { message: error?.message || String(error), code: error?.code }
          : {}),
      },
      { status: 500 },
    );
  }
}