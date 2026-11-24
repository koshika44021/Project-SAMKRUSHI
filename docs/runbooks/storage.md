# Runbook: object storage (farmer photos, supply evidence, product images)

Master §13.9. The provider is an open founder decision (Supabase Storage vs Cloudflare R2). Development uses Supabase Storage.

| Bucket            | Access      | Contents                                           | Key pattern                        |
| ----------------- | ----------- | -------------------------------------------------- | ---------------------------------- |
| `farmer-photos`   | **private** | Farmer photos (re-encoded WebP, metadata stripped) | `farmers/{supplierId}/{uuid}.webp` |
| `supply-evidence` | **private** | Optional supply evidence (UI deferred)             | `supply/{uuid}.webp`               |
| `product-images`  | public read | Catalog images                                     | Set by catalog tooling             |

## Rules

- Private buckets have **no storage RLS policies**. Only server code using the secret key reads or writes them.
- Clients get **60-second signed URLs** after a role check. Farmer photos are signed for `super_admin`, `operations_admin` and `finance_admin`; the dev default hides them from `viewer`.
- Uploads are sniffed by magic bytes (JPEG/PNG/WebP), size-limited (dev default 5 MB, founder decision pending), re-encoded with `sharp` (EXIF/GPS removed) and stored under random keys.
- Replacing a photo deletes the previous object after the database points at the new one. If the database update fails, the new object is removed.

## Local

Buckets are declared in `supabase/config.toml` (`[storage.buckets.*]`) and created by `supabase start`.

## Hosted project setup (before staging)

1. Create the three buckets with the same visibility, size limit and allowed MIME types. Limits need founder approval.
2. Confirm no storage policies grant `anon` or `authenticated` access to the private buckets.
3. Set `PUBLIC_SUPABASE_URL` for the Edge Functions (`supabase secrets set`), so product image URLs point at the public API URL.

## Open follow-ups

- Scheduled sweep of orphaned objects after a grace period (master §13.1), for objects left by failed requests.
- Supply evidence upload and view UI.
