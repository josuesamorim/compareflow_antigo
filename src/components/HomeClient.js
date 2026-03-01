//homeclient.js
"use client";

import React, { useState, useEffect } from 'react';
import DealGrid from './DealGrid';
import Link from 'next/link';
import { Zap, ShieldCheck, TrendingUp, ShoppingBag, ArrowRight } from 'lucide-react';

/**
 * HOME CLIENT V25
 * Responsável por renderizar a vitrine principal com dados sincronizados do servidor.
 * Removido o import do Layout antigo pois agora utilizamos o Root Layout do Next.js 15.
 */
export default function HomeClient({ initialData }) {
  // 1. INICIALIZAÇÃO SEGURA: 
  // Garantimos que a chave 'laptops' seja usada em vez de 'kitchen' para alinhar com o Page.js
  const [data, setData] = useState(initialData || { smartphones: [], tvs: [], laptops: [] });
  
  // Estado para controlar se já estamos no cliente (evita erros de hidratação)
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Marcamos que o componente montou no navegador
    setIsMounted(true);

    async function loadHomeData() {
      /**
       * LÓGICA DE SINCRONIZAÇÃO V25:
       * Se o servidor (Page.js) já nos enviou dados via ISR, nós não fazemos fetch redundante.
       */
      const hasInitialContent = 
        (initialData?.smartphones?.length > 0) || 
        (initialData?.tvs?.length > 0) || 
        (initialData?.laptops?.length > 0);

      if (hasInitialContent) {
        return;
      }

      // 2. FALLBACK: BUSCA VIA API DE PESQUISA (Se o ISR falhar ou estiver vazio)
      const baseUrl = '/api/search';
      
      const fetchCat = (cat) => fetch(`${baseUrl}?category=${cat}&limit=4`, {
        cache: 'no-store' 
      }).then(res => res.json());
      
      try {
        const [smartRes, tvRes, laptopsRes] = await Promise.all([
          fetchCat('smartphones'),
          fetchCat('tvs'),
          fetchCat('laptops')
        ]);
        
        const fetchedData = {
          smartphones: smartRes.items || [],
          tvs: tvRes.items || [],
          laptops: laptopsRes.items || []
        };

        setData(fetchedData);
        
      } catch (e) {
        console.error("❌ Error loading Home data fallback:", e);
      }
    }

    loadHomeData();
  }, [initialData]);

  return (
    <div className="bg-slate-50 min-h-screen">
      
      {/* 1. HERO BANNER - FOCO EM CONVERSÃO */}
      <section className="relative w-full bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] bg-[#ffdb00]/10 rounded-full blur-[100px]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center justify-between py-10 md:py-20 gap-8">
            
            <div className="w-full lg:w-1/2 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-[#ffdb00] text-[10px] md:text-xs font-black px-3 py-1.5 rounded-full uppercase italic mb-6">
                <Zap size={14} fill="#ffdb00" className="shrink-0" /> Instant Deal Tracker
              </div>
              
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-[0.9] uppercase italic tracking-tighter mb-6">
                STOP PAYING <br />
                <span className="text-[#ffdb00]">RETAIL PRICES.</span>
              </h1>
              
              <p className="text-slate-400 text-sm md:text-base font-medium max-w-md mx-auto lg:mx-0 uppercase leading-snug mb-8">
                We monitor price drops across major retailers like Best Buy and eBay, alerting you to the most aggressive discounts in real-time.
              </p>

              <Link href="/todays-deals" 
              aria-label="View all current product deals and discounts from today"
              className="inline-flex items-center gap-3 bg-[#ffdb00] text-black px-8 py-4 rounded-2xl font-black uppercase italic text-sm hover:scale-105 transition-transform">
                Browse All Deals <ArrowRight size={18} />
              </Link>
            </div>

            {/* Lado Direito: Grid de Status */}
            <div className="hidden lg:flex w-full lg:w-[440px] gap-3 items-start">
              <div className="flex-1 flex flex-col gap-3 mt-8">
                <div className="w-full h-[120px] bg-slate-800 p-5 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                  <TrendingUp color="#ffdb00" size={24} className="mb-2" />
                  <span className="text-white font-black text-[9px] uppercase italic">Real-time Tracking</span>
                </div>
                <div className="w-full h-[120px] bg-slate-800 p-5 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                  <ShieldCheck color="#60a5fa" size={24} className="mb-2" />
                  <span className="text-white font-black text-[9px] uppercase italic">Verified Offers</span>
                </div>
              </div>
              <div className="flex-1 flex flex-col gap-3">
                <div className="w-full h-[120px] bg-slate-800 p-5 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                  <ShoppingBag color="#c084fc" size={24} className="mb-2" />
                  <span className="text-white font-black text-[9px] uppercase italic">Curated Lists</span>
                </div>
                <div className="w-full h-[120px] bg-[#ffdb00] p-5 rounded-3xl flex flex-col items-center justify-center text-center shadow-[0_0_30px_rgba(255,219,0,0.2)]">
                  <div className="text-black font-black text-3xl leading-none mb-1">10K+</div>
                  <span className="text-black font-black text-[9px] uppercase italic">Active Listings</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 2. ÁREA DE DEALS POR CATEGORIA */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 relative z-20">
        <div className="space-y-6">
          {[
            { title: "Smartphones", cat: "smartphones", list: data.smartphones },
            { title: "Smart TVs", cat: "tvs", list: data.tvs },
            { title: "Laptops", cat: "laptops", list: data.laptops }
          ].map((sec) => (
            <section key={sec.cat} className="py-10 first:border-none border-t border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-8">
                <div className="flex items-baseline gap-3 min-w-0">
                  <h2 className="text-2xl md:text-4xl font-black uppercase italic text-slate-900 tracking-tighter leading-none truncate md:overflow-visible">
                    {sec.title}
                  </h2>
                </div>
                
                <Link 
                  href={`/category/${sec.cat}`} 
                  className="group flex items-center gap-2 bg-white border border-slate-200 text-slate-900 text-[10px] font-black uppercase italic px-4 md:px-5 py-2 rounded-full hover:bg-slate-900 hover:text-white transition-all whitespace-nowrap shrink-0"
                >
                  View All <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              
              <DealGrid 
                key={`${sec.cat}-${isMounted ? 'mounted' : 'server'}`}
                initialProducts={sec.list} 
                isHomeSection={true} 
              />
            </section>
          ))}
        </div>
      </div>
      
      {/* 3. CTA FINAL */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-20">
        <div className="bg-gray-900 rounded-[2rem] md:rounded-[4rem] p-8 md:p-16 text-center border-4 border-[#ffdb00] shadow-2xl">
          <h2 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-tighter mb-6">
            Don't Miss the <span className="text-[#ffdb00]">Next Drop.</span>
          </h2>
          <Link href="/todays-deals" className="inline-block bg-white text-black px-10 py-5 rounded-2xl font-black uppercase italic hover:bg-[#ffdb00] transition-colors">
            Explore All Deals
          </Link>
        </div>
      </section>

    </div>
  );
}