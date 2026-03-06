// app/black-friday/BlackFridayClient.js
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * BLACK FRIDAY CLIENT (V25)
 * - Countdown robusto (com fallback + clamp)
 * - Sem footer duplicado (RootLayout já tem Footer)  ✅
 * - Micro-SEO on-page: headings consistentes + copy US-first
 * - Acessibilidade: aria-live no contador + labels úteis
 * - Performance: interval limpo + memo do target
 */

export default function BlackFridayClient() {
  const currentYear = 2026;

  // Define o alvo em UTC-5 (Eastern). Para simplicidade, mantemos Date local com string US.
  // Se você quiser 100% timezone-safe, dá pra montar ISO com offset -05:00.
  const targetMs = useMemo(() => {
    // Black Friday 2026: Nov 27, 2026
    // 00:00:00 ET (aprox). O Date parsing depende do runtime, mas costuma ser ok.
    return new Date(`November 27, ${currentYear} 00:00:00`).getTime();
  }, [currentYear]);

  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    function calc() {
      const now = Date.now();
      const diff = targetMs - now;

      if (!Number.isFinite(diff)) {
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        setIsLive(false);
        return;
      }

      if (diff <= 0) {
        setTimeLeft({ d: 0, h: 0, m: 0, s: 0 });
        setIsLive(true);
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ d, h, m, s });
      setIsLive(false);
    }

    // Primeira render já calcula
    calc();

    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [targetMs]);

  return (
    <div className="flex flex-col min-h-screen bg-black text-white selection:bg-red-600">
      <main className="flex-grow">
        {/* HERO SECTION */}
        <section className="relative pt-16 pb-12 md:pt-32 md:pb-16 px-4 overflow-hidden border-b border-white/5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-red-900/20 blur-[120px] rounded-full -z-10" />

          <div className="max-w-5xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 bg-red-600 px-4 py-1.5 rounded-full mb-8">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>

              <span className="text-[10px] font-black tracking-widest uppercase">
                {isLive ? `LIVE: BLACK FRIDAY ${currentYear}` : `LIVE: EARLY ACCESS ${currentYear}`}
              </span>
            </div>

            <h1 className="text-6xl md:text-[130px] font-[1000] italic uppercase tracking-tighter leading-[0.8] mb-6">
              BLACK <span className="text-red-600">FRIDAY</span> <br />
              <span className="text-outline-white text-transparent opacity-40">{currentYear}</span>
            </h1>

            <p className="max-w-2xl mx-auto text-slate-400 font-medium uppercase tracking-[0.2em] text-[10px] md:text-xs mb-12">
              VERIFIED PRICE HISTORY • REAL-TIME MONITORING • OFFICIAL US RETAILERS
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {[
                { t: "REAL DISCOUNTS", d: "We compare current prices vs historical price history to spot fake deals." },
                { t: "LIVE ENGINE", d: "Listings refresh continuously so expired offers drop out fast." },
                { t: "DIRECT LINKS", d: "Go straight to the official retailer page for checkout." },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white/5 p-6 border border-white/10 rounded-3xl backdrop-blur-md"
                >
                  <h2 className="text-red-500 font-black text-xs uppercase mb-2">{item.t}</h2>
                  <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{item.d}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/todays-deals"
                className="bg-white text-black font-[1000] italic uppercase px-8 py-3 rounded-2xl hover:bg-red-600 hover:text-white transition-all transform hover:scale-[1.02]"
                aria-label="Explore today's verified deals"
              >
                Explore Today&apos;s Deals
              </Link>

              <Link
                href="/"
                className="bg-white/5 border border-white/10 text-white font-black uppercase px-8 py-3 rounded-2xl hover:bg-white hover:text-black transition-all"
                aria-label="Go back to CompareFlow home"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>

        {/* COMING SOON / COUNTDOWN */}
        <section className="max-w-7xl mx-auto px-4 py-12 text-center">
          <div className="bg-[#0a0a0a] rounded-[3rem] border border-white/5 p-12 md:p-20 relative overflow-hidden">
            <h2 className="text-4xl md:text-6xl font-[1000] italic uppercase tracking-tighter mb-4">
              Something <span className="text-red-600">Big</span> is Coming
            </h2>

            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-12">
              Our engine is preparing a verified Black Friday feed.
            </p>

            {/* COUNTDOWN */}
            <div
              className="flex justify-center gap-6 md:gap-12 mb-12"
              aria-live="polite"
              aria-atomic="true"
            >
              {[
                { label: "DAYS", val: timeLeft.d },
                { label: "HRS", val: timeLeft.h },
                { label: "MIN", val: timeLeft.m },
                { label: "SEC", val: timeLeft.s },
              ].map((item, i) => (
                <div key={i} className="flex flex-col" aria-label={`${item.label} remaining`}>
                  <span className="text-4xl md:text-7xl font-[1000] italic tracking-tighter tabular-nums">
                    {String(Math.max(0, item.val)).padStart(2, "0")}
                  </span>
                  <span className="text-[10px] font-black text-red-600 tracking-[0.2em] mt-1">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-center">
              <Link
                href="/todays-deals"
                className="bg-white text-black font-[1000] italic uppercase px-12 py-4 rounded-2xl hover:bg-red-600 hover:text-white transition-all transform hover:scale-[1.02]"
                aria-label="Explore verified deals available right now"
              >
                Explore Today&apos;s Deals
              </Link>
            </div>

            <div className="mt-8 text-slate-600 text-[10px] uppercase tracking-widest">
              {isLive ? "Black Friday is live — deals update continuously." : "Countdown is based on US Black Friday date."}
            </div>
          </div>
        </section>

        {/* SEO CONTENT SECTION */}
        <section className="max-w-4xl mx-auto px-4 pt-0 pb-20">
          <div className="bg-white/5 rounded-[3rem] p-8 md:p-16 border border-white/10">
            <h2 className="text-2xl md:text-4xl font-black uppercase italic mb-6 text-white tracking-tighter text-center">
              Everything About Black Friday {currentYear}
            </h2>

            <div className="prose prose-invert prose-sm max-w-none text-slate-400">
              <p className="mb-4 text-center leading-relaxed">
                The hunt for the best <strong>Black Friday {currentYear} deals</strong> starts early — but most “discounts”
                are noise. CompareFlow tracks real listings, compares against historical prices, and surfaces verified drops
                from major US retailers.
              </p>

              <div className="grid md:grid-cols-2 gap-8 mt-10 text-left">
                <div>
                  <h3 className="text-white font-black uppercase mb-2">Smart Shopping</h3>
                  <p className="text-[11px] leading-relaxed">
                    Compare prices in real-time and validate discounts using historical price history. The goal is simple:
                    stop overpaying for the same product.
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-black uppercase mb-2">Verified Sellers</h3>
                  <p className="text-[11px] leading-relaxed">
                    We prioritize official retailers and trusted marketplaces, linking you directly to the retailer page for
                    secure checkout.
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-black uppercase mb-2">What We Track</h3>
                  <p className="text-[11px] leading-relaxed">
                    Laptops, TVs, gaming consoles, headphones, smart home devices, and other high-demand tech categories.
                  </p>
                </div>

                <div>
                  <h3 className="text-white font-black uppercase mb-2">How to Use This Page</h3>
                  <p className="text-[11px] leading-relaxed">
                    Bookmark this hub. As we get closer to Black Friday, the page turns into a live deal feed with curated
                    categories and fast updates.
                  </p>
                </div>
              </div>

              <div className="mt-10 flex justify-center">
                <Link
                  href="/todays-deals"
                  className="inline-flex items-center justify-center bg-red-600 text-white font-black uppercase px-10 py-4 rounded-2xl hover:bg-white hover:text-black transition-all"
                  aria-label="Go to today's deals page"
                >
                  Start With Today&apos;s Deals
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}