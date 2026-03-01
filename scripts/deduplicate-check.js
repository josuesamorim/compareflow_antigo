const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function simulateDeduplication() {
  console.log('🔍 [SIMULAÇÃO] Analisando duplicatas por UPC (Apenas Numéricos 12-14)...');

  try {
    // 1. Identifica os UPCs que aparecem em mais de um registro
    // ADICIONADO: upc ~ '^[0-9]{12,14}$' para validar o formato técnico
    const duplicates = await prisma.$queryRaw`
      SELECT upc, COUNT(*) as qtd
      FROM products
      WHERE upc IS NOT NULL 
        AND upc ~ '^[0-9]{12,14}$'
      GROUP BY upc
      HAVING COUNT(*) > 1
    `;

    if (duplicates.length === 0) {
      console.log('✅ Nenhuma duplicata com UPC numérico válido encontrada.');
      return;
    }

    console.log(`📊 Total de UPCs válidos duplicados encontrados: ${duplicates.length}\n`);
    console.log('------------------------------------------------------------');

    let totalToMove = 0;
    let totalToDelete = 0;

    for (const row of duplicates) {
      const { upc, qtd } = row;

      // Busca os detalhes dos produtos e suas lojas (listings)
      const entries = await prisma.product.findMany({
        where: { upc: upc },
        include: { 
          listings: {
            select: { store: true }
          }
        }
      });

      // Lógica de eleição do Vencedor (Golden Record)
      // Prioridade: BestBuy > AI Cleaned > Primeiro da lista
      let winner = entries.find(p => 
        p.listings.some(l => l.store.toLowerCase() === 'bestbuy')
      );

      if (!winner) {
        winner = entries.find(p => p.aiNameCleaned === true);
      }

      if (!winner) {
        winner = entries[0];
      }

      const losers = entries.filter(p => p.id !== winner.id);
      
      console.log(`UPC: ${upc} (${qtd} ocorrências)`);
      console.log(`  🏆 VENCEDOR SUGERIDO: [ID ${winner.id}] ${winner.name || 'Sem nome'}`);
      console.log(`     Lojas vinculadas: ${winner.listings.map(l => l.store).join(', ') || 'Nenhuma'}`);

      for (const loser of losers) {
        totalToDelete++;
        totalToMove += loser.listings.length;
        console.log(`  🗑️  SERIA REMOVIDO:  [ID ${loser.id}] ${loser.name || 'Sem nome'}`);
        console.log(`     Lojas para mover: ${loser.listings.map(l => l.store).join(', ') || 'Nenhuma'}`);
      }
      console.log('------------------------------------------------------------');
    }

    console.log('\n📈 RESUMO DA OPERAÇÃO:');
    console.log(`- Produtos que seriam deletados: ${totalToDelete}`);
    console.log(`- Listagens/Lojas que seriam migradas: ${totalToMove}`);
    console.log(`- Histórico de Preços preservados: Sim (via Migração de ID)`);
    console.log('\n⚠️  Nenhum dado foi alterado. Esta é apenas uma simulação.');

  } catch (error) {
    console.error('🚨 Erro na simulação:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

simulateDeduplication();