import "./globals.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { GoogleTagManager } from "@next/third-parties/google";

/**
 * METADADOS GLOBAIS
 * Gerenciados pelo Next.js. Ele automaticamente injeta as tags corretas no <head>.
 */
export const metadata = {
  title: {
    default: "PRICELAB | Best Deals in USA",
    template: "%s | PRICELAB",
  },
  description:
    "Monitor price drops across major retailers like Best Buy and eBay in real-time. Find the lowest prices on smartphones, TVs, and tech accessories.",
  metadataBase: new URL("https://pricelab.tech"),
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
    icon: '/favicon.svg',
  },
  openGraph: {
    title: "PRICELAB | Best Deals in USA",
    description:
      "Monitor price drops across major retailers like Best Buy and eBay in real-time. Find the lowest prices on smartphones, TVs, and tech accessories.",
    url: "/",
    siteName: "PRICELAB",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PRICELAB | Best Deals in USA",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PRICELAB | Best Deals in USA",
    description:
      "Monitor price drops across major retailers like Best Buy and eBay in real-time. Find the lowest prices on smartphones, TVs, and tech accessories.",
    images: ["/og-image.png"],
  },
  verification: {
    google: "5B6jzxA3j90GUEuQro0cKSG0z3pQkuCnC210L7v-a2I",
  },
};

/**
 * ROOT LAYOUT V25
 * Estrutura mestre da aplicação. Gerencia Tags, Analytics e o esqueleto visual.
 */
export default function RootLayout({ children }) {
  // Puxa o ID da variável de ambiente - Seguro para produção
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  return (
    <html lang="en" className="h-full">
      {/* GTM precisa ficar o mais alto possível */}
      {gtmId && <GoogleTagManager gtmId={gtmId} />}

      {/* ✅ <head> manual voltando apenas para os preconnects de performance */}
      <head>
        <link rel="preconnect" href="https://pisces.bbystatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://i.ebayimg.com" crossOrigin="anonymous" />
      </head>

      <body className="antialiased bg-slate-50 flex flex-col min-h-screen m-0 p-0 overflow-x-hidden selection:bg-[#ffdb00] selection:text-black">
        {/* Header */}
        <Header />

        {/* MAIN */}
        <main className="flex-1 w-full relative min-h-[100dvh] flex flex-col">
          {children}
        </main>

        {/* Footer */}
        <Footer />

        {/* Analytics da Vercel no body */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}