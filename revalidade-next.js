// revalidate.js
const REVALIDATION_SECRET = process.env.REVALIDATION_SECRET; 
const BASE_URL = process.env.BASE_URL;

async function purgeCache() {
  console.log("🚀 Iniciando revalidação global do cache na Vercel...");

  // Lista de tags para limpar dados específicos
  const tagsToClean = ["products"]; 
  
  // Lista de caminhos para limpar a estrutura da página (limpeza total)
  const pathsToClean = ["/"];

  // 1. Revalidação por TAGS
  for (const tag of tagsToClean) {
    try {
      const response = await fetch(`${BASE_URL}/api/revalidate?tag=${tag}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${REVALIDATION_SECRET}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ Sucesso [Tag: ${tag}]: ${result.message}`);
      } else {
        console.error(`❌ Falha [Tag: ${tag}]: ${response.status} - ${result.message}`);
      }
    } catch (error) {
      console.error(`💥 Erro de rede ao tentar revalidar a tag ${tag}:`, error.message);
    }
  }

  // 2. Revalidação por PATH (Limpeza de cache de página)
  for (const path of pathsToClean) {
    try {
      const response = await fetch(`${BASE_URL}/api/revalidate?path=${path}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${REVALIDATION_SECRET}`,
          "Content-Type": "application/json",
        },
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ Sucesso [Path: ${path}]: ${result.message}`);
      } else {
        console.error(`❌ Falha [Path: ${path}]: ${response.status} - ${result.message}`);
      }
    } catch (error) {
      console.error(`💥 Erro de rede ao tentar revalidar o path ${path}:`, error.message);
    }
  }

  console.log("🏁 Processo de revalidação finalizado.");
}

// Executa a função
purgeCache();