import { prisma } from "../../../lib/prisma.js";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('t');
  const secretToken = process.env.GOOGLE_SHOPPING_TOKEN;

  // Validação de segurança via Token do .env
  if (!secretToken || token !== secretToken) {
    return new NextResponse(JSON.stringify({ 
      error: "Unauthorized", 
      message: "Token inválido ou ausente." 
    }), { 
      status: 401, 
      headers: { "Content-Type": "application/json" } 
    });
  }

  const baseUrl = "https://pricelab.tech";

  try {
    /**
     * V25 SCHEMA FIX:
     * Buscamos os produtos incluindo suas Listings (ofertas ativas).
     * O feed do Google deve ser baseado nas ofertas reais das lojas.
     */
    const products = await prisma.product.findMany({
      where: {
        slug: { not: null },
        listings: {
          some: {
            isExpired: false,
            onlineAvailability: true,
            image: { not: null, not: "" }
          }
        }
      },
      include: {
        listings: {
          where: {
            isExpired: false,
            onlineAvailability: true
          },
          orderBy: {
            salePrice: 'asc' // O Google Shopping sempre prioriza o menor preço
          }
        }
      },
      orderBy: {
        lastUpdated: 'desc'
      }
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
      <channel>
        <title>PRICELAB Product Feed - USD Global</title>
        <link>${baseUrl}</link>
        <description>Technical product specifications and pricing data</description>
        <language>en-us</language>`;

    products.forEach((product) => {
      // No V25, pegamos a melhor oferta disponível (Best Listing)
      const bestListing = product.listings[0];
      
      if (!bestListing) return;

      // Garantia de Imagem: Prioriza a imagem da oferta (Listing), fallback para a do produto mestre
      const productImage = bestListing.image || product.image;

      if (!productImage || productImage === "" || productImage === "null") {
        return;
      }

      // Preço: Sempre X.XX USD
      const priceValue = bestListing.salePrice || bestListing.regularPrice || "0.00";
      const formattedPrice = `${parseFloat(priceValue).toFixed(2)} USD`;
      
      const name = product.name || "";
      const category = (product.internalCategory || "").toLowerCase();
      const brandName = product.brand || "Generic";
      
      // Condição padronizada para o Google
      let gCondition = "new"; 
      const dbCondition = (bestListing.condition || "").toLowerCase();

      if (dbCondition.includes("refurbished") || dbCondition.includes("renewed")) {
        gCondition = "refurbished";
      } else if (dbCondition.includes("used") || dbCondition.includes("pre-owned") || dbCondition.includes("open-box")) {
        gCondition = "used";
      } else {
        gCondition = "new"; 
      }

      // Tratamento de Resolução de Imagem (BestBuy logic)
      let highResImage = productImage;
      if (highResImage.includes("bbystatic.com")) {
        highResImage = highResImage
          .replace(/\/prescaled\/\d+\/\d+\//, "/prescaled/1000/1000/")
          .replace(/(_s|_sa|_m)\.jpg$/, "_cv.jpg");
      }

      const isApparel = category.includes("glass") || 
                        category.includes("eyewear") || 
                        category.includes("watch") || 
                        category.includes("clothing") ||
                        category.includes("apparel");

      const detectedColor = extractColor(name);

      // Descrição Técnica Dinâmica: Prioriza dados da Listing (V25 armazena specs na listing)
      let technicalSpecs = [];
      const specsSource = bestListing.rawDetails || product.rawDetails;

      if (specsSource && typeof specsSource === 'object') {
        const forbiddenKeys = [
          'brand', 'condition', 'upc', 'sku', 'gtin', 'mpn', 'price', 'name', 
          'sync', 'timestamp', 'lastupdated', 'fetched', 'internal'
        ];

        Object.entries(specsSource).forEach(([key, value]) => {
          if (technicalSpecs.length >= 15) return;
          const lowerKey = key.toLowerCase();
          const lowerVal = String(value).toLowerCase();
          if (forbiddenKeys.some(f => lowerKey.includes(f)) || !value || lowerVal === "null") return;

          const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          technicalSpecs.push(`${formattedKey}: ${value}`);
        });
      }

      const finalDescription = technicalSpecs.length > 0 
        ? technicalSpecs.join(" | ") 
        : `Product Category: ${product.internalCategory || "General"}`;
      
      const googleCategory = getGoogleCategory(category);

      xml += `
        <item>
          <g:id>${bestListing.id}</g:id>
          <g:title>${escapeXml(name)}</g:title>
          <g:description>${escapeXml(finalDescription)}</g:description>
          <g:link>${escapeXml(`${baseUrl}/product/${product.slug}`)}</g:link>
          <g:image_link>${escapeXml(highResImage)}</g:image_link>
          <g:brand>${escapeXml(brandName)}</g:brand>
          <g:condition>${gCondition}</g:condition>
          <g:availability>in_stock</g:availability>
          <g:price>${formattedPrice}</g:price>
          <g:product_type>${escapeXml(product.internalCategory || "General")}</g:product_type>
          <g:google_product_category>${googleCategory}</g:google_product_category>
          
          ${isApparel ? `
          <g:color>${escapeXml(detectedColor)}</g:color>
          <g:gender>unisex</g:gender>
          <g:age_group>adult</g:age_group>
          ` : ''}

          ${/* Identificadores V25: UPC do Produto ou SKU da Listing */ ''}
          ${product.upc ? `<g:gtin>${product.upc}</g:gtin>` : ''}
          ${bestListing.sku ? `<g:mpn>${bestListing.sku}</g:mpn>` : ''}
          <g:identifier_exists>${(product.upc || bestListing.sku) ? 'true' : 'false'}</g:identifier_exists>
        </item>`;
    });

    xml += `
      </channel>
    </rss>`;

    return new NextResponse(xml, {
      headers: { 
        "Content-Type": "application/xml",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    });
  } catch (error) {
    console.error("Feed Error:", error);
    return new NextResponse("<?xml version='1.0'?><error>Internal Server Error</error>", { 
      status: 500,
      headers: { "Content-Type": "application/xml" }
    });
  }
}

function escapeXml(unsafe) {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

function extractColor(name) {
  const colors = ["Black", "Blue", "White", "Red", "Silver", "Gold", "Grey", "Pink", "Green", "Cosmic Blue", "Sapphire"];
  const found = colors.find(c => name.toLowerCase().includes(c.toLowerCase()));
  return found || "Multicolor";
}

function getGoogleCategory(internalCat) {
  const cat = internalCat.toLowerCase();
  if (cat.includes("laptop") || cat.includes("notebook")) return "278"; 
  if (cat.includes("phone") || cat.includes("mobile") || cat.includes("smartphone")) return "267";
  if (cat.includes("tablet") || cat.includes("ipad")) return "473";
  if (cat.includes("headphone") || cat.includes("earbud") || cat.includes("audio")) return "4476";
  if (cat.includes("camera") || cat.includes("dslr") || cat.includes("video")) return "152";
  if (cat.includes("tv") || cat.includes("television") || cat.includes("monitor")) return "3071";
  if (cat.includes("game") && !cat.includes("console")) return "1279";
  if (cat.includes("video game") || cat.includes("console") || cat.includes("playstation") || cat.includes("xbox") || cat.includes("nintendo")) return "2313";
  if (cat.includes("drone") || cat.includes("rc")) return "4809";
  if (cat.includes("watch") || cat.includes("smartwatch")) return "512";
  if (cat.includes("sunglass") || cat.includes("eyewear") || cat.includes("glass")) return "178";
  if (cat.includes("shoe") || cat.includes("sneaker") || cat.includes("footwear")) return "187";
  if (cat.includes("bag") || cat.includes("backpack") || cat.includes("handbag")) return "100";
  if (cat.includes("clothing") || cat.includes("apparel") || cat.includes("shirt")) return "1604";
  if (cat.includes("dishwasher") || cat.includes("washer") || cat.includes("dryer") || cat.includes("refrigerator")) return "612";
  if (cat.includes("kitchen") || cat.includes("appliance")) return "536";
  if (cat.includes("smart home") || cat.includes("assistant")) return "4433";
  return "222"; 
}