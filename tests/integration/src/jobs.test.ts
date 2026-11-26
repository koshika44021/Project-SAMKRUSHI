import { describe, expect, it } from 'vitest';
import { admin, SUPABASE_URL } from './setup.ts';

// sweep-orphan-objects scheduled job (master §13.1). Candidate selection is
// covered by pgTAP (008); here: authorisation, dry run and run logging.
const url = `${SUPABASE_URL}/functions/v1/sweep-orphan-objects`;
const CRON_SECRET = process.env.CRON_SECRET ?? 'dev-only-cron-secret-change-me';

describe('sweep-orphan-objects', () => {
  it('refuses calls without the cron secret', async () => {
    const response = await fetch(url, { method: 'POST' });
    expect(response.status).toBe(401);
    const wrong = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': 'x'.repeat(30) },
    });
    expect(wrong.status).toBe(401);
  });

  it('refuses GET', async () => {
    const response = await fetch(url, { headers: { 'x-cron-secret': CRON_SECRET } });
    expect(response.status).toBe(400);
  });

  it('runs a dry run and records the run', async () => {
    const requestId = `it-sweep-${Date.now()}`;
    const response = await fetch(`${url}?dryRun=true`, {
      method: 'POST',
      headers: { 'x-cron-secret': CRON_SECRET, 'x-request-id': requestId },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { deleted: number; dryRun: number; candidates: number };
    };
    expect(body.data.dryRun).toBe(1);
    expect(body.data.deleted).toBe(0);

    const { data: run } = await admin
      .from('scheduled_job_runs')
      .select('status, counts, finished_at')
      .eq('request_id', requestId)
      .single();
    expect(run?.status).toBe('succeeded');
    expect(run?.finished_at).toBeTruthy();
  });
});
