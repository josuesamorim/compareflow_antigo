/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,

  experimental: {
    allowedDevOrigins: [
      "http://localhost:3000",
      "http://192.168.0.230:3000",
    ],
  },

  images: {
    unoptimized: true,

    remotePatterns: [
      // AMAZON
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ir-na.amazon-adsystem.com",
        pathname: "/**",
      },

      // BEST BUY
      {
        protocol: "https",
        hostname: "pisces.bbystatic.com",
        pathname: "/**",
      },

      // EBAY
      {
        protocol: "https",
        hostname: "i.ebayimg.com",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "i.ebayimg.sandbox.ebay.com",
        pathname: "/**",
      },

      // OUTROS VAREJISTAS
      {
        protocol: "https",
        hostname: "assets.adidas.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "hp.widen.net",
        pathname: "/**",
      },

      // PLACEHOLDER
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;