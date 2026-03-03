/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    allowedDevOrigins: ["http://localhost:3000", "http://192.168.0.230:3000"],
  },

  // Configuração de imagens para permitir domínios externos
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pisces.bbystatic.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      // EBAY SANDBOX (O erro que você recebeu vinha daqui)
      {
        protocol: 'http', // Sandbox do eBay ainda usa HTTP para imagens
        hostname: 'i.ebayimg.sandbox.ebay.com',
        pathname: '/**',
      },
      // EBAY PRODUÇÃO (Já deixamos pronto para o futuro)
      {
        protocol: 'https',
        hostname: 'i.ebayimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'assets.adidas.com',
        pathname: '/**',
      },
         {
        protocol: 'https',
        hostname: 'hp.widen.net',
        pathname: '/**',
      }
    ],
    // Otimização adicional: permite que o Next.js escolha o melhor formato (WebP/AVIF) automaticamente
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;