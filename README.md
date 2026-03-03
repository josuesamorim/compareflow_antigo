# PRICELAB 🚀

O **PRICELAB** é um motor de comparação de preços de alta performance construído com **Next.js**, **Prisma ORM** e **Supabase**.

O sistema foi projetado com arquitetura relacional moderna, separando claramente:
	•	🧱 Modelo base do produto (Product)
	•	🏪 Ofertas individuais de lojas (Listing)
	•	📊 Histórico de preços (PriceHistory)
	•	🤖 Pipeline de auditoria técnica por IA
	•	🧠 Pipeline separado de limpeza de título por IA

Essa separação garante:
	•	Comparação de preços real entre lojas
	•	Alta escalabilidade
	•	Indexação avançada
	•	Feed estruturado para Google Merchant Center
	•	Sistema de auditoria inteligente
	•	Controle de reprocessamento via hash


## 🛠️ Configuração do Banco de Dados (Supabase/Postgres)

⚠️ É obrigatório executar as etapas abaixo na ordem exata no SQL Editor do Supabase.


### 🚀 PLANO DE EXECUÇÃO (Siga esta ordem exata):


#### 1️⃣ Ativar Extensão e Criar ENUM

Habilita busca fuzzy e define o enum da IA de auditoria.

```sql
-- Extensão para busca por similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enum do status do especialista (IA de review técnico)
CREATE TYPE "ExpertStatus" AS ENUM (
  'PENDING',
  'VALID',
  'PARTIAL',
  'PRE_RELEASE',
  'INSUFFICIENT',
  'ERROR',
  'BLOCKED'
);
```


#### 2️⃣ Trigger Inteligente de Otimização de Produto

Essa função é o núcleo da performance do sistema.

Ela faz duas coisas automaticamente:
	1.	🔑 Gera normalized_model_key
	2.	🔍 Atualiza search_vector com pesos

```sql  
CREATE OR REPLACE FUNCTION trigger_optimize_product_data()
RETURNS trigger AS $$
BEGIN

  -- Normalização do modelo (remove ruídos de variação)
  NEW.normalized_model_key :=
    lower(
      regexp_replace(
        regexp_replace(
          NEW.name,
          '\s*(128GB|256GB|512GB|1TB|2TB|5G|LTE|Unlocked|Verizon|AT&T|T-Mobile|Burgundy|Green|Phantom Black|White|Pink|Blue|Graphite|Silver|Gold|Titanium|Yellow|Purple|Midnight|Starlight)\s*',
          '',
          'gi'
        ),
        '[^a-zA-Z0-9]',
        '',
        'g'
      )
    );

  -- Vetor de busca com peso A para nome e B para marca
  NEW.search_vector :=
      setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
      setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'B');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_optimization ON products;

CREATE TRIGGER trg_products_optimization
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION trigger_optimize_product_data();
```


⸻

#### 3️⃣ Ajustes de Coluna e Atualização de Dados

```sql
-- Ajusta expert_status para ENUM
ALTER TABLE products
ALTER COLUMN expert_status TYPE "ExpertStatus"
USING expert_status::text::"ExpertStatus";

-- Ajusta precisão de timestamp
ALTER TABLE products
ALTER COLUMN expert_last_checked TYPE timestamptz;

-- Força trigger rodar em dados existentes
UPDATE products SET name = name;
```


#### ⚡ ÍNDICES DE ULTRA PERFORMANCE (V2026)

Agora os índices são divididos corretamente entre products e listings.


🔍 PRODUCTS

```sql
-- Full Text Search
CREATE INDEX IF NOT EXISTS idx_products_search_vector
ON products USING GIN(search_vector);

-- Trigram no nome
CREATE INDEX IF NOT EXISTS trgm_idx_products_name
ON products USING GIN (name gin_trgm_ops);

-- Fila da IA de review técnico
CREATE INDEX IF NOT EXISTS idx_products_expert_queue
ON products (
  expert_needs_revalidation,
  expert_revalidate_after,
  expert_last_checked,
  expert_status
);

-- Hash de controle da IA
CREATE INDEX IF NOT EXISTS idx_products_expert_specs_hash
ON products(expert_specs_hash);

-- Atualização
CREATE INDEX IF NOT EXISTS idx_products_last_updated
ON products(last_updated DESC);

-- Slug
CREATE INDEX IF NOT EXISTS idx_products_slug
ON products(slug);

-- UPC
CREATE INDEX IF NOT EXISTS idx_products_upc
ON products(upc);
```


#### 🏪 LISTINGS

```sql
-- Lookup por produto
CREATE INDEX IF NOT EXISTS idx_listings_product_id
ON listings(product_id);

-- Filtro por loja
CREATE INDEX IF NOT EXISTS idx_listings_store
ON listings(store);

-- Índice para busca de menor preço ativo
CREATE INDEX IF NOT EXISTS idx_listings_active_price
ON listings(product_id, is_expired, online_availability, sale_price);

-- Histórico
CREATE INDEX IF NOT EXISTS idx_price_history_listing
ON price_history(listing_id);
```


#### 🧱 ARQUITETURA ATUAL


🔹 Product

Representa o modelo base.

Contém:
	•	name
	•	brand
	•	slug
	•	upc
	•	normalizedModelKey
	•	search_vector
	•	dados de auditoria IA



🔹 Listing

Representa a oferta individual da loja.

Contém:
	•	store
	•	salePrice
	•	regularPrice
	•	condition
	•	image
	•	onlineAvailability
	•	isExpired
	•	rawDetails
	•	relacionamento com Product

#### A comparação de preços é feita aqui.


🔹 PriceHistory

Histórico de preço por listing.

Permite:
	•	Gráfico de variação
	•	Monitoramento de promoções
	•	Inteligência de preço


#### 🤖 CAMPOS RESERVADOS PARA IA

🔹 Campos expert_* (IA de Review Técnico)

Todos os campos que começam com expert são exclusivos da IA de auditoria técnica.

Eles NÃO devem ser manipulados pelo script de ingestão.

Eles são usados para:
	•	expertReview → JSON com análise técnica completa
	•	expertScore → nota 0–10
	•	expertStatus → estado do review
	•	expertSpecsHash → controle de mudança de especificação
	•	expertNeedsRevalidation → marca reprocessamento
	•	expertRevalidateAfter → controle temporal
	•	expertLastChecked → último ciclo de auditoria
	•	expertLastUpdated → timestamp de atualização

Esses campos são parte do pipeline de governança de dados.

⸻

🔹 Campo aiNameCleaned (IA de Limpeza de Título)

Esse campo é exclusivo da segunda IA, responsável por:
	•	Verificar se o título precisa limpeza
	•	Padronizar nomenclatura
	•	Remover ruídos
	•	Garantir consistência SEO

Ele NÃO pertence ao pipeline de review técnico.

Ele controla apenas o fluxo de higienização do nome.

⸻

#### 🔍 VERIFICAÇÃO FINAL

SELECT
  name,
  normalized_model_key,
  expert_status,
  expert_score
FROM products
LIMIT 5;



#### 💻 DESENVOLVIMENTO

Pré-requisitos
	•	Node.js 20+
	•	Supabase ativo
	•	Extensão pg_trgm habilitada


#### Instalação

npm install
npx prisma db push
npx prisma generate



#### 📦 NOTAS IMPORTANTES SOBRE O SCHEMA

search_vector

Marcado como Unsupported("tsvector").

O Prisma não escreve nele.
O PostgreSQL gerencia via trigger.

⸻

normalizedModelKey

Permite agrupar:
	•	“iPhone 15 Pro Blue”
	•	“iPhone 15 Pro Titanium”

Como o mesmo modelo base.

⸻

Arquitetura de Comparação

A comparação de preços agora é feita via:

product.listings

E o menor salePrice válido é usado como melhor oferta.

⸻

#### 🎯 CONCLUSÃO

O PRICELAB agora opera com:
	•	Arquitetura relacional correta
	•	Comparação real entre varejistas
	•	Busca indexada com GIN
	•	Pipeline IA dual (Review + Nome)
	•	Controle de revalidação inteligente
	•	Sistema pronto para escalar
