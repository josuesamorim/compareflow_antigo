import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleTagManager } from "@next/third-parties/google";
import Script from "next/script"; 
import { prisma } from "../lib/prisma";

/**
 * METADADOS GLOBAIS
 * Gerenciados pelo Next.js. Ele automaticamente injeta as tags corretas no <head>.
 */
export const metadata = {
  title: {
    default: "CompareFlow | Best Deals in USA",
    template: "%s | CompareFlow",
  },
  description:
    "Monitor price drops across major retailers like Best Buy and eBay in real-time. Find the lowest prices on smartphones, TVs, and tech accessories.",
  metadataBase: new URL("https://www.compareflow.club"),
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // ✅ Favicon adicionado via Metadata API
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "CompareFlow | Best Deals in USA",
    description:
      "Monitor price drops across major retailers like Best Buy and eBay in real-time. Find the lowest prices on smartphones, TVs, and tech accessories.",
    url: "/",
    siteName: "CompareFlow",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/capa.png",
        width: 1200,
        height: 630,
        alt: "CompareFlow | Best Deals in USA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CompareFlow | Best Deals in USA",
    description:
      "Monitor price drops across major retailers like Best Buy and eBay in real-time. Find the lowest prices on smartphones, TVs, and tech accessories.",
    images: ["/capa.png"],
  },
  verification: {
    google: "5B6jzxA3j90GUEuQro0cKSG0z3pQkuCnC210L7v-a2I",
  },
};

/**
 * ROOT LAYOUT V25
 * Estrutura mestre da aplicação. Gerencia Tags, Analytics e o esqueleto visual.
 */

// ✅ Mudança 1: Adicionamos o "async" aqui
export default async function RootLayout({ children }) {
  // ✅ Só carrega analytics em PRODUÇÃO (Vercel / build prod)
  const isProd = process.env.NODE_ENV === "production";

  // ✅ Só lê GTM se estiver em prod (e se existir)
  const gtmId = isProd ? process.env.NEXT_PUBLIC_GTM_ID : null;

  // ✅ Mudança 2: Busca as categorias dinâmicas no banco (Prisma)
  let dbCategories = [];
  try {
    const group = await prisma.product.groupBy({
      by: ['internalCategory'],
      _count: {
        internalCategory: true,
      },
      where: {
        internalCategory: { not: null }
      },
      orderBy: {
        _count: {
          internalCategory: 'desc' // Ordena pelas categorias que têm mais produtos
        }
      }
    });

    dbCategories = group.map(g => ({
      slug: g.internalCategory,
      count: g._count.internalCategory
    }));
  } catch (error) {
    console.error("Erro ao buscar categorias no banco:", error);
    // Fallback de segurança caso o banco fique offline temporariamente
    dbCategories = [
      { slug: "laptops" }, { slug: "smartphones" }, { slug: "tv-home-theater" }
    ];
  }

  return (
    <html lang="en" className="h-full">
      {/* ✅ GTM só carrega em produção e se tiver ID */}
      {gtmId && <GoogleTagManager gtmId={gtmId} />}

      <head>
        <link
          rel="preconnect"
          href="https://pisces.bbystatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://i.ebayimg.com"
          crossOrigin="anonymous"
        />
      </head>

      <body className="antialiased bg-slate-50 flex flex-col min-h-screen m-0 p-0 overflow-x-hidden selection:bg-[#ffdb00] selection:text-black">
        
        {/* ✅ Mudança 3: Passamos as categorias do banco como prop para o Header */}
        <Header dbCategories={dbCategories} />

        {/* MAIN */}
        <main className="flex-1 w-full relative min-h-[100dvh] flex flex-col">
          {children}
        </main>
        
        {/* Script do eBay Partner Network */}
        <Script id="ebay-epn-config" strategy="afterInteractive">
          {`window._epn = {campaign: 5339143879};`}
        </Script>
        <Script
          src="https://epnt.ebay.com/static/epn-smart-tools.js"
          strategy="afterInteractive"
        />

        {/* Footer */}
        <Footer />

        {/* ✅ Vercel Analytics só em produção */}
        {isProd && (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        )}
      </body>
    </html>
  );
}