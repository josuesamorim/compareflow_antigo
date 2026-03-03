# PRICELAB — BestBuy Sync v25 (Pipeline Spec)

This pipeline ingests BestBuy catalog/offer data into the V25 schema.

---

## 1) Inputs
- BestBuy API responses (products + pricing + images + availability + specs)

---

## 2) Output Tables

### Product upsert
Fields:
- `name`, `brand`, `internalCategory`, `slug`, `upc`
- `normalizedModelKey` (computed)
- `lastUpdated` (freshness)

AI fields are NOT written by this pipeline:
- `expert*` reserved for Expert Review AI
- `aiNameCleaned` reserved for Title Clean AI

### Listing upsert
Per store offer:
- `sku` unique
- `productId`
- `store = "BestBuy"`
- `url`, `affiliateUrl`
- `image`
- `condition`
- `regularPrice`, `salePrice`, `onSale`
- `onlineAvailability`, `isExpired`
- `rawDetails` (specs snapshot)

### PriceHistory insert
- `listingId`
- `price`
- `condition`
- `capturedAt`

---

## 3) Normalization Rules

### Product identity
- slug must be stable (do not generate random slugs)
- normalizedModelKey should remove noise (color/storage/carrier patterns)

### Offer validity
Listings are considered active if:
- not expired
- in stock
- salePrice > 0
- image exists (for SEO/merchant)

---

## 4) Failure Handling
- retry HTTP calls with backoff
- never write partial corrupted records
- log summary counts: inserted/updated/skipped

---

## 5) Post-sync actions
- trigger revalidation (light mode at minimum)
- optionally trigger AI queues:
  - mark expertNeedsRevalidation if specs changed (hash diff)