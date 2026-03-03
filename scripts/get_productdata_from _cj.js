// Consegue pegar json com os dados dos produtos da acer
//https://members.cj.com/member/7541576/publisher/links/search/#!tab=products&advertiserIds=4017900

(function extractCJProductsPro() {
    const products = [];
    // Busca cada bloco de produto renderizado na página
    const rows = document.querySelectorAll('.product-row-wrapper');

    rows.forEach((row, index) => {
        let product = {};
        
        // 1. Extrai a imagem do produto (Bônus para o seu banco de dados)
        const img = row.querySelector('.link-preview img');
        if (img && img.src) {
            product['Image'] = img.src;
        }

        // 2. Extrai a Data de Atualização (Last Updated)
        const firstLineLi = row.querySelector('.first-line li');
        if (firstLineLi) {
            const labelSpan = firstLineLi.querySelector('.detail-label');
            if (labelSpan) {
                const key = labelSpan.innerText.trim();
                // Remove a chave do texto inteiro para sobrar só o valor da data
                const value = firstLineLi.innerText.replace(key, '').trim();
                if (key) product[key] = value;
            }
        }

        // 3. Extrai TODOS os dados ricos (UPC, SKU, EPC, Buy Url, etc.)
        const details = row.querySelectorAll('.link-details .detail');
        details.forEach(detail => {
            const label = detail.querySelector('.detail-label');
            const valueSpan = detail.querySelector('.value');
            
            if (label && valueSpan) {
                const key = label.innerText.trim();
                let value = '';
                
                // Se o campo for um Link (ex: Buy Url), extrai o href para não pegar reticências
                if (valueSpan.tagName.toLowerCase() === 'a') {
                    value = valueSpan.href;
                } else {
                    value = valueSpan.innerText.trim();
                }
                
                // Salva no objeto apenas se a chave e o valor não estiverem vazios
                if (key && value) {
                    product[key] = value;
                }
            }
        });

        // Só adiciona na lista se conseguiu extrair dados substanciais
        if (Object.keys(product).length > 2) {
            products.push(product);
        }
    });

    if (products.length === 0) {
        alert("Nenhum produto foi extraído. Certifique-se de que a tabela já terminou de carregar.");
        return;
    }

    // 4. Inicia o download mágico do JSON limpo e estruturado
    const dataStr = JSON.stringify(products, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    // Cria um arquivo com a data e hora para você não se perder
    const date = new Date().toISOString().slice(0,10);
    a.download = `cj_produtos_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`✅ SUCESSO ABSOLUTO! ${products.length} produtos perfeitos foram extraídos e baixados.`);
})();