"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SearchEntry from "./SearchEntry";

const TOP_SALES_CATEGORIES = [
  { name: "Laptops", slug: "laptops" },
  { name: "TVs", slug: "tvs" },
  { name: "Smartphones", slug: "smartphones" },
  { name: "Monitors", slug: "monitors" },
  { name: "Gaming", slug: "gaming-consoles" },
  { name: "Smartwatches", slug: "all-smartwatches" },
  { name: "Graphics Cards", slug: "video-cards" },
  { name: "Audio", slug: "audio-headphones" },
  { name: "Refrigerators", slug: "refrigerators" },
  { name: "Action Figures", slug: "action-figures" },
];

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (path) => pathname === path;

  return (
    <>
      {/* 1. HEADER PRINCIPAL */}
      <header
        id="site-header"
        className="bg-[#ffdb00] py-3 md:py-4 shadow-md relative z-50"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col lg:flex-row items-center gap-4">
          <div className="w-full lg:flex-1 flex items-center justify-between lg:justify-start">
            <button
              aria-label="Open navigation menu"
              onClick={() => setIsOpen(true)}
              className="text-gray-900 p-2 w-10 h-10 flex items-center justify-center bg-[#ffdb00] rounded-xl active:bg-black/5 transition-colors lg:hover:bg-black/5"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>

            <Link
              href="/"
              className="flex items-center gap-2 text-xl md:text-2xl font-black italic tracking-tighter text-gray-900 mx-auto lg:mx-0 shrink-0"
            >
              <svg
                className="w-6 h-6 md:w-8 md:h-8"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
              </svg>
              <span className="[text-shadow:1px_1px_2px_rgba(0,0,0,0.4)]">
                COMPARE
                <span className="text-white">
                  FLOW
                </span>
              </span>
            </Link>
            <div className="lg:hidden w-10"></div>
          </div>

          <div className="w-full lg:w-[500px] xl:w-[600px] shrink-0 flex justify-center">
            <SearchEntry />
          </div>

          <div className="hidden lg:block lg:flex-1"></div>
        </div>
      </header>

      {/* 2. NAV HORIZONTAL - CENTRALIZAÇÃO CORRIGIDA */}
      <nav className="hidden lg:block bg-white border-b w-full relative z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="flex items-center h-[56px]">
            {/* justify-between: Garante que o primeiro e último item encostem nas margens do max-7xl.
                            As margens laterais agora batem exatamente com o conteúdo acima.
                        */}
            <div className="flex items-center justify-between w-full text-[11px] xl:text-[12px] font-black uppercase tracking-wider">
              <Link
                href="/todays-deals"
                className={`transition-all whitespace-nowrap pb-1 border-b-2 shrink-0 ${isActive("/todays-deals") ? "border-red-600 text-red-600" : "border-transparent text-red-500 hover:text-red-600"}`}
              >
                Deals
              </Link>

              {/* Separador sutil */}
              <div className="h-4 w-px bg-slate-200 shrink-0"></div>

              {TOP_SALES_CATEGORIES.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/category/${cat.slug}`}
                  className={`transition-all whitespace-nowrap pb-1 border-b-2 shrink-0 ${isActive(`/category/${cat.slug}`) ? "border-[#ffdb00] text-black" : "border-transparent text-slate-500 hover:text-black"}`}
                >
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* 3. SIDEBAR MOBILE */}
      <div
        className={`fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm transition-opacity duration-300 ${isOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={`fixed top-0 left-0 h-full w-[280px] bg-white z-[70] transform transition-transform duration-500 shadow-2xl ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex justify-between items-center mb-8 pb-4 border-b">
            <span className="font-black italic text-xl uppercase tracking-tighter text-gray-900">
              Categories
            </span>
            <button
              aria-label="Close menu"
              onClick={() => setIsOpen(false)}
              className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full hover:bg-slate-100 transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-1 overflow-y-auto no-scrollbar">
            <Link
              href="/"
              className="px-4 py-3 rounded-xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/todays-deals"
              className="px-4 py-3 rounded-xl text-xs font-black uppercase text-red-500 hover:bg-red-50 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              Today's Deals
            </Link>

            <div className="my-4 border-t border-slate-50"></div>

            {TOP_SALES_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className={`px-4 py-3 rounded-xl text-xs font-black uppercase transition-colors ${isActive(`/category/${cat.slug}`) ? "bg-[#ffdb00]/10 text-black" : "text-slate-600 hover:bg-slate-50"}`}
                onClick={() => setIsOpen(false)}
              >
                {cat.name}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
