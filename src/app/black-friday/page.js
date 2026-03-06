// app/black-friday/page.js
// Versão completa (SEO + JSON-LD em @graph, igual ao padrão forte que tínhamos)
//
// Observações importantes:
// - WebPage/CollectionPage aponta mainEntity -> Event
// - FAQPage fica como hasPart do WebPage (e também referenciado via mainEntityOfPage)
// - Organization + WebSite + SearchAction para sitelinks search box
// - Tudo em um único bloco JSON-LD com @graph (mais limpo)
//
// Ajuste os imports conforme seu projeto:
import BlackFridayClient from "./BlackFridayClient";

export const revalidate = 3600;

export const metadata = {
  title: "Black Friday 2026 Deals – Verified US Discounts | CompareFlow",
  description:
    "Track real Black Friday 2026 deals across major US retailers. Verified price history, real-time monitoring, and direct checkout links.",
  alternates: {
    canonical: "https://compareflow.club/black-friday",
  },
  openGraph: {
    title: "Black Friday 2026 Deals – Verified US Discounts | CompareFlow",
    description:
      "Official Black Friday 2026 deal monitoring hub focused on verified US retailer discounts and real-time price tracking.",
    url: "https://compareflow.club/black-friday",
    siteName: "CompareFlow",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "https://compareflow.club/og/black-friday-2026.png",
        width: 1200,
        height: 630,
        alt: "Black Friday 2026 Deals – CompareFlow",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Black Friday 2026 Deals – Verified US Discounts | CompareFlow",
    description:
      "Track verified Black Friday 2026 deals with real-time price monitoring and historical price context.",
    images: ["https://compareflow.club/og/black-friday-2026.png"],
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
};

export default async function BlackFridayPage() {
  const year = 2026; // fixo para posicionamento forte
  const pageUrl = "https://compareflow.club/black-friday";
  const siteUrl = "https://compareflow.club";
  const logoUrl = "https://compareflow.club/logo.png"; // ajuste se necessário
  const heroImageUrl = "https://compareflow.club/og/black-friday-2026.png"; // ajuste se necessário

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      // -------------------------------------------------------
      // ORGANIZATION
      // -------------------------------------------------------
      {
        "@type": "Organization",
        "@id": `${siteUrl}#organization`,
        name: "CompareFlow",
        url: siteUrl,
        logo: {
          "@type": "ImageObject",
          url: logoUrl,
        },
      },

      // -------------------------------------------------------
      // WEBSITE + SEARCHACTION (Sitelinks Search Box)
      // -------------------------------------------------------
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        url: siteUrl,
        name: "CompareFlow",
        publisher: { "@id": `${siteUrl}#organization` },
        inLanguage: "en-US",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },

      // -------------------------------------------------------
      // BREADCRUMB
      // -------------------------------------------------------
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: siteUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: `Black Friday ${year}`,
            item: pageUrl,
          },
        ],
      },

      // -------------------------------------------------------
      // EVENT (Online US-focused)
      // -------------------------------------------------------
      {
        "@type": "Event",
        "@id": `${pageUrl}#event`,
        name: `Black Friday ${year}`,
        description:
          "Official Black Friday deal monitoring hub focused on verified US retailer discounts and real-time price tracking.",
        startDate: "2026-11-27T00:00:00-05:00",
        endDate: "2026-11-28T23:59:59-05:00",
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        inLanguage: "en-US",
        location: {
          "@type": "VirtualLocation",
          url: pageUrl,
        },
        organizer: { "@id": `${siteUrl}#organization` },
        image: heroImageUrl,
        audience: {
          "@type": "Audience",
          geographicArea: {
            "@type": "Country",
            name: "United States",
          },
        },
      },

      // -------------------------------------------------------
      // MAIN PAGE (WebPage + CollectionPage)
      // - mainEntity -> Event
      // - hasPart -> FAQPage
      // -------------------------------------------------------
      {
        "@type": ["WebPage", "CollectionPage"],
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: `Black Friday ${year} Deals – Verified US Discounts | CompareFlow`,
        description:
          `Track real Black Friday ${year} deals across major US retailers. Verified price history, real-time monitoring, and direct checkout links.`,
        isPartOf: { "@id": `${siteUrl}#website` },
        publisher: { "@id": `${siteUrl}#organization` },
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: heroImageUrl,
        },
        inLanguage: "en-US",
        audience: {
          "@type": "Audience",
          geographicArea: {
            "@type": "Country",
            name: "United States",
          },
        },
        about: [
          { "@type": "Thing", name: `Black Friday ${year}` },
          { "@type": "Thing", name: "US Retail Discounts" },
          { "@type": "Thing", name: "Price Comparison" },
          { "@type": "Thing", name: "Verified Deals" },
        ],
        mainEntity: { "@id": `${pageUrl}#event` },
        hasPart: [{ "@id": `${pageUrl}#faq` }],
      },

      // -------------------------------------------------------
      // FAQ (Rich Result ready)
      // - mainEntityOfPage -> WebPage
      // -------------------------------------------------------
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        url: pageUrl,
        inLanguage: "en-US",
        mainEntityOfPage: { "@id": `${pageUrl}#webpage` },
        mainEntity: [
          {
            "@type": "Question",
            name: `When is Black Friday ${year} in the United States?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: `Black Friday ${year} takes place on November 27, ${year}, the Friday after Thanksgiving in the United States.`,
            },
          },
          {
            "@type": "Question",
            name: "How does CompareFlow verify Black Friday deals?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "CompareFlow compares current retailer prices against historical price data and monitors real-time updates to identify genuine US discounts.",
            },
          },
          {
            "@type": "Question",
            name: "Are these official US retailers?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "Yes. CompareFlow links directly to official US retailer product pages for secure checkout and verified inventory.",
            },
          },
          {
            "@type": "Question",
            name: "What categories are tracked during Black Friday?",
            acceptedAnswer: {
              "@type": "Answer",
              text:
                "We track popular US consumer categories including laptops, gaming consoles, TVs, headphones, smart home devices, and more.",
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BlackFridayClient />
    </>
  );
}