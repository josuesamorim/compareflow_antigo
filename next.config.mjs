/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  experimental: {
    allowedDevOrigins: ["http://localhost:3000", "http://192.168.0.230:3000"],
  },

  images: {
    // Permite que o Next.js escolha o melhor formato automaticamente
    formats: ['image/avif', 'image/webp'],
    
    remotePatterns: [
      // --- AMAZON (Correção do Bug) ---
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images-na.ssl-images-amazon.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ir-na.amazon-adsystem.com',
        pathname: '/**',
      },

      // --- BEST BUY ---
      {
        protocol: 'https',
        hostname: 'pisces.bbystatic.com',
        pathname: '/**',
      },

      // --- EBAY (Produção e Sandbox) ---
      {
        protocol: 'https',
        hostname: 'i.ebayimg.com',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'i.ebayimg.sandbox.ebay.com',
        pathname: '/**',
      },

      // --- OUTROS VAREJISTAS ---
      {
        protocol: 'https',
        hostname: 'assets.adidas.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'hp.widen.net',
        pathname: '/**',
      },

      // --- PLACEHOLDERS ---
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;