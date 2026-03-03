🧠 PRICELAB — Arquitetura de Inteligência Artificial

Visão Geral

O PRICELAB utiliza uma arquitetura de IA dual e desacoplada, com responsabilidades claramente separadas:
	1.	🤖 IA de Review Técnico (expert_*)
	2.	🧼 IA de Normalização de Título (aiNameCleaned)

Essa separação evita acoplamento, reduz risco de inconsistência e permite escalabilidade independente de cada pipeline.

⸻

🎯 Objetivos da Arquitetura
	•	Garantir veracidade técnica das especificações
	•	Detectar alterações estruturais nos dados de varejistas
	•	Evitar reprocessamento desnecessário
	•	Padronizar títulos para SEO e agrupamento
	•	Manter governança de dados
	•	Operar de forma idempotente e auditável

⸻

🏗️ Arquitetura Geral

          ┌─────────────────────┐
          │   Data Ingestion    │
          │ (BestBuy / eBay /…) │
          └──────────┬──────────┘
                     │
                     ▼
              ┌────────────┐
              │  Product   │
              └─────┬──────┘
                    │
     ┌──────────────┴──────────────┐
     ▼                             ▼
 IA Name Cleaner            IA Expert Reviewer
 (Título)                   (Auditoria Técnica)
     │                             │
     ▼                             ▼
 aiNameCleaned = true       expertStatus atualizado


⸻

🤖 1️⃣ IA DE REVIEW TÉCNICO (Expert Pipeline)

Finalidade

Executar auditoria técnica avançada sobre o produto base (Product).

Ela valida:
	•	Especificações técnicas
	•	Integridade estrutural
	•	Consistência de categoria
	•	Nível de maturidade de dados
	•	Confiança da análise

⸻

🔹 Campos Reservados (expert_*)

Esses campos são exclusivos da IA de Review Técnico.

Campo	Função
expertReview	JSON estruturado com análise completa
expertScore	Nota técnica (0–10)
expertStatus	Estado do ciclo de review
expertSpecsHash	Hash das specs para controle de mudança
expertNeedsRevalidation	Flag para novo processamento
expertRevalidateAfter	Controle temporal
expertLastChecked	Última verificação
expertLastUpdated	Timestamp de atualização


⸻

🔐 Regra Crítica

Scripts de ingestão de loja NUNCA devem modificar campos expert_*.

Esses campos pertencem exclusivamente ao pipeline de IA.

⸻

🔄 Controle de Reprocessamento

A IA usa expertSpecsHash para evitar reprocessamento desnecessário.

Fluxo:
	1.	Produto recebe novos rawDetails
	2.	Sistema calcula novo hash
	3.	Se hash mudou:
	•	expertNeedsRevalidation = true
	4.	Produto entra novamente na fila da IA

⸻

🧮 Estados do expertStatus

Status	Significado
PENDING	Aguardando análise
VALID	Análise concluída com dados completos
PARTIAL	Dados incompletos
PRE_RELEASE	Produto ainda não lançado
INSUFFICIENT	Informação insuficiente
ERROR	Falha na análise
BLOCKED	Produto não deve ser analisado


⸻

🧼 2️⃣ IA DE LIMPEZA DE TÍTULO (Name Cleaner)

Finalidade

Garantir que o título do produto:
	•	Esteja padronizado
	•	Esteja otimizado para SEO
	•	Não contenha ruído
	•	Não contenha excesso de variações irrelevantes

⸻

🔹 Campo Exclusivo

Campo	Função
aiNameCleaned	Indica que o título já foi processado pela IA de limpeza


⸻

🔒 Regra de Governança
	•	Essa IA NÃO altera dados técnicos.
	•	Essa IA NÃO mexe em expert_*.
	•	Atua apenas sobre name.

⸻

🔁 Independência dos Pipelines

As duas IAs operam de forma totalmente independente.

IA	Atua em	Depende da outra?
Expert	Estrutura técnica	❌ Não
Name Cleaner	Título	❌ Não

Isso permite:
	•	Escalar cada IA separadamente
	•	Atualizar lógica sem impacto cruzado
	•	Reduzir risco sistêmico

⸻

🧠 Modelo de Execução

A arquitetura foi projetada para execução assíncrona controlada.

Exemplo de fluxo:

SELECT id
FROM products
WHERE expert_needs_revalidation = true
ORDER BY expert_last_checked ASC
LIMIT 1;

E para limpeza de nome:

SELECT id
FROM products
WHERE ai_name_cleaned = false
LIMIT 1;


⸻

🛡️ Garantias de Governança
	•	Nenhuma IA sobrescreve a outra
	•	Campos são semanticamente isolados
	•	Controle de hash evita duplicidade
	•	Auditoria completa via timestamps
	•	Estados controlados via ENUM nativo

⸻

📊 Benefícios Arquiteturais
	•	Alta previsibilidade
	•	Baixo risco de inconsistência
	•	Facilidade de debug
	•	Escalabilidade horizontal
	•	Controle preciso de custo de API
	•	Sistema auditável

⸻

🚀 Preparado Para Escalar

Essa arquitetura permite no futuro:
	•	IA de classificação automática de categoria
	•	IA de detecção de fraude
	•	IA de análise de reputação da loja
	•	IA de predição de preço
	•	IA de detecção de erro em listing

Sem alterar a estrutura base.

⸻

🎯 Conclusão

O PRICELAB não usa IA como complemento.

Ele usa IA como camada de governança e inteligência estrutural do sistema.
	•	expert_* → Governança técnica
	•	aiNameCleaned → Padronização semântica

Arquitetura limpa.
Responsabilidades isoladas.
Sistema pronto para escala enterprise.

