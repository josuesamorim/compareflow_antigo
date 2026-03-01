import Link from 'next/link'; 

export default function Footer({ seoCategory, seoProduct }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-white pt-16 pb-8 px-6">
      {/* GRID PRINCIPAL */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-12 md:gap-12 mb-12 border-b border-gray-800 pb-12 text-center">
        
        {/* Branding - Ocupa as 2 colunas no mobile para ficar centralizado no topo */}
        <div className="col-span-2 md:col-span-1 space-y-4 flex flex-col items-center">
          <div className="text-xl md:text-2xl font-black italic text-white tracking-tighter">
            PRICE<span className="text-[#ffdb00] font-black">LAB</span>
          </div>
          <p className="text-[10px] md:text-xs leading-relaxed max-w-xs text-white uppercase font-bold tracking-tight">
            The ultimate destination for real-time price tracking across the biggest retailers in the USA.
          </p>
        </div>

        {/* Trending - Coluna 1 no Mobile */}
        <div className="flex flex-col items-center">
          <h4 className="text-white font-black mb-4 md:mb-6 text-[10px] md:text-xs uppercase tracking-[0.2em]">Trending</h4>
          <ul className="space-y-2 md:space-y-3 text-[11px] md:text-xs font-bold uppercase italic">
            <li><Link href="/black-friday" className="hover:text-[#ffdb00] transition text-white">Black Friday {currentYear}</Link></li>
            <li><Link href="/todays-deals" className="hover:text-[#ffdb00] transition text-white">Today's Deals</Link></li>
            <li><Link href="/category/smartphones" className="hover:text-[#ffdb00] transition text-white">Smartphones</Link></li>
            <li><Link href="/category/tvs" className="hover:text-[#ffdb00] transition text-white">Smart TVs</Link></li>
            <li><Link href="/category/video-cards" className="hover:text-[#ffdb00] transition text-white">PC Hardware</Link></li>
          </ul>
        </div>

        {/* Help & Info - Coluna 2 no Mobile */}
        <div className="flex flex-col items-center">
          <h4 className="text-white font-black mb-4 md:mb-6 text-[10px] md:text-xs uppercase tracking-[0.2em]">Help & Info</h4>
          <ul className="space-y-2 md:space-y-3 text-[11px] md:text-xs font-bold uppercase italic">
            <li><Link href="/how-it-works" className="hover:text-[#ffdb00] transition text-white">How it works</Link></li>
            <li><Link href="/privacy" className="hover:text-[#ffdb00] transition text-white">Privacy Policy</Link></li>
            <li><Link href="/shipping-policy" className="hover:text-[#ffdb00] transition text-white">Shipping Info</Link></li>
            <li><Link href="/return-policy" className="hover:text-[#ffdb00] transition text-white">Returns & Refunds</Link></li>
            <li><Link href="/about" className="hover:text-[#ffdb00] transition text-white">About Us</Link></li>
            <li><Link href="/contact" className="hover:text-[#ffdb00] transition text-white">Contact Us</Link></li>
            <li><Link href="/terms" className="hover:text-[#ffdb00] transition text-white">Terms of Use</Link></li>
          </ul>
        </div>
      </div>

      {/* SEÇÃO LEGAL - Centralizada com data-nosnippet para evitar que o Google use esses textos na busca */}
      <div className="max-w-5xl mx-auto space-y-10 text-center" data-nosnippet>
        <div className="space-y-3">
          <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Affiliate Disclosure</span>
          <p className="text-[12px] md:text-[13px] text-white/90 leading-relaxed max-w-4xl mx-auto italic">
            PRICELAB is a price comparison engine. We are a participant in affiliate advertising programs and we may earn a commission when you click on links to retailers and make a purchase, at no extra cost to you. We do not sell products directly.
          </p>
        </div>

        <div className="space-y-3">
          <span className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Legal Notice</span>
          <p className="text-[10px] md:text-[11px] text-white leading-relaxed max-w-3xl mx-auto uppercase tracking-wide">
            PRICELAB is an independent entity and is not owned, operated, or endorsed by the retailers we track. We believe in total transparency, which is why our business identity, physical location, and contact information are always available to our users and partners.
          </p>
          <p className="text-[10px] md:text-[11px] text-white uppercase tracking-wide">
            Use of this website is subject to our{" "}
            <Link href="/terms" className="underline hover:text-[#ffdb00]">Terms of Use</Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-[#ffdb00]">Privacy Policy</Link>.
          </p>
        </div>

        <div className="pt-6 border-t border-gray-800/50 space-y-4">
          <div className="text-[11px] font-black tracking-[0.5em] text-white uppercase italic">
            © {currentYear} PRICELAB.TECH
          </div>
          
          {/* INFORMAÇÕES DE CONTATO E ENDEREÇO OBRIGATÓRIAS PARA O GOOGLE - Também com data-nosnippet */}
          <div className="flex flex-col items-center space-y-2">
            
            
          </div>
        </div>
      </div>
    </footer>
  );
}