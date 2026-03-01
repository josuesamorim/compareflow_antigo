//dealgrid.js
"use client";
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

/**
 * COMPONENTE: ProductGrid
 * Responsável pela renderização de listas de produtos com:
 * 1. Tratamento rigoroso de imagens (Auto-hide em caso de erro).
 * 2. Cálculo dinâmico de descontos para evitar preços desatualizados no layout.
 * 3. Esqueleto de carregamento (Skeleton) integrado.
 * 4. Compatibilidade com Next.js Prefetching.
 */
export default function DealGrid({ initialProducts, title = "", isHomeSection = false, loading: externalLoading = false }) {
  const [visibleCount, setVisibleCount] = useState(8);
  
  /**
   * ESTADO DE PROTEÇÃO CONTRA IMAGENS QUEBRADAS
   * Rastreamos IDs de produtos cujas imagens falharam no carregamento em tempo real.
   */
  const [hiddenProducts, setHiddenProducts] = useState(new Set());

  const handleImageError = (productId) => {
    setHiddenProducts((prev) => {
      const newSet = new Set(prev);
      newSet.add(productId);
      return newSet;
    });
  };

  /**
   * LÓGICA DE FILTRAGEM E VALIDAÇÃO (MEMOIZADA):
   * Garante que apenas produtos com dados financeiros válidos e imagens 
   * processáveis sejam exibidos, evitando erros de renderização "NaN".
   */
  const validProducts = useMemo(() => {
    return (initialProducts || []).filter((product) => {
      const imgUrl = product.image || "";
      
      // Filtro de segurança de imagem
      const hasValidImageString = 
        imgUrl !== '' && 
        !imgUrl.includes('placeholder') && 
        !imgUrl.includes('no-image') &&
        !imgUrl.includes('1x1') &&
        !imgUrl.includes('base64');

      // Garantia de integridade de preço (evita mostrar "0.00" ou desatualizados bizarros)
      const hasPrice = product.salePrice !== undefined && product.salePrice !== null;

      return hasValidImageString && hasPrice;
    });
  }, [initialProducts]);

  const hasData = validProducts.length > 0;

  /**
   * LÓGICA DE EXIBIÇÃO DO SKELETON:
   * Ativado durante carregamento externo ou quando a Home ainda não recebeu dados.
   */
  const showSkeleton = externalLoading || (isHomeSection && !hasData && (initialProducts?.length === 0 || !initialProducts));

  if (showSkeleton) return (
    <section className="w-full">
      {!isHomeSection && <div className="h-10 w-48 bg-slate-100 animate-pulse mb-8 rounded-lg" />}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-col h-[380px] bg-white rounded-2xl border border-slate-100 overflow-hidden p-4">
             <div className="w-full h-40 bg-slate-100 animate-pulse rounded-xl mb-4" />
             <div className="h-4 w-2/3 bg-slate-100 animate-pulse rounded mb-2" />
             <div className="h-4 w-full bg-slate-100 animate-pulse rounded mb-8" />
             <div className="mt-auto flex justify-between items-center">
                <div className="h-8 w-20 bg-slate-100 animate-pulse rounded" />
                <div className="h-10 w-10 bg-slate-100 animate-pulse rounded-lg" />
             </div>
          </div>
        ))}
      </div>
    </section>
  );

  // Mensagem de fallback caso a curadoria filtre todos os produtos
  if (!hasData && !externalLoading) {
    return (
      <div className="h-20 flex items-center text-slate-400 italic">
        Searching for fresh deals...
      </div>
    );
  }

  const loadMore = () => setVisibleCount(prev => prev + 4);

  return (
    <section className="text-left w-full min-h-[400px] animate-in fade-in duration-500">
      {!isHomeSection && (
        <div className="flex flex-col mb-8 items-start">
          <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tighter uppercase italic leading-none">
            {title || "Featured Drops"}
          </h2>
          <div className="h-1.5 w-16 bg-[#ffdb00] mt-2"></div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" suppressHydrationWarning>
        {validProducts.slice(0, visibleCount).map((product) => {
          /**
           * CÁLCULO DE PREÇO REAL-TIME:
           * Forçamos a conversão para Number para evitar erros de string concat.
           * A lógica de desconto é recalculada aqui para bater exatamente com os dados da API.
           */
          const sPrice = Number(product.salePrice || 0);
          const rPrice = Number(product.regularPrice || 0);
          const hasDiscount = rPrice > sPrice && rPrice > 0;
          
          // Prioriza o label da API, mas recalcula se estiver ausente para manter a precisão
          const discountDisplay = product.discountLabel || (hasDiscount ? `${Math.round(((rPrice - sPrice) / rPrice) * 100)}% OFF` : null);
          
          const productUrl = `/product/${product.slug || product.sku}`;
          const productId = product.sku || product.id;

          /**
           * TRATAMENTO DE MARCA (BRAND):
           * Higienização para o layout: apenas a primeira palavra e sem caracteres especiais.
           */
          const displayBrand = product.brand 
            ? product.brand.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, '') 
            : "Deal";

          // Se a imagem falhar fisicamente no browser, removemos o card do DOM
          if (hiddenProducts.has(productId)) return null;

          return (
            <article key={productId} className="relative group">
              <Link 
                aria-label={`View details for ${product.name}`}
                href={productUrl} 
                prefetch={true}
                className="flex flex-col h-full bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.10)] transition-all duration-500 hover:-translate-y-1"
              >
                {/* CONTAINER DA IMAGEM */}
                <div className="relative h-40 md:h-56 overflow-hidden bg-white flex items-center justify-center p-4">
                  <img 
                    src={product.image} 
                    loading="lazy"
                    onLoad={(e) => {
                      // Proteção contra imagens de 1px ou corrompidas que não disparam onError
                      if (e.target.naturalWidth > 0 && e.target.naturalWidth < 10) {
                        handleImageError(productId);
                      }
                    }}
                    onError={() => handleImageError(productId)}
                    className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-700" 
                    alt={product.name} 
                  />
                  
                  {/* BADGES SUPERIORES */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    <span className="inline-flex items-center justify-center bg-gray-900 text-[#ffdb00] px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-widest shadow-lg italic text-center min-w-[50px]">
                      {displayBrand}
                    </span>
                    {discountDisplay && (
                      <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase italic shadow-sm text-center">
                        {discountDisplay}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* INFO DO PRODUTO */}
                <div className="p-4 md:p-5 flex flex-col flex-1 text-left">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 line-clamp-1">
                    {product.internalCategory || "Electronics"}
                  </span>
                  <h3 className="font-black text-gray-900 text-[11px] md:text-sm leading-tight mb-3 line-clamp-2 h-7 md:h-9 uppercase italic">
                    {product.name}
                  </h3>

                  {/* PREÇOS E CALL TO ACTION */}
                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[8px] text-green-500 font-bold uppercase tracking-tighter">Verified Offer</span>
                      <div className="flex flex-col">
                        {hasDiscount && (
                           <span className="text-[9px] md:text-[10px] font-bold text-slate-400 line-through leading-none">
                              ${rPrice.toFixed(2)}
                           </span>
                        )}
                        <p className="text-lg md:text-2xl font-black text-gray-900 tracking-tighter leading-none">
                          ${sPrice.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    
                    {/* BOTÃO DE AÇÃO */}
                    <div title="View Details" className="bg-[#ffdb00] text-gray-900 w-9 h-9 md:w-11 md:h-11 flex items-center justify-center rounded-lg group-hover:bg-gray-900 group-hover:text-white transition-all shadow-md">
                      <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3.5">
                        <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </Link>
            </article>
          );
        })}
      </div>

      {/* BOTÃO CARREGAR MAIS (APENAS FORA DA HOME) */}
      {validProducts.length > visibleCount && !isHomeSection && (
        <div className="flex justify-center mt-12"> 
          <button 
            aria-label="Load more current product deals from the catalog"
            onClick={loadMore} 
            className="px-8 py-4 font-black text-[10px] uppercase tracking-[0.2em] text-gray-900 bg-white border-2 border-gray-900 rounded-xl shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
          >
            Expand Catalog
          </button>
        </div>
      )}
    </section>
  );
}