# PRICELAB — eBay Sync v25 (Pipeline Spec)

This pipeline ingests eBay offers into the V25 schema.

---

## 1) Input
- eBay API offers or scraped/partner feed
- includes:
  - title
  - price
  - condition
  - image
  - product URL
  - item id / SKU mapping

---

## 2) Output Tables

### Product upsert (when possible)
- Create/attach to existing Product via:
  - UPC match if available
  - normalizedModelKey match (best effort)
  - fallback: create new product row

### Listing upsert
- `store = "eBay"`
- `sku` unique (use stable ebay item id)
- `affiliateUrl` (your tracking link)
- `image`, `condition`, `salePrice`
- `onlineAvailability` / `isExpired` based on offer presence

### PriceHistory insert
- snapshot per listing per run

---

## 3) Special Risks (eBay)
- conditions vary widely → normalize carefully
- titles are noisy → rely on aiNameCleaned pipeline for cleanup
- duplicates are common → grouping via normalizedModelKey is crucial

---

## 4) Post-sync
- revalidate deals/search/product pages (light/medium)
- update “offer freshness” flags