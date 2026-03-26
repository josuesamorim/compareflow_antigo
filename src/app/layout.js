import "./globals.css";

import Header from "../components/Header";
import Footer from "../components/Footer";
import { GoogleTagManager } from "@next/third-parties/google";
import Script from "next/script";

/**
 * LISTA DE CATEGORIAS FIXAS (Temporário)
 * Extraído do seu script de classificação para garantir consistência.
 */
const CATEGORIAS_PERMITIDAS = [
  'smartphones',
'laptops',
'gaming',
'tvs',
'smart-home',
'wearables',
'audio',
'home-theater',
'cameras',
'appliances',
'drones',
'clothing',
'shoes',
'toys-collectibles',
'sports-fitness',
'health-personal-care',
'accessories',
'security',
'desktops',
'printers',
'office',
'automotive-electronics',
'luggage-bags',
'mobility',
'power-solar',
'musical-instruments',
'pet-supplies',
'outdoor-garden',
'giftcards',
'services-warranties',
'others'
];

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

export default async function RootLayout({ children }) {
  const isProd = process.env.NODE_ENV === "production";
  const gtmId = isProd ? process.env.NEXT_PUBLIC_GTM_ID : null;

  /**
   * ✅ MODO TEMPORÁRIO:
   * Mapeamos as categorias permitidas para o formato que o Header espera.
   * Não fazemos chamadas ao banco (Prisma) para economizar recursos 
   * enquanto o banco está sendo populado/corrigido.
   */
  const dbCategories = CATEGORIAS_PERMITIDAS.map(cat => ({
    slug: cat,
    count: 0 // Como é estático, definimos count como 0
  }));

  return (
    <html lang="en" className="h-full">
      {gtmId && <GoogleTagManager gtmId={gtmId} />}

      <head>
        <link rel="preconnect" href="https://pisces.bbystatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://i.ebayimg.com" crossOrigin="anonymous" />
      </head>

      <body className="antialiased bg-slate-50 flex flex-col min-h-screen m-0 p-0 overflow-x-hidden selection:bg-[#ffdb00] selection:text-black">
        
        {/* ✅ O Header recebe agora a lista fixa sincronizada com o classificador AI */}
        <Header dbCategories={dbCategories} />

        <main className="flex-1 w-full relative min-h-[100dvh] flex flex-col">
          {children}
        </main>
        
        <Script id="ebay-epn-config" strategy="afterInteractive">
          {`window._epn = {campaign: 5339143879};`}
        </Script>
        <Script
          src="https://epnt.ebay.com/static/epn-smart-tools.js"
          strategy="afterInteractive"
        />

        <Footer />
      </body>
    </html>
  );
}