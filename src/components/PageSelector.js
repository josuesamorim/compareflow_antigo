"use client";

import React from 'react';

export default function PageSelector({ currentPage, totalPages, onPageChange, loading }) {
  /**
   * FIX CRÍTICO: 
   * Se por algum erro de estado o 'totalPages' vier como o total de itens (ex: 451) 
   * em vez do total de páginas (ex: 19), esta verificação impede a quebra do layout.
   * Assumimos que se o número for absurdamente alto para uma categoria filtrada, 
   * algo está errado na prop enviada pelo pai.
   */
  if (!totalPages || totalPages <= 1) return null;

  // Função interna para lidar com o clique e subir a tela
  const handleInternalPageChange = (page) => {
    // Bloqueia cliques se estiver carregando ou se for a mesma página
    // Adicionada verificação extra de segurança para limites de página
    if (loading || page === currentPage || page < 1 || page > totalPages) return;
    
    // 1. Sobe a tela suavemente para o topo antes de disparar a carga
    // Isso melhora a UX enquanto os novos dados são buscados
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // 2. Dispara a mudança de página que atualizará o estado no componente pai
    onPageChange(page);
  };

  const getPages = () => {
    const pages = [];
    const range = 1; // Quantidade de páginas adjacentes à atual (1 antes e 1 depois)

    /**
     * Lógica Determinística de Geração de Números:
     * Criamos a lista de botões baseada na posição da página atual.
     */
    for (let i = 1; i <= totalPages; i++) {
      // Regras: Sempre mostrar primeira, última, e o entorno da atual
      if (
        i === 1 || 
        i === totalPages || 
        (i >= currentPage - range && i <= currentPage + range)
      ) {
        pages.push(i);
      } 
      // Adiciona reticências se houver um salto entre os números
      else if (i === currentPage - range - 1 || i === currentPage + range + 1) {
        pages.push("...");
      }
    }

    // Remove reticências duplicadas seguidas para manter a estética limpa (ex: [1, ..., ..., 5])
    return pages.filter((item, index, arr) => item !== "..." || arr[index - 1] !== "...");
  };

  return (
    <div className={`flex flex-col md:flex-row justify-center items-center gap-6 mt-16 md:mt-24 transition-all duration-300 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      
      <div className="flex items-center gap-2 md:gap-4">
        {/* Botão Voltar */}
        <button 
          onClick={() => handleInternalPageChange(currentPage - 1)} 
          disabled={currentPage === 1 || loading} 
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl bg-white border border-gray-200 disabled:opacity-20 font-black shadow-sm hover:bg-black hover:text-[#ffdb00] transition-all active:scale-95 group focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          aria-label="Previous Page"
        >
          <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        {/* Números das Páginas */}
        <div className="flex gap-1 md:gap-2">
          {getPages().map((p, i) => (
            p === "..." ? (
              <span 
                key={`dots-${i}`} 
                className="w-8 flex items-center justify-center text-gray-400 font-black tracking-widest" 
                aria-hidden="true"
              >
                ...
              </span>
            ) : (
              <button 
                key={`page-${p}`} 
                onClick={() => handleInternalPageChange(p)} 
                disabled={loading}
                className={`w-10 h-10 md:w-12 md:h-12 rounded-xl font-black text-xs md:text-sm transition-all shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${
                  currentPage === p 
                    ? 'bg-black text-[#ffdb00] border-black scale-110 z-10 shadow-lg cursor-default' 
                    : 'bg-white text-gray-500 border border-gray-100 hover:border-black hover:text-black'
                }`}
                aria-current={currentPage === p ? 'page' : undefined}
                aria-label={`Go to page ${p}`}
              >
                {p}
              </button>
            )
          ))}
        </div>

        {/* Botão Avançar */}
        <button 
          onClick={() => handleInternalPageChange(currentPage + 1)} 
          disabled={currentPage === totalPages || loading} 
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-xl bg-white border border-gray-200 disabled:opacity-20 font-black shadow-sm hover:bg-black hover:text-[#ffdb00] transition-all active:scale-95 group focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
          aria-label="Next Page"
        >
          <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Indicador visual de página atual para mobile */}
      <div className="md:hidden text-[10px] font-black uppercase tracking-widest text-gray-400">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  );
}