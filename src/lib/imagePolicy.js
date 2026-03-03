export const ALLOWED_IMAGE_HOSTS = new Set([
  "pisces.bbystatic.com",
  "placehold.co",
  "i.ebayimg.sandbox.ebay.com",
  "i.ebayimg.com",
  "assets.adidas.com",
  "hp.widen.net",
]);

export function shouldOptimizeImage(url) {
  try {
    const u = new URL(url);
    return ALLOWED_IMAGE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// Falta configurar os componentes. Nao esta sendo usado em lugar nenhum ainda.
// O objetivo e nao dar erro quando uma imagem vir de um dominio ainda nao autorizado.
// import Image from "next/image";
// import { shouldOptimizeImage } from "@/lib/imagePolicy";

// const optimize = shouldOptimizeImage(imageUrl);

// <Image
//   src={imageUrl}
//   alt={title}
//   width={500}
//   height={500}
//   unoptimized={!optimize}
// />