# PRICELAB — Vercel Cache & Revalidation (Technical)

This document describes PRICELAB cache behavior and revalidation strategies for Next.js App Router on Vercel.

---

## 1) What Gets Cached

### ISR Pages (revalidate = 3600)
- Home
- Category pages
- Today’s Deals page
- Product pages (if set)

ISR means:
- Vercel serves cached HTML
- after TTL, a request triggers a regeneration

---

## 2) Why Revalidation Exists

Your data pipeline updates prices and offers daily.
Without revalidation:
- HTML pages might show stale prices even though DB is updated.

Revalidation gives you:
- immediate freshness after sync jobs
- deterministic “purge” behavior after ingestion

---

## 3) Revalidate Mechanisms (Next App Router)

### A) `revalidatePath("/path")`
Purges the cached route (and optionally layout scope).

Best for:
- Home, categories, deals, major routes

### B) `revalidateTag("tag")`
Works only if your data fetching uses `fetch(..., { next: { tags: ["..."] } })`.

If you mostly fetch via Prisma (DB), `revalidateTag` won’t affect Prisma calls.
So keep tags as optional.

---

## 4) Recommended Purge Strategy

### Light mode (fast, safe)
Revalidate:
- `/`
- `/categories`
- `/todays-deals`
- institutional pages

### Medium mode
+ `/search`
+ `/category` base route

### Full mode (requires list endpoint)
To purge every product page, you need a protected endpoint to list slugs.

---

## 5) Production Safety
- Protect revalidation endpoint with Bearer token
- do not allow public access

---

## 6) Debugging Checklist
If revalidation “does nothing”:
- confirm your pages use ISR (not fully dynamic)
- confirm you deployed the correct environment variables
- confirm your middleware isn’t blocking the request
- confirm you call the endpoint in production URL, not preview