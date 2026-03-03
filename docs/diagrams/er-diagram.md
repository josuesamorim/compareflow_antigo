# PRICELAB — ER Diagram (V25 Schema)

This diagram reflects the **current** Prisma schema (Product → Listing → PriceHistory), plus your AI-driven fields.

> Render tip: GitHub supports Mermaid in Markdown.
> If it doesn't render in your environment, use Mermaid Live Editor and paste it.

```mermaid
erDiagram
  PRODUCT ||--o{ LISTING : "has"
  LISTING ||--o{ PRICE_HISTORY : "has"

  PRODUCT {
    int id PK
    string slug "unique"
    string name
    string brand
    string internal_category
    string category_path
    string upc
    string normalized_model_key
    tsvector search_vector

    decimal customer_review_average
    int customer_review_count

    datetime last_updated

    %% AI (Expert Review) fields
    decimal expert_score
    json expert_review
    datetime expert_last_updated
    string expert_specs_hash
    enum expert_status
    boolean expert_needs_revalidation
    datetime expert_revalidate_after
    datetime expert_last_checked

    %% AI (Name Cleaning) fields
    boolean ai_name_cleaned

    %% UPC pipeline fields
    datetime upc_last_checked
    boolean upc_not_found
  }

  LISTING {
    int id PK
    string sku "unique"
    int product_id FK
    string store
    string url
    string affiliate_url
    string image
    string condition
    decimal regular_price
    decimal sale_price
    boolean on_sale
    boolean online_availability
    boolean is_expired
    datetime last_updated
    json raw_details
  }

  PRICE_HISTORY {
    int id PK
    int listing_id FK
    decimal price
    string condition
    datetime captured_at
  }

Notes
	•	Product represents the canonical item (model identity, grouping, SEO slug).
	•	Listing represents a retailer offer (store, condition, price, image, availability).
	•	PriceHistory tracks time-series prices for each Listing.
	•	AI fields:
	•	expert* fields are reserved for your product review/audit AI.
	•	ai_name_cleaned is reserved for your title-cleaning AI.

---

## `docs/feeds/google-merchant-feed.md`

```md
# PRICELAB — Google Merchant Center Feed (Technical Spec)

This document describes PRICELAB’s **Google Merchant feed** built on the **V25 schema**:
- Products are included **only if they have at least one valid in-stock listing**.
- The feed uses **truthful data only** (no invented specs, no fake ratings).
- GTIN is included **only if valid** (check digit validation).

---

## 1) Objective

Generate an RSS/XML feed compatible with Google Merchant Center using **live retailer offers** as the source of truth.

Key goals:
- Prevent Merchant errors (invalid GTIN, missing image, invalid price).
- Keep feed clean: only include items that users can actually click and find in stock.
- Ensure content integrity: descriptions must come from real `rawDetails` fields, never hallucinated.

---

## 2) Data Source (Schema Mapping)

### Product (canonical)
- `Product.slug` → landing page URL (PDP)
- `Product.name` → item title
- `Product.brand` → merchant brand
- `Product.internalCategory` → product_type
- `Product.upc` → GTIN candidate (validated)
- `Product.normalizedModelKey` → item_group_id (variant grouping)

### Listing (offer)
- `Listing.salePrice` / `Listing.regularPrice` → price
- `Listing.image` → image_link + additional_image_link candidates
- `Listing.condition` → condition mapping (new/used/refurbished)
- `Listing.onlineAvailability` + `Listing.isExpired` → availability
- `Listing.rawDetails` → specs description

---

## 3) Inclusion Rules (Hard Filters)

A Product is included only if:
- `slug` exists
- `listings.some(...)` where listing:
  - `isExpired = false`
  - `onlineAvailability = true`
  - `salePrice > 0`
  - `image` is non-null and non-empty (and valid URL)

This ensures:
- All feed items are actionable (in stock).
- All items have a valid main image (Merchant requirement).

---

## 4) Offer Selection Strategy

For each Product:
- Select the “best listing” as:
  - **lowest salePrice** among valid listings (`ORDER BY salePrice ASC`)

Why:
- Merchant Center typically benefits from the best available price.
- Your PDP can still show other offers.

---

## 5) Image Strategy (Best Possible, Truthful)

### Primary image (`<g:image_link>`)
- Uses `bestListing.image` (offer-level image).

### Additional images (`<g:additional_image_link>`)
- Collects distinct `image` URLs from other valid listings under the same product.
- Deduped and limited (e.g., 5 max).

### BestBuy high-res upgrade (safe)
If image is from `bbystatic.com`, you can safely attempt higher resolution by replacing:
- `/prescaled/500/500/` → `/prescaled/1000/1000/`
and optionally suffix upgrade when pattern matches.

If pattern doesn’t match: return original URL (no invention).

---

## 6) GTIN / UPC Validation (Critical)

PRICELAB includes `<g:gtin>` only if:
- digits-only length is 12 / 13 / 14
- GS1 check digit matches

Implementation:
- `safeGtin12`, `safeGtin13`, `safeGtin14`
- never sends invalid GTIN to avoid Merchant disapprovals.

If GTIN is missing/invalid:
- use `<g:mpn>` if available (Listing SKU)
- set `<g:identifier_exists>false</g:identifier_exists>` when neither exists

---

## 7) Condition Mapping (Google)

Input: Listing.condition (freeform string)
Output must be one of:
- `new`
- `used`
- `refurbished`

Rules:
- contains `refurb`, `renewed`, `certified` → refurbished
- contains `used`, `pre-owned`, `open-box` → used
- else → new

---

## 8) Availability Mapping

If listing is active and in stock:
- `in_stock`

Otherwise:
- `out_of_stock`

Note: feed inclusion already filters to in-stock, but mapping remains truthful for consistency.

---

## 9) Description Policy (Truthful-Only)

Description is built from:
- `bestListing.rawDetails` first
- fallback: category summary if missing

Rules:
- include only safe keys (exclude `upc`, `sku`, `price`, `url`, etc.)
- limit number of keys (e.g., 12–15)
- trim values to avoid massive strings
- never invent specs or add claims

---

## 10) Google Product Category Mapping

PRICELAB uses a conservative keyword mapping that returns Google category IDs.
This is a best-effort mapping and should be refined as categories expand.

---

## 11) Local / Production Base URL

Recommended:
- Production feed uses: `https://www.pricelab.tech`
- Local testing uses: `http://localhost:3000`

Always include scheme (`http/https`) in `<link>` and `<g:link>`.

---

## 12) Testing Checklist

Before submitting to Merchant:
- Validate XML well-formed
- Confirm every item has:
  - `id`, `title`, `description`, `link`, `image_link`, `price`, `availability`
- Confirm `image_link` is publicly accessible (no auth)
- Confirm GTIN is valid when present (no Merchant errors)

---

## 13) Recommended Improvements

- Add a protected endpoint to export:
  - top categories list
  - most recent product slugs
  (helps revalidation tooling and feed auditing)
- Add feed diagnostics endpoint:
  - counts of skipped items and reasons