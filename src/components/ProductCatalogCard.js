"use client";

import Link from "next/link";
// O componente Image é essencial para resolver os erros de "Properly size images" e "Serve images in next-gen formats"
import Image from "next/image";
import { useState, useEffect } from "react";

/**
 * COMPONENTE: ProductImage
 * Gerencia o estado de carregamento e erros de imagens externas da Best Buy.
 * CORREÇÃO: Implementação de next/image para otimização automática no servidor.
 */
function ProductImage({ src, alt, condition, priority = false }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // O uso de next/image elimina a necessidade de monitorar o .complete via useRef,
  // pois o componente lida com o ciclo de vida de forma mais eficiente.
  useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [src]);

  const lowerCond = (condition ?? "").toString().trim().toLowerCase();

  // Considera "Used-like" (refurb/open-box/pre-owned/renewed) pra badge no card
  const isUsed = [
    "renewed",
    "refurbished",
    "refurb",
    "open-box",
    "open box",
    "open_box",
    "pre-owned",
    "preowned",
    "used",
    "seller refurbished",
    "certified refurbished",
  ].some((term) => lowerCond.includes(term));

  // Placeholder caso a imagem falhe
  // (mantém externo, mas você pode trocar por "/no-image.png" se preferir 100% local)
  const fallbackSrc = `https://placehold.co/400x400/f8fafc/cbd5e1?text=No+Image`;

  const finalSrc = error ? fallbackSrc : src || fallbackSrc;

  return (
    <div className="relative w-full h-[200px] md:h-[300px] bg-slate-50 rounded-[1.2rem] md:rounded-[2.5rem] flex items-center justify-center p-2 md:p-6 overflow-hidden">
      {/* Skeleton / Pulse effect */}
      {!loaded && !error && <div className="absolute inset-0 bg-slate-100 animate-pulse z-0" />}

      {isUsed && (
        <div className="absolute top-2 left-2 z-20">
          {/* CORREÇÃO CONTRASTE: emerald-700 para garantir ratio AA no Lighthouse */}
          <span className="bg-emerald-700 text-white text-[7px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm">
            {condition}
          </span>
        </div>
      )}

      <Image
        // CORREÇÃO LCP: O Next.js Image converterá o JPG/PNG da Best Buy em WebP automaticamente
        src={finalSrc}
        alt={alt || "Product image"}
        // CORREÇÃO DIMENSÕES: O relatório pediu ~259px. Definimos 300px para garantir nitidez em telas retina.
        width={300}
        height={300}
        // Atributo crucial para resolver "Properly size images"
        sizes="(max-width: 768px) 100vw, 300px"
        // onLoad funciona, mas o callback oficial é onLoadingComplete (dispara de forma mais consistente)
        onLoadingComplete={() => setLoaded(true)}
        onError={() => {
          console.warn(`Erro ao carregar imagem: ${src}`);
          setError(true);
          setLoaded(true);
        }}
        className={`h-full w-full object-contain transition-all duration-700 ${
          loaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } group-hover:scale-105 z-10`}
        // Melhora a prioridade de carregamento conforme sugerido pelo relatório
        priority={priority}
        // Atributo técnico para ajudar o navegador no agendamento da renderização
        decoding="async"
      />
    </div>
  );
}

/**
 * Normaliza condition para uma chave estável (pra viagem via querystring)
 * Mantém compatibilidade com seu filtro: new/refurbished/open-box/pre-owned/renewed etc.
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

  // fallback: vira slug
  return raw.replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "new";
}

/**
 * COMPONENTE: ProductCard
 * Card principal de produto com suporte a SEO e Acessibilidade.
 */
export default function ProductCatalogCard({ product, priority = false }) {
  // Garantir que os preços sejam números válidos
  const sPrice = Number(product?.salePrice ?? product?.saleprice ?? 0);
  const rPrice = Number(product?.regularPrice ?? product?.regularprice ?? 0);
  const hasDiscount = rPrice > sPrice && rPrice > 0;

  // CORREÇÃO: Limita o nome da marca a no máximo 2 palavras diretamente na UI
  const brandName = product?.brand ? product.brand.trim().split(/\s+/).slice(0, 2).join(" ") : "Retailer";

  const productSlug = product?.slug || product?.sku;

  // ✅ FIX CRÍTICO: travar a condição do card para a PDP (evita trocar NEW -> REFURB ao clicar)
  // A API search retorna "condition" do listing selecionado (pela condição filtrada ou pelo menor preço).
  // Aqui transformamos em uma chave estável e mandamos via querystring.
  const conditionKey = normalizeConditionKey(product?.condition);

  // ✅ FIX CRÍTICO: o "preço clicado" também pode ser preservado (opcional, mas ajuda a evitar flashes)
  const priceKey = Number.isFinite(sPrice) && sPrice > 0 ? sPrice.toFixed(2) : "";

  // ✅ IMPORTANTE (Next.js App Router):
  // Link aceita objeto { pathname, query } e gera a querystring corretamente.
  // Isso evita bug de string malformada e mantém prefetch.
  const href = {
    pathname: `/product/${productSlug}`,
    query: {
      ...(conditionKey ? { condition: conditionKey } : {}),
      ...(priceKey ? { price: priceKey } : {}),
    },
  };

  return (
    <article className="group h-full">
      <Link
        href={href}
        prefetch={true}
        // ACESSIBILIDADE: Label melhorada para o Lighthouse 100
        aria-label={`View details for ${product?.name || "product"} at ${brandName}. Condition: ${
          product?.condition || "New"
        }. Price: $${Number(sPrice || 0).toFixed(2)}`}
        className="bg-white rounded-[1.5rem] md:rounded-[2.5rem] border border-slate-200 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-500 flex flex-col p-2 md:p-5 h-full"
      >
        {/* Renderização da Imagem com Lógica de Fallback */}
        <div className="shrink-0">
          <ProductImage
            src={product?.image}
            alt={`Product image: ${product?.name || "Product"}`}
            condition={product?.condition}
            priority={priority}
          />
        </div>

        <div className="px-1 md:px-2 mt-2 md:mt-5 text-left flex flex-col flex-1">
          <div className="flex mb-1.5">
            <p className="text-[7px] md:text-[9px] font-black text-[#ffdb00] bg-black px-2 py-0.5 rounded-sm uppercase tracking-wider inline-flex items-center justify-center min-w-[40px] text-center">
              {brandName}
            </p>
          </div>

          <div className="mb-2 md:mb-4 overflow-hidden flex-1">
            {/* CORREÇÃO HIERARQUIA: h2 para SEO e navegação por teclado */}
            <h2 className="font-black text-gray-900 uppercase text-[10px] md:text-[13px] line-clamp-2 leading-tight tracking-tight">
              {product?.name}
            </h2>
          </div>

          {/* Footer do Card com Preços e CTA */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-1 mt-auto">
            <div className="flex flex-col min-w-0">
              {hasDiscount && (
                /* CORREÇÃO CONTRASTE: slate-600 para atingir ratio 4.5:1 (WCAG AA) */
                <span className="text-[9px] font-bold text-slate-600 line-through leading-none mb-0.5">
                  ${rPrice.toFixed(2)}
                </span>
              )}
              <p className="text-lg md:text-2xl font-black text-gray-900 italic tracking-tighter leading-none">
                ${Number.isFinite(sPrice) ? sPrice.toFixed(2) : "0.00"}
              </p>
            </div>

            {/* CTA VISUAL */}
            <div
              role="img"
              aria-label="View Product"
              className="w-9 h-9 md:w-12 md:h-12 bg-[#ffdb00] rounded-xl flex items-center justify-center shadow-sm group-hover:bg-black transition-all duration-300 shrink-0"
            >
              <svg
                aria-hidden="true"
                className="w-5 h-5 text-black group-hover:text-[#ffdb00]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}