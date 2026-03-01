const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runDeduplication() {
  console.log('🚀 [EXECUÇÃO] Iniciando deduplicação real por UPC (Apenas Numéricos 12-14)...');

  try {
    // 1. Busca os UPCs duplicados seguindo a regra estrita de formato numérico
    // O operador !~ '^[0-9]{12,14}$' garante que pegamos apenas códigos válidos
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

    console.log(`📊 Processando ${duplicates.length} grupos de UPCs válidos duplicados...\n`);

    for (const row of duplicates) {
      const { upc } = row;

      // 2. Busca os produtos e suas listagens
      const entries = await prisma.product.findMany({
        where: { upc: upc },
        include: { listings: true }
      });

      // 3. Eleição do Vencedor (BestBuy > AI Cleaned > Primeiro da lista)
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

      console.log(`\n🏆 VENCEDOR: ID ${winner.id} | UPC: ${upc}`);

      // Transação para garantir segurança total dos dados
      await prisma.$transaction(async (tx) => {
        for (const loser of losers) {
          // 4. Mover as listagens para o vencedor (Preserva PriceHistory via ID da Listing)
          if (loser.listings.length > 0) {
            await tx.listing.updateMany({
              where: { productId: loser.id },
              data: { productId: winner.id }
            });
            console.log(`   🚚 Movidas ${loser.listings.length} listagens do ID ${loser.id}`);
          }

          // 5. Deletar o produto duplicado
          // Devido ao onDelete: Cascade, as listagens órfãs seriam deletadas, 
          // mas como as movemos acima, elas estão seguras com o vencedor.
          await tx.product.delete({
            where: { id: loser.id }
          });
          console.log(`   🗑️  Produto ID ${loser.id} removido.`);
        }
      });
    }

    console.log('\n✅ OPERAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('✨ Seu banco de dados agora está unificado e limpo.');

  } catch (error) {
    console.error('🚨 ERRO CRÍTICO NA EXECUÇÃO:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runDeduplication();