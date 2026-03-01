import Link from 'next/link';

// OTIMIZAÇÃO: Com a remoção do Redis, não precisamos mais de 'force-dynamic'.
// O Next.js agora pode pré-renderizar esta página como estática (SSG), 
// servindo-a instantaneamente a partir da rede de borda (Edge).
export const dynamic = 'auto';

/**
 * PÁGINA DE CONTATO - V25
 * Ponto de contato oficial para usuários e parceiros.
 * Removido o wrapper <Layout> pois agora utilizamos o Root Layout global.
 */
export default async function Contact() {
  /**
   * OBSERVAÇÃO: Lógica de Redis (cacheKey e warm-up) removida.
   * Páginas de contato não requerem cache de banco de dados, sendo mais 
   * estáveis quando tratadas de forma nativa pelo Next.js.
   */

  return (
    <div className="bg-slate-50 min-h-screen flex flex-col items-center justify-center">
      <div className="max-w-3xl mx-auto py-20 px-6 text-center">
        {/* Título com Identidade Visual PRICELAB */}
        <h1 className="text-4xl md:text-6xl font-black italic uppercase mb-4 text-gray-900 tracking-tighter">
          Contact <span className="text-blue-700">Us</span>
        </h1>
        <p className="text-gray-500 mb-12 uppercase font-bold text-xs md:text-sm tracking-[0.2em]">
          Questions about a deal or partnership?
        </p>
        
        {/* Container principal centralizado */}
        <div className="bg-gray-900 text-white p-10 md:p-16 rounded-[2.5rem] md:rounded-[4rem] shadow-2xl flex flex-col items-center relative overflow-hidden border-b-8 border-[#ffdb00]">
          {/* Elemento Decorativo de Background */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
          
          <p className="text-slate-400 uppercase text-[10px] font-black tracking-[0.3em] mb-4 w-full relative z-10">
            Official Inquiry Channel
          </p>
          
          {/* Link de e-mail com tratamento para mobile (break-all) */}
          <a 
            href="mailto:pricelab.tech@gmail.com" 
            className="block w-full text-center text-xl md:text-4xl font-black text-[#ffdb00] hover:text-white transition-all duration-300 break-all md:break-normal relative z-10 italic"
          >
            pricelab.tech@gmail.com
          </a>

          <div className="mt-12 pt-10 border-t border-white/10 flex flex-col md:flex-row justify-center gap-10 md:gap-16 w-full relative z-10">
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Response Time</p>
              <p className="font-bold text-lg">Within 24 Hours</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Service Area</p>
              <p className="font-bold text-lg">USA / Remote</p>
            </div>
          </div>
        </div>

        {/* Link de Retorno Rápido */}
        <div className="mt-12">
          <Link href="/" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-gray-900 transition-colors">
            ← Back to Price Tracking
          </Link>
        </div>
      </div>
    </div>
  );
}