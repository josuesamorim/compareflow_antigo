import React from 'react';

// Adicionada a prop productName para enriquecer os dados do Analytics
export default function OfferComparisonList({ offers, productName }) {
  if (!offers || offers.length === 0) {
    return (
      <div className="bg-white p-12 rounded-[2.5rem] text-center border-2 border-dashed border-slate-100">
        <p className="font-black text-slate-400 uppercase italic text-[10px] tracking-[0.2em]">
          No competitive offers found at this moment
        </p>
      </div>
    );
  }

  /**
   * TRAVA DE SEGURANÇA FRONTEND
   * Garante que ofertas expiradas ou sem estoque sejam sumariamente ignoradas,
   * mesmo que tenham passado pelo cache da API.
   */
  const validOffers = offers.filter(offer => {
    // Se isExpired for explicitamente true, ou onlineAvailability explicitamente false, descarta.
    // Aceita undefined como válido caso a API não tenha enviado o campo (fallback)
    if (offer.isExpired === true) return false;
    if (offer.onlineAvailability === false) return false;
    return true;
  });

  // Se após filtrar não sobrar nada, mostra a mensagem de erro
  if (validOffers.length === 0) {
    return (
      <div className="bg-white p-12 rounded-[2.5rem] text-center border-2 border-dashed border-slate-100">
        <p className="font-black text-slate-400 uppercase italic text-[10px] tracking-[0.2em]">
          All competitive offers are currently sold out
        </p>
      </div>
    );
  }

  /**
   * LÓGICA DE DEDUPLICAÇÃO MELHORADA (Loja + Condição)
   * Agrupa as ofertas válidas por Loja e Condição e mantém apenas a de menor preço.
   * Assim, "Amazon - New" não é substituída por "Amazon - Refurbished".
   */
  const lowestPriceOffersMap = validOffers.reduce((acc, currentOffer) => {
    const store = currentOffer.storeName?.toLowerCase().trim() || 'unknown';
    const condition = currentOffer.condition?.toLowerCase().trim() || 'new';
    
    // Chave única composta para garantir a separação justa de produtos novos e usados
    const storeConditionKey = `${store}-${condition}`;
    
    const currentPrice = Number(currentOffer.currentPrice || 0);

    if (!acc[storeConditionKey]) {
      acc[storeConditionKey] = currentOffer;
    } else {
      const existingPrice = Number(acc[storeConditionKey].currentPrice || 0);
      if (currentPrice < existingPrice) {
        acc[storeConditionKey] = currentOffer;
      }
    }
    return acc;
  }, {});

  // Converte o mapa de volta para um array e ordena do menor para o maior preço
  const filteredOffers = Object.values(lowestPriceOffersMap).sort(
    (a, b) => Number(a.currentPrice || 0) - Number(b.currentPrice || 0)
  );

  /**
   * LÓGICA DE ESTILO E LOGOS POR LOJA (V25)
   * Corrigido: Bordas padronizadas em cinza (slate/gray).
   */
  const getStoreStyles = (name) => {
    const store = name?.toLowerCase() || '';
    
    // Suporte Amazon
    if (store.includes('amazon')) {
        return { 
          bg: 'bg-[#232f3e]', 
          text: 'text-[#ff9900]', 
          label: 'AZ', 
          border: 'border-slate-200', 
          logo: '/logos/amazon.png' 
        };
    }
    
    // Suporte BestBuy
    if (store.includes('best buy') || store.includes('bestbuy')) {
        return { 
          bg: 'bg-[#fff200]', 
          text: 'text-[#0046be]', 
          label: 'BB', 
          border: 'border-slate-200', 
          logo: '/logos/bestbuy.webp' 
        };
    }

    // Suporte eBay
    if (store.includes('ebay')) {
        return { 
          bg: 'bg-white', 
          text: 'text-[#e53238]', 
          label: 'EB', 
          border: 'border-slate-200', 
          logo: '/logos/ebay.webp' 
        };
    }

    // Default Retailer
    return { 
      bg: 'bg-gray-900', 
      text: 'text-[#ffdb00]', 
      label: name?.substring(0, 2).toUpperCase(), 
      border: 'border-slate-200', 
      logo: null 
    };
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      {filteredOffers.map((offer, idx) => {
        const styles = getStoreStyles(offer.storeName);
        const price = Number(offer.currentPrice || 0);
        const finalUrl = offer.affiliateUrl || offer.url;

        // LÓGICA PREMIUM DE NOMENCLATURA DA LOJA (Conversão e Confiança)
        const isEbay = offer.storeName?.toLowerCase().includes('ebay');
        const sellerNameRaw = offer.rawDetails?.seller_friendly_name || offer.sellerName || offer.seller;
        
        let retailerLabel = "Verified Retailer";

        if (isEbay) {
          if (sellerNameRaw) {
            // Limpa formatações estranhas (ex: best_buy -> BEST BUY)
            let cleanName = sellerNameRaw.replace(/[-_]/g, ' ').trim().toUpperCase();
            
            // Se o nome já não tiver "OFFICIAL" ou "STORE", nós adicionamos para dar autoridade
            if (!cleanName.includes('OFFICIAL') && !cleanName.includes('STORE')) {
              retailerLabel = `${cleanName} OFFICIAL STORE`;
            } else {
              retailerLabel = cleanName;
            }
          } else {
            // Fallback elegante caso a API não retorne nenhum nome de vendedor
            retailerLabel = "EBAY AUTHORIZED SELLER";
          }
        }

        const handleOfferClick = () => {
          if (typeof window !== 'undefined' && window.dataLayer) {
            window.dataLayer.push({
              event: 'click_go_to_store',
              product_name: productName || 'Unknown Product',
              store_name: offer.storeName || 'Retailer',
              product_price: price,
              currency: 'USD'
            });
          }
        };

        return (
          <article 
            key={idx} 
            className="group bg-white border border-slate-100 p-5 md:p-8 rounded-[2rem] flex flex-col md:flex-row items-center justify-between hover:border-[#ffdb00] hover:shadow-2xl transition-all duration-300 shadow-sm"
          >
            {/* SEÇÃO DA LOJA (TOP NO MOBILE / LEFT NO DESKTOP) */}
            <div className="flex items-center gap-4 md:gap-8 flex-1 min-w-0 w-full">
              {/* CONTAINER DA LOGO */}
              <div className={`${styles.bg} ${styles.border} w-14 h-14 md:w-16 md:h-16 shrink-0 rounded-2xl flex items-center justify-center border shadow-inner group-hover:scale-110 transition-transform duration-300 overflow-hidden relative`}>
                {styles.logo ? (
                  <img 
                    src={styles.logo} 
                    alt={offer.storeName}
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                ) : (
                  <span className={`${styles.text} font-black italic uppercase text-lg md:text-xl`}>
                    {styles.label}
                  </span>
                )}
              </div>
              
              <div className="min-w-0 text-left">
                {/* O Label Dinâmico de Autoridade renderiza aqui (ex: ACER OFFICIAL STORE) */}
                <span className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 block mb-0.5 tracking-widest truncate">
                  {retailerLabel}
                </span>
                <h3 className="font-black text-lg md:text-xl text-slate-900 uppercase italic truncate">
                  {offer.storeName}
                </h3>
                <div className="flex gap-2 mt-1">
                  {/* Como já filtramos os esgotados, aqui é seguro assumir In Stock */}
                  <span className="text-[9px] md:text-[10px] font-bold text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded">
                    In Stock
                  </span>
                  {offer.condition && (
                    <span className="text-[9px] md:text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-2 py-0.5 rounded">
                      {offer.condition}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SEÇÃO DE PREÇO E BOTÃO */}
            {/* REDUZIDO O ESPAÇO VERTICAL AQUI: mt-3 (era mt-5) e pt-3 (era pt-5) para telas móveis */}
            <div className="flex items-center justify-between md:justify-end gap-4 md:gap-12 shrink-0 w-full md:w-auto mt-3 md:mt-0 pt-3 md:pt-0 border-t md:border-0 border-slate-100">
              <div className="text-left md:text-right">
                <p className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter flex items-start">
                  <span className="text-sm md:text-xl mt-1.5 md:mt-2 mr-0.5">$</span>
                  {price.toFixed(2)}
                </p>
              </div>
              
              {/* REDUZIDO A ALTURA DO BOTÃO NO MOBILE: h-10 (era h-12) e px-4 (era px-6) */}
              <a 
                href={finalUrl} 
                onClick={handleOfferClick}
                target="_blank" 
                rel="noopener noreferrer nofollow sponsored" 
                className="h-10 md:h-16 inline-flex items-center justify-center bg-gray-900 text-[#ffdb00] px-4 md:px-12 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-[0.15em] md:tracking-[0.2em] hover:bg-[#ffdb00] hover:text-black transition-all active:scale-95 whitespace-nowrap min-w-[110px] md:min-w-[160px]"
              >
                Go to Store
              </a>
            </div>
          </article>
        );
      })}
    </div>
  );
}