/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["10.0.0.39", "localhost", "127.0.0.1"],

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "m.media-amazon.com", pathname: "/**" },
      { protocol: "https", hostname: "images-na.ssl-images-amazon.com", pathname: "/**" },
      { protocol: "https", hostname: "ir-na.amazon-adsystem.com", pathname: "/**" },
      { protocol: "https", hostname: "pisces.bbystatic.com", pathname: "/**" },
      { protocol: "https", hostname: "i.ebayimg.com", pathname: "/**" },
      { protocol: "http", hostname: "i.ebayimg.sandbox.ebay.com", pathname: "/**" },
      { protocol: "https", hostname: "assets.adidas.com", pathname: "/**" },
      { protocol: "https", hostname: "hp.widen.net", pathname: "/**" },
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
    ],
  },
};

export default nextConfig;