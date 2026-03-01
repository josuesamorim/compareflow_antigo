"use client";

export default function SortControl({ sortBy, setSortBy }) {
  return (
    /* Container principal:
       - h-12 no mobile para ser confortável ao toque.
       - lg:h-[60px] para o desktop imponente.
       - group e focus-within: mudam a cor da borda ao interagir.
    */
    <div className="flex-1 lg:flex-none h-12 lg:h-[60px] lg:min-w-[220px] bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center relative group hover:border-[#ffdb00] focus-within:border-[#ffdb00] transition-all duration-300">
      
      <div className="flex items-center justify-center gap-2 lg:gap-3 w-full px-3 lg:px-6 h-full">
        
        {/* Ícone Lateral: Fica amarelo quando o container está em foco */}
        <svg 
          className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-600 group-hover:text-black group-focus-within:text-black shrink-0 transition-colors" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        
        <div className="flex flex-col items-center flex-1 min-w-0 h-full justify-center">
          <span className="text-[7px] sm:text-[8px] lg:text-[9px] font-black text-slate-600 uppercase leading-none mb-0.5 lg:mb-1 tracking-widest whitespace-nowrap">
            Order by
          </span>
          
          <div className="relative flex items-center w-full justify-center">
            {/* O SELECT:
                - z-10 e absolute inset-0: garante que toda a área do card seja clicável.
                - Opacidade zero no select original para usarmos nosso estilo personalizado por baixo, 
                  ou mantemos estilizado com appearance-none.
            */}
            <select
              aria-label="Sort products by" 
              className="text-[10px] sm:text-[11px] lg:text-[13px] font-black bg-transparent outline-none cursor-pointer uppercase appearance-none text-center pr-5 lg:pr-7 w-full text-gray-900 truncate relative z-10" 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="relevance">Top Relevance</option>
              <option value="lowest">Lower Price</option>
              <option value="highest">Higher Price</option>
            </select>
            
            {/* Seta Customizada (Chevron) */}
            <div className="absolute right-0 pointer-events-none z-0">
              <svg 
                className="w-2.5 h-2.5 lg:w-3.5 lg:h-3.5 text-slate-600 group-hover:text-black transition-colors" 
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      
      {/* Detalhe estético: Barra amarela fina no fundo ao hover */}
      <div className="absolute bottom-0 left-0 h-1 bg-[#ffdb00] w-0 group-hover:w-full transition-all duration-500" />
    </div>
  );
}