import { Check, X, ShieldCheck, Award } from 'lucide-react';
import FeedbackExpert from './FeedbackExpert';

/**
 * COMPONENTE EXPERT REVIEW AI V25
 * Responsável por renderizar a análise técnica gerada por IA.
 * Adaptado para suportar o novo Schema de dados transacionais.
 */
export default function ExpertReviewAI({ review, score }) {
  // Regra de Ouro: Se não houver review ou se houver erro no objeto, não renderiza NADA.
  // No V25, o score pode vir como prop direta ou dentro do objeto review.
  const finalScore = score || review?.expert_score || review?.score;
  
  if (!review || review.error || !finalScore) return null;

  return (
    <section className="mt-8 md:mt-12 mb-10 md:mb-24 animate-in fade-in slide-in-from-bottom-6 duration-1000">
      <div className="w-full max-w-none mx-0 px-0 md:max-w-5xl md:mx-auto md:px-0">
        
        {/* Header - Identidade PRICELAB */}
        <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="shrink-0 shadow-lg shadow-yellow-400/20 rounded-lg overflow-hidden">
            <svg width="36" height="36" className="md:w-[42px] md:h-[42px]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="24" height="24" rx="4" fill="#FFDB00"/> 
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="black"/>
            </svg>
          </div>
          <div className="flex flex-col">
            <h2 className="text-[12px] md:text-lg font-black uppercase tracking-tight text-gray-900 leading-none">
              PRICELAB AI INSIGHTS
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
              <span className="text-[8px] md:text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                Automated Market Analysis
              </span>
            </div>
          </div>
        </div>

        {/* Card Principal */}
        <div className="bg-white rounded-[2.5rem] md:rounded-[3rem] border border-gray-100 shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden">
          
          {/* Seção da Nota no Topo - Gráfico Circular de Score */}
          <div className="w-full bg-gray-50/50 p-6 md:pt-8 md:pb-4 flex flex-col items-center justify-center border-b border-gray-100">
            <div className="relative mb-3">
              <svg className="w-24 h-24 md:w-32 md:h-32 transform -rotate-90 overflow-visible">
                <circle
                  cx="50%" cy="50%" r="45%"
                  stroke="#F1F5F9" strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="50%" cy="50%" r="45%"
                  stroke="#FFDB00" strokeWidth="7"
                  fill="transparent"
                  strokeDasharray="283"
                  strokeDashoffset={283 - (283 * Number(finalScore)) / 10}
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_8px_rgba(255,219,0,0.3)]"
                  style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl md:text-5xl font-black tracking-tighter text-gray-900">
                  {Number(finalScore).toFixed(1)}
                </span>
              </div>
            </div>
            <span className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
              Technical Expert Rating
            </span>
          </div>

          {/* Área de Conteúdo */}
          <div className="px-5 py-8 md:pt-10 md:pb-16 md:px-16">
            
            {/* Introdução Dinâmica */}
            {review.intro && (
              <p className="text-[15px] md:text-2xl font-bold text-gray-800 leading-snug md:leading-tight mb-10 md:mb-14 border-l-[3px] md:border-l-4 border-yellow-400 pl-4 md:pl-6">
                {review.intro}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 mb-12">
              {/* Pros - Benefícios Técnicos */}
              <div className="space-y-5">
                <div className="flex items-center gap-3 text-emerald-600">
                  <div className="bg-emerald-50 p-1.5 rounded-lg shrink-0">
                    <Check className="w-[18px] h-[18px] md:w-[20px] md:h-[20px]" strokeWidth={4} />
                  </div>
                  <h3 className="font-black uppercase tracking-widest text-[10px] md:text-xs">Key Advantages</h3>
                </div>
                <ul className="space-y-4">
                  {review.pros?.length > 0 ? (
                    review.pros.map((pro, i) => (
                      <li key={i} className="text-[13px] md:text-base text-gray-600 leading-relaxed flex gap-3">
                        <span className="font-bold text-emerald-500 shrink-0">•</span>
                        {pro}
                      </li>
                    ))
                  ) : (
                    <li className="text-[13px] text-gray-400 italic">No significant advantages reported.</li>
                  )}
                </ul>
              </div>

              {/* Cons - Limitações do Produto */}
              <div className="space-y-5">
                <div className="flex items-center gap-3 text-red-600">
                  <div className="bg-red-50 p-1.5 rounded-lg shrink-0">
                    <X className="w-[18px] h-[18px] md:w-[20px] md:h-[20px]" strokeWidth={4} />
                  </div>
                  <h3 className="font-black uppercase tracking-widest text-[10px] md:text-xs">Limitations</h3>
                </div>
                <ul className="space-y-4">
                  {review.cons?.length > 0 ? (
                    review.cons.map((con, i) => (
                      <li key={i} className="text-[13px] md:text-base text-gray-500 leading-relaxed flex gap-3">
                        <span className="font-bold text-red-400 shrink-0">•</span>
                        {con}
                      </li>
                    ))
                  ) : (
                    <li className="text-[13px] text-gray-400 italic">No major limitations identified.</li>
                  )}
                </ul>
              </div>
            </div>

            {/* Veredito Premium - Impacto Visual Máximo */}
            <div className="relative bg-gray-900 -mx-5 md:mx-0 rounded-b-[2.5rem] md:rounded-[2rem] p-6 md:p-12 text-white overflow-hidden shadow-2xl">
              {/* Background Icon */}
              <Award className="absolute -right-4 -bottom-3 w-32 h-32 md:w-64 md:h-64 text-white/10 rotate-12 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col items-start text-left">
                {/* Título do Veredito */}
                <div className="flex items-center gap-3 mb-4 md:mb-6">
                  <ShieldCheck className="text-[#FFDB00] w-[20px] h-[20px] md:w-[28px] md:h-[28px]" />
                  <h3 className="font-black uppercase tracking-[0.2em] text-[10px] md:text-[11px] text-[#FFDB00]">
                    Expert Verdict
                  </h3>
                </div>
                
                {/* Texto do Veredito Final */}
                <p className="text-[14px] md:text-xl font-extrabold leading-snug md:leading-relaxed tracking-wide text-gray-100 max-w-3xl">
                  {review.verdict || "Analysis based on market specifications and historical performance trends."}
                </p>

                {/* Bloco de Feedback do Usuário */}
                <div className="mt-8 w-full md:w-auto">
                   <FeedbackExpert />
                </div>

                {/* Footer de Transparência e Disclaimer de IA */}
                <div className="mt-6 md:mt-10 border-t border-white/5 w-full">
                  <p className="pt-4 text-[8px] md:text-[10px] text-white/30 italic leading-tight">
                    <span className="font-black uppercase tracking-widest not-italic mr-2 text-white/40">AI-Powered Insights:</span>
                    This analysis is synthesized by PRICELAB’s proprietary algorithm. It processes technical datasets, verified specifications, and real-time market trends to provide an objective score.
                  </p>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
}