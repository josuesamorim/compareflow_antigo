//search/page.js

import SearchClient from './SearchClient';
import { Suspense } from 'react';

/**
 * SEO: GENERATE METADATA (V25)
 * No Next.js 15, searchParams é uma Promise e deve ser aguardada.
 */
export async function generateMetadata({ searchParams }) {
  // Correção: Aguardar a resolução dos parâmetros de busca
  const sParams = await searchParams;
  const query = sParams.q || "";
  const category = sParams.category || "";
  
  const title = query 
    ? `Search results for "${query}" | CompareFlow` 
    : category 
      ? `Category: ${category.replace(/-/g, ' ')} | CompareFlow` 
      : "Search Products | CompareFlow";

  const description = `Find the best prices and deals for ${query || category || 'products'} on CompareFlow. Real-time price tracking.`;

  return {
    title,
    description,
    alternates: {
      canonical: 'https://www.compareflow.club/search',
    },
    openGraph: {
      title,
      description,
      type: 'website',
      url: 'https://www.compareflow.club/search',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    }
  };
}

/**
 * PÁGINA DE BUSCA (SERVER COMPONENT)
 * Mantém o Suspense para o SearchClient, garantindo hidratação progressiva.
 */
export default function Page() {
  return (
    <Suspense fallback={
      <div className="bg-[#f8fafc] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-16 w-full animate-pulse">
          {/* Skeleton para o Título e Contador */}
          <div className="h-8 w-48 bg-slate-200 rounded-full mb-8"></div>
          
          {/* Skeleton para o Banner ou Título Principal */}
          <div className="h-12 w-3/4 bg-slate-200 rounded-lg mb-12"></div>
          
          <div className="flex gap-8">
            {/* Sidebar de Filtros (Desktop) */}
            <div className="hidden lg:block w-64 h-[600px] bg-slate-100 rounded-[2.5rem]"></div>
            
            {/* Grid de Produtos */}
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-[400px] bg-slate-50 rounded-[2.5rem]"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    }>
      <SearchClient />
    </Suspense>
  );
}