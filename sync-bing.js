// sync-bing.js
/**
 * Script de sincronização manual/automatizada para o Bing IndexNow.
 * Utiliza variáveis de ambiente para maior segurança e flexibilidade.
 */

const BING_SECRET = process.env.BING_SECRET;
const BING_URL_API = process.env.BING_URL_API;

async function forceSync() {
  console.log("🚀 Iniciando sincronização total com o Bing...");

  // Validação básica das credenciais antes do disparo
  if (!BING_SECRET) {
    console.error("❌ Erro: A variável INDEXNOW_SECRET não foi encontrada no ambiente.");
    return;
  }

  try {
    // --- LOTE 1 (0 a 10.000) ---
    console.log("📦 Disparando Lote 1...");
    const response1 = await fetch(BING_URL_API, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BING_SECRET}`,
        "Content-Type": "application/json"
      }
    });

    const data1 = await response1.json();
    if (response1.ok) {
      console.log("✅ Resposta Lote 1:", data1);
    }

    // Pequena pausa de 3 segundos para o banco respirar
    console.log("⏳ Aguardando para disparar o Lote 2...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // --- LOTE 2 (10.001 a 15.300+) ---
    // Usamos o parâmetro ?offset=10000 que configuramos na rota de API
    console.log("📦 Disparando Lote 2 (Offset 10000)...");
    const response2 = await fetch(`${BING_URL_API}?offset=10000`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${BING_SECRET}`,
        "Content-Type": "application/json"
      }
    });

    const data2 = await response2.json();
    if (response2.ok) {
      console.log("✅ Resposta Lote 2:", data2);
    } else {
      console.warn("⚠️ O servidor retornou um status de erro no Lote 2:", response2.status);
      console.log("Contexto do erro:", data2);
    }

  } catch (error) {
    console.error("❌ Falha crítica ao conectar com a API:", error.message);
  }
}

// Execução da função principal
forceSync();