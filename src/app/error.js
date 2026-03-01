"use client";

import { useEffect, useState } from 'react';
import Footer from '../components/Footer';

export default function Error({ error, reset }) {
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    // Log do erro (ex: Sentry ou LogSnag)
    console.error("Critical System Interruption:", error);
  }, [error]);

  const handleReset = async () => {
    setIsRetrying(true);
    
    // Simulação de "Cooldown" para evitar spam de resets durante o pico de 300 VUs
    // O Redis no backend deve estar monitorando a saúde da conexão
    setTimeout(() => {
      reset();
      setIsRetrying(false);
    }, 800);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <main className="flex-grow flex items-center justify-center px-4 py-20">
        <div className="max-w-xl w-full text-center">
          
          <div className="mb-8 flex justify-center">
            <div className={`w-24 h-24 bg-red-50 rounded-full flex items-center justify-center ${isRetrying ? 'animate-ping' : ''}`}>
              <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-600 mb-4">
            System Alert: Integrity Check Required
          </p>
          
          <h1 className="text-4xl md:text-6xl font-[1000] text-gray-900 uppercase italic tracking-tighter leading-none mb-6">
            SYSTEM <span className="text-red-600">INTERRUPTION</span>
          </h1>

          <p className="text-slate-500 font-bold uppercase text-[10px] md:text-xs tracking-widest mb-10 leading-relaxed max-w-sm mx-auto">
            Our servers encountered an unexpected glitch while fetching the latest deals. We are utilizing Redis-backed redundancy to restore your session.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleReset}
              disabled={isRetrying}
              className={`w-full sm:w-auto bg-black text-white px-10 py-5 rounded-2xl font-black uppercase text-xs transition-all duration-300 shadow-xl ${
                isRetrying ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-600 hover:-translate-y-1'
              }`}
            >
              {isRetrying ? 'Reconnecting...' : 'Try Again'}
            </button>
            
            <a 
              href="/"
              className="w-full sm:w-auto bg-white border-2 border-slate-200 text-gray-900 px-10 py-5 rounded-2xl font-black uppercase text-xs hover:border-black transition-all duration-300"
            >
              Go to Homepage
            </a>
          </div>

          <div className="mt-12 p-6 bg-slate-50 rounded-3xl border border-slate-100">
             <p className="text-[9px] font-black text-slate-400 uppercase">
                Redundancy protocols active. If the problem persists, our engine might be under heavy maintenance.
             </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}