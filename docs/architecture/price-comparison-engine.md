# PRICELAB — Price Comparison Engine (Technical Architecture)

This document describes how PRICELAB performs reliable price comparison using the V25 schema.

---

## 1) Core Concept

PRICELAB separates:

- **Product** = canonical model identity (SEO + grouping + AI)
- **Listing** = retailer offer (price, condition, stock, image)
- **PriceHistory** = pricing snapshots per listing

This prevents a common aggregator failure:
> mixing offers across conditions/stores and presenting misleading “lowest price”.

---

## 2) Model Grouping (normalizedModelKey)

Each Product stores:
- `normalizedModelKey`

Purpose:
- group equivalent model variants across stores
- de-duplicate search results
- power “best offer” selection per model

---

## 3) Offer Selection Rules

### Category/Search pages
Typical ranking:
- select best listing per product or per model group:
  - active only (`isExpired=false`, `onlineAvailability=true`)
  - lowest salePrice
- apply noise filters (accessory keywords, blocked brands, min price thresholds)

### Product Page (PDP)
PDP must preserve consistency from click → PDP:
- if user clicked with `?condition=...`:
  - PDP selects the best offer matching the condition
  - does NOT switch to another condition’s lower price
- otherwise:
  - pick best active offer globally

---

## 4) Price History Analysis

`PriceHistory` stores time series per listing:
- `capturedAt`
- `price`
- `condition`

PDP aggregates history across listings:
- average price baseline
- “great/good/average/expensive” based on delta %
- avoids fake baselines when history is missing

---

## 5) Image Strategy (Best Possible, Non-Invented)

Rules:
- prefer Product.image if exists
- else fallback to best listing image
- else fallback to another listing image
- else use local placeholder `/no-image.png`

This is applied in:
- Category pages
- PDP
- Merchant feed

---

## 6) Truthful Specs Handling (rawDetails)

`rawDetails` are stored on Listing.
PRICELAB can prioritize:
- BestBuy rawDetails first (higher quality)
- then eBay rawDetails
- then reference listing rawDetails

All JSON-LD and feed outputs:
- only include what exists
- no invented specs