//dealsclient.js

"use client";

import PageSelector from '../../components/PageSelector';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import Link from 'next/link';

/**
 * COMPONENTE DE DEALS COM SINCRONIA TOTAL AO DB (V25)
 * Corrigido: Implementação de scroll reforçado para lidar com re-renderização de API.
 */
export default function DealsClient({ initialData = [], initialTotalPages = 1 }) {
  
  const formatDeals = (items) => {
    if (!items || !Array.isArray(items)) return [];
    return items.map(product => {
      const sale = Number(product.salePrice || product.sale_price || 0);
      const regular = Number(product.regularPrice || product.regular_price || 0);
      const discountPercent = (regular > sale && regular > 0) 
        ? Math.round(((regular - sale) / regular) * 100) 
        : Number(product.discountPercent || product.discount_percent || 0);
      
      return {
        ...product,
        salePrice: sale,
        regularPrice: regular,
        discountPercent: discountPercent,
        discountLabel: discountPercent > 0 ? `${discountPercent}% OFF` : null,
      };
    });
  };

  // Estados principais
  const [deals, setDeals] = useState(() => formatDeals(initialData));
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  
  // Timer e Hidratação
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });
  const [isMounted, setIsMounted] = useState(false);
  const isFirstRender = useRef(true);
  
  const itemsPerPage = 12;

  // 1. GARANTIA DE SCROLL AO MUDAR PÁGINA (REFORÇADO)
  // Usamos useLayoutEffect para disparar antes da pintura do navegador
  useLayoutEffect(() => {
    if (isFirstRender.current) return;

    // Tentativa imediata
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Backup: Caso a re-renderização dos dados da API interrompa o primeiro scroll,
    // usamos uma pequena task para garantir que o scroll aconteça após o DOM estabilizar.
    const timeout = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 10);

    return () => clearTimeout(timeout);
  }, [currentPage]);

  // 2. LÓGICA DO TIMER
  useEffect(() => {
    setIsMounted(true);
    const calculateTimeLeft = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); 
      const diff = midnight - now;
      if (diff > 0) {
        setTimeLeft({
          h: Math.floor((diff / (1000 * 60 * 60)) % 24),
          m: Math.floor((diff / 1000 / 60) % 60),
          s: Math.floor((diff / 1000) % 60)
        });
      }
    };
    const timer = setInterval(calculateTimeLeft, 1000);
    calculateTimeLeft(); 
    return () => clearInterval(timer);
  }, []);

  // 3. BUSCA DE DADOS (PAGINAÇÃO DINÂMICA)
  useEffect(() => {
    if (!isMounted) return;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    async function fetchDeals() {
      setLoading(true);
      
      try {
        const res = await fetch(`/api/deals?page=${currentPage}&limit=${itemsPerPage}&t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
        }); 
        
        if (!res.ok) {
          setLoading(false);
          return;
        }
        
        const data = await res.json();
        
        // Atualiza o total de páginas dinamicamente
        setTotalPages(data.totalPages || 1);
        setDeals(formatDeals(data.items || []));
        
      } catch (error) {
        console.error("❌ Erro ao sincronizar ofertas:", error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchDeals();
  }, [currentPage, isMounted]);

  const handlePageChange = (n) => {
    if (n === currentPage || loading) return;
    setCurrentPage(n);
  };

  return (
    <div className="bg-slate-50 min-h-screen pb-10">
      
      {/* HEADER COM CONTAGEM REGRESSIVA */}
      <section className="bg-gray-900 py-12 md:py-20 px-4 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#ffdb00]"></div>
        <div className="max-w-4xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-7xl font-black italic uppercase text-white tracking-tighter">
            TODAY'S <span className="text-[#ffdb00]">TOP DEALS</span>
          </h1>
          
          <div className={`inline-flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl mt-6 transition-opacity duration-500 ${isMounted ? 'opacity-100' : 'opacity-0'}`}>
            <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">Resets in:</span>
            <div className="flex gap-2 text-[#ffdb00] font-mono text-xl md:text-2xl font-bold">
              <span>{String(timeLeft.h).padStart(2, '0')}h</span>
              <span className="animate-pulse">:</span>
              <span>{String(timeLeft.m).padStart(2, '0')}m</span>
              <span className="animate-pulse">:</span>
              <span>{String(timeLeft.s).padStart(2, '0')}s</span>
            </div>
          </div>
        </div>
      </section>

      {/* GRID DE OFERTAS V25 */}
      
      <div id="deals-grid" className="max-w-7xl mx-auto px-4 md:px-6 -mt-8 relative z-10 min-h-[800px]">
        {loading && deals.length === 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-[2.5rem] p-5 h-[480px] border border-slate-100 animate-pulse flex flex-col">
                <div className="bg-slate-100 rounded-[2rem] aspect-square w-full mb-4"></div>
                <div className="bg-slate-100 h-14 w-full rounded-2xl mt-auto"></div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 transition-opacity duration-300 ${loading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              {deals.map((deal, index) => (
                <article key={deal.slug ? `${deal.slug}-${index}` : `deal-${index}`} className="group relative bg-white rounded-2xl md:rounded-[2.5rem] border border-slate-100 shadow-xl transition-all hover:border-[#ffdb00] flex flex-col overflow-hidden">
                  <Link href={`/product/${deal.slug}`} className="p-3 md:p-5 flex-1 flex flex-col">
                    <div className="relative aspect-square bg-white rounded-xl md:rounded-[2rem] overflow-hidden mb-4 border border-slate-50 p-4">
                      <img 
                        src={deal.image || '/placeholder.png'} 
                        alt={deal.name} 
                        className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                      />
                      {deal.discountLabel && (
                        <div className="absolute top-3 left-3">
                          <div className="bg-red-600 text-white text-[9px] md:text-[12px] font-black px-3 py-1 rounded-full italic uppercase shadow-lg">
                              {deal.discountLabel}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 md:space-y-4 px-1 flex-1 flex flex-col justify-between">
                      <div>
                        <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                          {deal.brand || "TOP BRAND"}
                        </span>
                        <h3 className="text-[11px] md:text-[15px] font-black text-gray-900 uppercase italic line-clamp-2 leading-[1.2]">
                          {deal.name}
                        </h3>
                      </div>

                      <div className="mt-auto pt-2 border-t border-slate-50 flex flex-col">
                        {deal.regularPrice > deal.salePrice && (
                          <span className="text-[10px] md:text-sm font-bold text-slate-400 line-through">
                            ${Number(deal.regularPrice).toFixed(2)}
                          </span>
                        )}
                        <span className="text-xl md:text-4xl font-black text-gray-900 italic tracking-tighter">
                          ${Number(deal.salePrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="px-3 pb-3 md:px-6 md:pb-6 mt-auto">
                    <Link href={`/product/${deal.slug}`}>
                      <button className="w-full bg-gray-900 text-white py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[11px] uppercase tracking-widest hover:bg-[#ffdb00] hover:text-black transition-all">
                        View Details
                      </button>
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            {/* SELETOR DE PÁGINAS */}
            {totalPages > 1 && (
              <div className="py-12">
                <PageSelector 
                  currentPage={currentPage} 
                  totalPages={totalPages} 
                  onPageChange={handlePageChange} 
                  loading={loading}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}