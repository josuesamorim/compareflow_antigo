"use client";

import React, { useState, useMemo, useCallback } from 'react';

const TechnicalSpecs = ({ rawDetails }) => {
  // Mantemos o estado para o botão "See More", mas o conteúdo inicial será renderizado no servidor
  const [visibleCount, setVisibleCount] = useState(6);

  const allSpecs = useMemo(() => {
    if (!rawDetails || typeof rawDetails !== 'object') return [];

    /**
     * LISTA DE EXCLUSÃO ATUALIZADA (SCHEMA V25)
     * Removemos chaves técnicas, IDs, URLs e campos que já são exibidos no Hero.
     */
    const excludedKeys = [
      'sync_at', 'upc', 'model_number', 'color', 'image', 'url', 'affiliate_url',
      'included_items', 'modelNumber', 'manufacturer', 'sync_status',
      'id', 'sku', 'slug', 'group_id', 'last_updated', 'regularprice', 'saleprice',
      'product_model', 'colour', 'internal_category', 'expert_score', 'expert_status',
      'ai_name_cleaned', 'upc_not_found', 'price', 'condition', 'store'
    ];

    return Object.entries(rawDetails)
      .filter(([key, value]) => {
        return (
          value && 
          !excludedKeys.includes(key.toLowerCase()) && 
          !excludedKeys.includes(key) &&
          typeof value !== 'object' &&
          String(value).trim() !== "" &&
          String(value).toLowerCase() !== "null" &&
          String(value).toLowerCase() !== "false" &&
          String(value).toLowerCase() !== "undefined"
        );
      })
      .map(([key, value]) => ({
        id: key,
        // Transforma camelCase ou snake_case em títulos legíveis e limpos
        label: key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toUpperCase(),
        value: String(value)
      }));
  }, [rawDetails]);

  const visibleSpecs = allSpecs.slice(0, visibleCount);
  const isAllShown = visibleCount >= allSpecs.length;

  const handleLoadMore = useCallback((e) => {
    e.preventDefault();
    setVisibleCount(prev => prev + 6);
  }, []);

  const handleShowLess = useCallback((e) => {
    e.preventDefault();
    setVisibleCount(6);
  }, []);

  if (allSpecs.length === 0) return null;

  return (
    <div className="w-full">
      <dl className="grid grid-cols-1">
        {visibleSpecs.map((spec) => (
          <div 
            key={spec.id} 
            className="spec-row group flex flex-col sm:flex-row sm:items-baseline py-4 px-2 border-b border-slate-100 hover:bg-slate-50/50 transition-colors duration-200 rounded-lg animate-in fade-in slide-in-from-bottom-1 duration-500"
          >
            <dt className="w-full sm:w-1/3 text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-1 sm:mb-0 group-hover:text-blue-600 shrink-0">
              {spec.label}
            </dt>
            <dd className="w-full sm:w-2/3 text-[11px] md:text-[13px] font-black text-slate-900 italic uppercase leading-tight break-words tracking-tight">
              {spec.value}
            </dd>
          </div>
        ))}
      </dl>

      {allSpecs.length > 6 && (
        <div className="mt-8 flex justify-center">
          {!isAllShown ? (
            <button 
              type="button"
              onClick={handleLoadMore}
              className="group flex items-center gap-3 bg-white hover:bg-gray-900 text-gray-900 hover:text-white px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 shadow-sm border border-slate-200"
            >
              See More Specifications
              <span className="inline-block transition-transform group-hover:translate-y-1">↓</span>
            </button>
          ) : (
            <button 
              type="button"
              onClick={handleShowLess}
              className="group flex items-center gap-3 bg-slate-100 hover:bg-gray-200 text-slate-500 px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 active:scale-95"
            >
              Show Less
              <span className="rotate-180 inline-block">↓</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TechnicalSpecs;