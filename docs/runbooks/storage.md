# Runbook: object storage (farmer photos, supply evidence, product images)

Master §13.9. The provider is an open founder decision (Supabase Storage vs Cloudflare R2). Development uses Supabase Storage.

| Bucket            | Access      | Contents                                                  | Key pattern                                  |
| ----------------- | ----------- | --------------------------------------------------------- | -------------------------------------------- |
| `farmer-photos`   | **private** | Farmer photos (re-encoded WebP, metadata stripped)        | `farmers/{supplierId}/{uuid}.webp`           |
| `supply-evidence` | **private** | Supply evidence photos (supply form) and receipt evidence | `supply/{uuid}.webp`, `receipts/{uuid}.webp` |
| `product-images`  | public read | Catalog images                                            | Set by catalog tooling                       |

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

## Orphan sweep (master §13.1)

Edge Function `sweep-orphan-objects`:

- Lists unreferenced private objects older than `ORPHAN_GRACE_SECONDS` (SQL enforces at least 1 hour) through `storage_orphan_candidates()`.
- Deletes them through the Storage API.
- Records every run in `scheduled_job_runs`, which super_admin can read.

It is authorised only by the `x-cron-secret` header and refuses to run if `CRON_SECRET` is unset. `?dryRun=true` lists without deleting.

Hosted scheduling (deploy step):

```sql
-- once, as the project owner (pg_cron + pg_net enabled). Store the secret in Vault, not in SQL history.
select cron.schedule('sweep-orphan-objects', '17 3 * * *', $$
  select net.http_post(
    url := '<PROJECT_URL>/functions/v1/sweep-orphan-objects',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  );
$$);
```

Set the function secrets first: `supabase secrets set CRON_SECRET=... ORPHAN_GRACE_SECONDS=86400`. The schedule and grace period are ops decisions; the values above are examples.
