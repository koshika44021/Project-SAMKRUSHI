import { serviceClient } from '../_shared/catalog-service.ts';
import { jsonError, jsonOk, log, requestIdFrom } from '../_shared/http.ts';

/**
 * POST /functions/v1/sweep-orphan-objects[?dryRun=true]
 * Scheduled job (master §13.1): deletes private storage objects that no record
 * references, after a grace period, via the Storage API. Authorised ONLY by
 * the `x-cron-secret` header matching the CRON_SECRET function secret (fails
 * closed when unset). Every run is recorded in public.scheduled_job_runs.
 *
 * Settings (function secrets; dev placeholders): ORPHAN_GRACE_SECONDS
 * (default 86400, minimum enforced in SQL: 3600).
 */
const JOB = 'sweep-orphan-objects';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const requestId = requestIdFrom(req);
  if (req.method !== 'POST') return jsonError(req, requestId, 'VALIDATION_ERROR', 'Use POST.');

  const secret = Deno.env.get('CRON_SECRET') ?? '';
  const provided = req.headers.get('x-cron-secret') ?? '';
  if (secret.length < 16 || !timingSafeEqual(provided, secret)) {
    return jsonError(req, requestId, 'UNAUTHENTICATED', 'Not authorised.');
  }

  const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';
  const grace = Number(Deno.env.get('ORPHAN_GRACE_SECONDS') ?? '86400');
  const db = serviceClient();

  const { data: run, error: runError } = await db
    .from('scheduled_job_runs')
    .insert({ job_name: JOB, request_id: requestId })
    .select('id')
    .single();
  if (runError || !run) {
    log('error', 'job_run_start_failed', { requestId, job: JOB });
    return jsonError(req, requestId, 'SERVICE_UNAVAILABLE', 'Could not start the job.');
  }

  const finish = async (
    status: 'succeeded' | 'failed',
    counts: Record<string, number>,
    error?: string,
  ) => {
    await db
      .from('scheduled_job_runs')
      .update({
        status,
        finished_at: new Date().toISOString(),
        counts,
        ...(error ? { error } : {}),
      })
      .eq('id', run.id);
  };

  try {
    const { data: candidates, error } = await db.rpc('storage_orphan_candidates', {
      p_grace_seconds: Number.isFinite(grace) ? Math.trunc(grace) : 86400,
    });
    if (error) throw error;
    const rows = (candidates ?? []) as { bucket_id: string; object_name: string }[];

    let deleted = 0;
    if (!dryRun) {
      const byBucket = new Map<string, string[]>();
      for (const row of rows)
        byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.object_name]);
      for (const [bucket, names] of byBucket) {
        const { data: removed, error: removeError } = await db.storage.from(bucket).remove(names);
        if (removeError) throw removeError;
        deleted += removed?.length ?? 0;
      }
    }
    const counts = { candidates: rows.length, deleted, dryRun: dryRun ? 1 : 0 };
    await finish('succeeded', counts);
    log('info', 'job_succeeded', { requestId, job: JOB, ...counts });
    return jsonOk(req, requestId, { job: JOB, ...counts });
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'unknown';
    await finish('failed', {}, `failed (${code})`);
    log('error', 'job_failed', { requestId, job: JOB, code });
    return jsonError(req, requestId, 'INTERNAL_ERROR', 'The job failed.');
  }
});
