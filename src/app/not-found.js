"use client";

import { useEffect } from 'react';
import Footer from '../components/Footer';
import Link from 'next/link';

export default function NotFound() {
  
  useEffect(() => {
    // Lógica de "Negative Caching" via Analytics ou API
    // Em 300 VUs, rastrear 404s ajuda a identificar links quebrados no seu crawler
    const reportNotFound = async () => {
      try {
        const path = window.location.pathname;
        // O Redis no backend pode incrementar um contador de 404 para este path
        await fetch(`/api/stats/404?path=${encodeURIComponent(path)}`, { method: 'POST' });
      } catch (e) {
        // Silencioso para não afetar o usuário
      }
    };
    reportNotFound();
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc]">
      <main className="flex-grow flex items-center justify-center px-4 py-20">
        <div className="max-w-2xl w-full text-center">
          
          {/* IMPACTFUL ERROR CODE */}
          <div className="relative">
            <h1 className="text-[120px] md:text-[200px] font-[1000] text-slate-200 leading-none select-none">
              404
            </h1>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-black text-white px-4 py-1 text-xs md:text-sm font-black uppercase italic tracking-[0.3em] rotate-[-2deg] shadow-2xl">
                Deal Expired or Page Not Found
              </span>
            </div>
          </div>

          {/* MESSAGE */}
          <h2 className="text-3xl md:text-5xl font-[1000] text-gray-900 uppercase italic tracking-tighter mt-8 mb-4">
            LOST IN THE <span className="text-red-600">HUB?</span>
          </h2>
          
          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mb-12 max-w-md mx-auto leading-relaxed">
            The offer you are looking for might have expired or moved to a new category. Don't miss out on other live deals!
          </p>

          {/* REDIRECT OPTIONS */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            <Link 
              href="/"
              className="w-full md:w-auto bg-black text-white px-10 py-5 rounded-2xl font-black uppercase text-xs hover:bg-red-600 hover:-translate-y-1 transition-all duration-300 shadow-xl"
            >
              Back to Home
            </Link>
            
            <Link 
              href="/black-friday"
              className="w-full md:w-auto bg-white border-2 border-slate-200 text-gray-900 px-10 py-5 rounded-2xl font-black uppercase text-xs hover:border-black transition-all duration-300"
            >
              Black Friday Deals
            </Link>
          </div>

          {/* HELPFUL LINKS */}
          <div className="mt-16 pt-8 border-t border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6">
              Popular Categories
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {['Kitchen Appliances', 'Electronics', 'Smart Home', 'Gaming'].map((cat) => (
                <Link 
                  key={cat}
                  href={`/category/${cat.toLowerCase().replace(' ', '-')}`}
                  className="text-[10px] font-black uppercase text-slate-600 hover:text-black transition-colors"
                >
                  {cat}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}