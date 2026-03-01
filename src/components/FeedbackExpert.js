"use client";

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react';

/**
 * COMPONENTE FEEDBACK EXPERT V25
 * Implementa sinais de interação para elevar o E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness).
 * Otimizado para visualização dentro de containers escuros (Dark Background).
 */
export default function FeedbackExpert() {
  const [submitted, setSubmitted] = useState(false);

  /**
   * Lógica de Feedback:
   * Para o Google (SEO): Interações de usuários em conteúdos gerados por IA são sinais positivos de utilidade.
   * Para o Humano: Fornece um fechamento satisfatório para a análise técnica.
   */
  const handleFeedback = (type) => {
    // Aqui simulamos o envio. Futuramente você pode conectar ao Google Analytics ou Banco de Dados.
    console.log(`Feedback recebido: ${type}`);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center w-full animate-in fade-in zoom-in duration-500">
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-6 py-3 rounded-2xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          <p className="text-[13px] md:text-sm font-bold text-emerald-500 tracking-wide uppercase italic">
            Thank you for your feedback!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-6 w-full">
      
      {/* Container de Texto: Hierarquia visual focada em transparência */}
      <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
        <p className="text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">
          Content Quality Assurance
        </p>
        <p className="text-[14px] md:text-sm font-bold text-gray-300 italic uppercase tracking-tight">
          Was this AI analysis helpful to you?
        </p>
      </div>

      {/* Container de Botões: Interatividade tátil com feedbacks visuais */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleFeedback('positive')}
          type="button"
          aria-label="This analysis was helpful"
          className="flex items-center gap-2 px-6 py-3 sm:px-5 sm:py-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 transition-all active:scale-95 group"
        >
          <ThumbsUp className="w-4 h-4 text-emerald-500 group-hover:rotate-12 transition-transform" />
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-200">
            Yes
          </span>
        </button>

        <button
          onClick={() => handleFeedback('negative')}
          type="button"
          aria-label="This analysis was not helpful"
          className="flex items-center gap-2 px-6 py-3 sm:px-5 sm:py-2.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 transition-all active:scale-95 group"
        >
          <ThumbsDown className="w-4 h-4 text-red-500 group-hover:-rotate-12 transition-transform" />
          <span className="text-[11px] font-black uppercase tracking-wider text-gray-200">
            No
          </span>
        </button>
      </div>
    </div>
  );
}