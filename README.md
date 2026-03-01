# PRICELAB 🚀

O **PRICELAB** é um motor de comparação de preços de alta performance construído com **Next.js**, **Prisma** e **Supabase**. O sistema foi desenhado para suportar 300+ VUs (Virtual Users) simultâneos, utilizando indexação GIN para busca textual avançada e um pipeline de auditoria técnica automatizado por IA para garantir a veracidade das especificações.

## 🛠️ Configuração do Banco de Dados (Supabase/Postgres)

Para que a busca, o agrupamento de modelos e a fila de auditoria funcionem corretamente, é **obrigatório** seguir a ordem de execução abaixo no SQL Editor do seu Supabase.

### O Plano de Voo (Siga esta ordem exata):

#### 1. Ativar Extensões e Tipos Personalizados

Habilita a busca por similaridade (fuzzy search) e define os estados possíveis para a auditoria técnica de produtos.

```sql
-- Habilita extensão para busca aproximada
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Cria o tipo ENUM para o status do Especialista (IA/Auditoria)
CREATE TYPE "ExpertStatus" AS ENUM ('PENDING', 'VALID', 'PARTIAL', 'PRE_RELEASE', 'INSUFFICIENT', 'ERROR', 'BLOCKED');

```

#### 2. Criar a Função de Otimização "Tudo-em-Um"

Esta função é o cérebro do banco de dados. Ela unifica a **Normalização do Modelo** (essencial para comparar preços entre lojas diferentes) e o **Vetor de Busca com Pesos**.

```sql
CREATE OR REPLACE FUNCTION trigger_optimize_product_data() 
RETURNS trigger AS $$
BEGIN
  -- 1. Lógica de Normalização de Modelo
  -- Remove variações de cor, capacidade e operadora para gerar uma chave única de agrupamento.
  NEW.normalized_model_key := lower(regexp_replace(regexp_replace(NEW.name, '\s*(128GB|256GB|512GB|1TB|2TB|5G|LTE|Unlocked|Verizon|AT&T|T-Mobile|Burgundy|Green|Phantom Black|White|Pink|Blue|Graphite|Silver|Gold|Titanium|Yellow|Purple|Midnight|Starlight)\s*', '', 'gi'), '[^a-zA-Z0-9]', '', 'g'));
  
  -- 2. Lógica do Vetor de Busca Textual com Pesos (A para Nome, B para Marca)
  -- Isso garante que buscas pelo nome do produto tenham prioridade sobre a marca.
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.brand, '')), 'B');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ativa o Trigger Único para INSERT e UPDATE
DROP TRIGGER IF EXISTS trg_products_optimization ON products;
CREATE TRIGGER trg_products_optimization
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION trigger_optimize_product_data();

```

#### 3. Processar Dados Existentes e Ajustes de Coluna

Caso você já tenha dados, force a atualização para preencher as novas colunas e garantir que os tipos de dados estejam corretos:

```sql
-- Converte a coluna expert_status para o novo tipo ENUM (caso já exista como text)
ALTER TABLE products 
ALTER COLUMN expert_status TYPE "ExpertStatus" 
USING expert_status::text::"ExpertStatus";

-- Ajusta precisão de tempo para sincronia com Prisma
ALTER TABLE products ALTER COLUMN expert_last_checked TYPE timestamptz;

-- Força o trigger a rodar em todos os produtos existentes
UPDATE products SET name = name; 

```

#### 4. Índices de Ultra Performance (Missão Crítica)

Execute estes índices para garantir latência mínima em buscas complexas e na fila de processamento da IA:

```sql
-- 1. Busca por texto (Full Text Search)
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN(search_vector);

-- 2. Busca por similaridade (Trigram) no Nome
CREATE INDEX IF NOT EXISTS trgm_idx_products_name ON products USING GIN (name gin_trgm_ops);

-- 3. Fila do Especialista: Otimiza a busca por produtos que precisam de auditoria urgente
CREATE INDEX IF NOT EXISTS idx_products_expert_queue
ON products (is_expired, online_availability, expert_needs_revalidation, expert_revalidate_after, expert_last_checked);

-- 4. Agrupamento Ativo: Filtra produtos válidos, por marca e chave normalizada para o "Menor Preço"
CREATE INDEX IF NOT EXISTS idx_products_active_grouping
ON products (is_expired, brand, normalized_model_key, condition, sale_price);

-- 5. Outros índices de suporte
CREATE INDEX IF NOT EXISTS idx_products_expert_specs_hash ON products(expert_specs_hash);
CREATE INDEX IF NOT EXISTS idx_products_last_updated ON products(last_updated DESC);

```

---

## 🔍 Verificação Final

Rode este comando para validar se o Trigger e os novos campos de Auditoria estão operando:

```sql
SELECT 
  name, 
  normalized_model_key, 
  expert_status, 
  expert_score 
FROM products 
WHERE is_expired = false 
LIMIT 5;

```

---

## 💻 Desenvolvimento

### Pré-requisitos

* Node.js / NPM
* Instância do Supabase ativa com extensões habilitadas.

### Instalação

```bash
npm install
# O generator agora inclui previewFeatures = ["fullTextSearchPostgres"]
npx prisma generate

```

### Notas sobre o Schema Prisma (v2026)

O sistema agora utiliza funcionalidades avançadas para garantir que a IA e o Banco trabalhem em harmonia:

* **`search_vector`**: Marcado como `Unsupported("tsvector")`. O Prisma ignora a escrita direta, permitindo que o **Trigger do Postgres** gerencie o índice sem conflitos de aplicação.
* **`expertSpecsHash`**: Campo de controle. Se os dados da loja mudarem, o hash mudará e o sistema marcará `expertNeedsRevalidation = true`.
* **`expertStatus`**: Enum nativo que impede estados inválidos no fluxo de análise técnica.
* **`normalizedModelKey`**: A espinha dorsal do agrupamento. Garante que "iPhone 15 Pro Blue" e "iPhone 15 Pro Titanium" sejam identificados como o mesmo modelo base para comparação de preços.

---

**Deseja que eu ajude a configurar o script de sincronização que lê essa fila de auditoria e envia para a IA?**
