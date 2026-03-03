# PRICELAB — Architecture Overview (Investor-Level)

PRICELAB is a **US-market price comparison engine** built for scale, SEO performance, and automated data integrity.  
It continuously ingests retailer data, stores normalized product models, ranks offers, tracks price history, and generates “merchant-grade” structured outputs.

---

## 1) What PRICELAB Does

- Aggregates offers from multiple US retailers (BestBuy, eBay, etc.)
- Normalizes products to a model-level identity for clean comparisons
- Tracks price history (time-series) for insights and deal detection
- Outputs:
  - SEO-ready pages (Category, Product)
  - Google Merchant Center feed built on **real in-stock offers**
- Uses AI pipelines to:
  - audit technical specs (expert review)
  - clean product titles for consistency

---

## 2) Core Differentiators

### a) Model Normalization (normalizedModelKey)
Different stores often name the same model differently. PRICELAB groups them under a stable normalized key so:
- one product page represents the real model
- multiple offers (listings) compare correctly

### b) Truthful Content Policy
All product metadata must be grounded:
- Verified by stored retailer specs (`rawDetails`) and/or official sources in your AI audit pipeline.
- GTIN is included only if valid (check digit), preventing merchant disapprovals.

### c) Dual AI Pipelines
- **Expert Review AI**: writes structured verdict + pros/cons + technical analysis fields
- **Title Clean AI**: evaluates if name needs cleaning and marks `ai_name_cleaned`

---

## 3) System Components (High-Level)

### Web App (Next.js)
- SSR + ISR pages:
  - Home (curated highlights)
  - Category pages (ranking + condition-aware routing)
  - Product pages (PDP with best offer logic + price history)
- JSON-LD:
  - Product + AggregateOffer + Offer list
  - BreadcrumbList
  - WebSite + SearchAction (homepage)
- Performance:
  - Next Image optimization
  - preconnect to image CDNs
  - canonical URLs to consolidate SEO

### Database (Postgres via Supabase)
- Tables:
  - products (canonical identity + SEO + AI fields)
  - listings (retailer offers)
  - price_history (time-series)
- Indices:
  - trigram + tsvector search performance
  - last_updated for freshness ordering
  - product_id/store for join efficiency

### Data Pipelines (Node.js)
- BestBuy Sync v25
- eBay Sync v25
Each pipeline:
- upserts products
- upserts listings
- writes price history snapshots

### Merchant Outputs
- Google Merchant feed endpoint
- Sitemap generator

---

## 4) Data Integrity Guarantees

PRICELAB enforces data quality:
- Only active in-stock listings become “valid offers”
- Merchant feed excludes items without valid image/price
- GTIN is validated before output
- AI fields are separated and clearly flagged (expert*, aiNameCleaned)

---

## 5) Monetization Model (Designed for Scale)
PRICELAB is structurally aligned to:
- affiliate revenue from retailer clickouts
- SEO growth via long-tail product pages
- “deal intent” pages (today’s deals / category deals)

---

## 6) Expansion Strategy
- Add more retailers (Walmart, Target, etc.)
- Add per-category ranking logic
- Add “price drop alerts” and personalization
- Expand feed outputs:
  - Bing
  - Meta catalogs
  - direct partner APIs

---

## 7) Why This Wins
PRICELAB’s advantage is structural:
- accurate grouping + clean offers
- high trust outputs for search engines
- AI-driven enrichment without hallucination
- scalable ingestion architecture