import Link from 'next/link';
// Importando os ícones da Lucide que combinam com seus passos
import { RefreshCw, Filter, ShoppingCart, HandCoins } from 'lucide-react';

// OTIMIZAÇÃO: Como removemos o Redis, não precisamos mais de 'force-dynamic'.
// O Next.js pode gerar esta página de forma estática (SSG) para performance máxima.
export const dynamic = 'auto';

/**
 * PÁGINA HOW IT WORKS - V25
 * Explica o funcionamento do PRICELAB e cumpre requisitos de transparência do Google.
 * Removido o wrapper <Layout> pois agora utilizamos o Root Layout global.
 */
export default async function HowItWorks() {
  /**
   * OBSERVAÇÃO: Lógica de Redis (cacheKey e warm-up) removida.
   * Páginas de conteúdo estático como esta são servidas de forma mais eficiente
   * através da infraestrutura nativa do Next.js/Vercel.
   */

  const steps = [
    {
      number: "01",
      title: "Real-Time Tracking",
      description: "Our algorithm monitors over 50+ major US retailers every minute to find price drops.",
      icon: <RefreshCw size={24} />
    },
    {
      number: "02",
      title: "Compare & Filter",
      description: "We organize shipping costs, cashback offers, and stock status in one single view.",
      icon: <Filter size={24} />
    },
    {
      number: "03",
      title: "Grab the Deal",
      description: "Once you find the best price, we redirect you to the official retailer to finish your purchase.",
      icon: <ShoppingCart size={24} />
    }
  ];

  return (
    <div className="bg-white min-h-screen">
      {/* HERO SECTION DA PÁGINA */}
      <section className="bg-gray-900 py-20 px-6 text-center relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-[#ffdb00]"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <h1 className="text-4xl md:text-6xl font-black italic uppercase text-white leading-none mb-6 tracking-tighter">
            Smart Shopping <br/> <span className="text-[#ffdb00]">Simplified.</span>
          </h1>
          <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs">
            We do the math. You get the savings.
          </p>
        </div>
      </section>

      {/* DIAGRAMA DE FLUXO DE DADOS */}
      

      {/* PASSOS - GRID */}
      <section className="max-w-7xl mx-auto py-20 px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {steps.map((step, i) => (
            <div key={i} className="relative group p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 hover:shadow-2xl transition-all duration-500">
              <div className="text-6xl font-black text-gray-200 absolute top-4 right-8 group-hover:text-[#ffdb00]/20 transition-colors pointer-events-none italic">
                {step.number}
              </div>
              <div className="w-14 h-14 bg-gray-900 text-[#ffdb00] rounded-2xl flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform">
                {step.icon}
              </div>
              <h3 className="text-xl font-black uppercase italic text-gray-900 mb-4 tracking-tight">{step.title}</h3>
              <p className="text-slate-500 font-medium leading-relaxed text-sm">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* SEÇÃO DE TRANSPARÊNCIA DE AFILIADOS (COMPLIANCE GOOGLE & FTC) */}
      <section className="max-w-5xl mx-auto mb-20 px-6">
        <div className="bg-[#ffdb00] rounded-[3rem] p-8 md:p-16 flex flex-col md:flex-row items-center gap-10 shadow-xl border-4 border-black/5">
          <div className="flex-1 text-left">
            <h2 className="text-3xl font-black uppercase italic leading-none mb-4 text-gray-900 tracking-tighter">
              Is it free for me?
            </h2>
            <p className="text-gray-900 font-bold opacity-90 leading-snug text-sm md:text-base">
              Yes! 100% free for users. We earn a small commission from the retailers when you purchase through our links. This **never** changes the price you pay, but it helps us maintain our servers and real-time tracking algorithms.
            </p>
          </div>
          <div className="shrink-0">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-inner border-4 border-gray-900/5">
                  <HandCoins size={40} className="text-gray-900" />
              </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-20 text-center border-t border-slate-100 bg-slate-50/50">
        <div className="max-w-xl mx-auto px-6">
          <h2 className="text-2xl font-black uppercase italic text-gray-900 mb-8 tracking-tight">Ready to find your next deal?</h2>
          <Link href="/todays-deals" prefetch={true}>
            <button className="bg-gray-900 text-white px-12 py-5 rounded-2xl font-black uppercase text-xs tracking-[0.2em] hover:bg-[#ffdb00] hover:text-black transition-all active:scale-95 shadow-lg">
              Start Searching Now
            </button>
          </Link>
        </div>
      </section>
    </div>
  );
}