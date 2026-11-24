import { businessDateSchema } from '@samkrushi/shared';
import type { Metadata } from 'next';
import {
  Alert,
  buttonClass,
  EmptyState,
  formatDateTimeIst,
  inputClass,
  PageHeader,
  Pagination,
} from '@/components/ui/primitives';
import { requireCapability } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Audit History' };

const PAGE_SIZE = 50;
const ENTITY_TYPES = [
  'suppliers',
  'supplier_contacts',
  'farmer_profiles',
  'supply_confirmations',
  'products',
  'product_skus',
  'categories',
  'product_images',
  'staff_profiles',
  'user_roles',
  'app_settings',
  'policy_versions',
] as const;

type Search = {
  entity?: string;
  entityId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** IST calendar day → UTC instant bounds. */
const istStart = (date: string) => `${date}T00:00:00+05:30`;

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-slate-600">{label}</summary>
      <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-50 p-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireCapability('viewAudit');
  const raw = await searchParams;
  const page = Math.max(1, Number(raw.page) || 1);
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from('audit_logs')
    .select(
      'id, occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, reason, before_data, after_data, request_id, source',
      {
        count: 'exact',
      },
    )
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (raw.entity && (ENTITY_TYPES as readonly string[]).includes(raw.entity))
    query = query.eq('entity_type', raw.entity);
  if (raw.entityId && raw.entityId.length <= 200)
    query = query.eq('entity_id', raw.entityId.trim());
  if (raw.action && /^[a-z_.]{1,80}$/.test(raw.action))
    query = query.ilike('action', `%${raw.action}%`);
  if (raw.from && businessDateSchema.safeParse(raw.from).success)
    query = query.gte('occurred_at', istStart(raw.from));
  if (raw.to && businessDateSchema.safeParse(raw.to).success) {
    const end = new Date(istStart(raw.to));
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt('occurred_at', end.toISOString());
  }

  const { data: rows, count, error } = await query;
  const actorIds = [
    ...new Set((rows ?? []).map((r) => r.actor_user_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: names } = actorIds.length
    ? await supabase.rpc('staff_display_names', { p_user_ids: actorIds })
    : { data: [] as { user_id: string; full_name: string }[] };
  const nameById = new Map((names ?? []).map((n) => [n.user_id, n.full_name]));
  const totalItems = count ?? 0;

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...raw, page: String(p) }))
      if (value) params.set(key, value);
    return `/audit?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Audit History"
        description="Append-only record of every important change. Phone numbers are masked; private keys are redacted."
      />
      <form
        method="get"
        className="mb-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-6"
      >
        <select
          name="entity"
          defaultValue={raw.entity ?? ''}
          aria-label="Entity"
          className={inputClass}
        >
          <option value="">All entities</option>
          {ENTITY_TYPES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <input
          name="entityId"
          defaultValue={raw.entityId}
          placeholder="Entity ID"
          aria-label="Entity ID"
          className={inputClass}
        />
        <input
          name="action"
          defaultValue={raw.action}
          placeholder="Action (e.g. update)"
          aria-label="Action"
          className={inputClass}
        />
        <input
          name="from"
          type="date"
          defaultValue={raw.from}
          aria-label="From (IST)"
          className={inputClass}
        />
        <input
          name="to"
          type="date"
          defaultValue={raw.to}
          aria-label="To (IST)"
          className={inputClass}
        />
        <button type="submit" className={buttonClass('secondary')}>
          Filter
        </button>
      </form>

      {error ? (
        <Alert tone="danger">Audit history could not be loaded.</Alert>
      ) : !rows?.length ? (
        <EmptyState title="No audit entries match these filters" />
      ) : (
        <>
          <ol className="space-y-2" data-testid="audit-list">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className="font-mono text-xs font-semibold">{r.action}</span>{' '}
                    <span className="text-slate-500">
                      {r.entity_type} · <span className="font-mono text-xs">{r.entity_id}</span>
                    </span>
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTimeIst(r.occurred_at)}</span>
                </div>
                <p className="mt-1 text-sm">
                  {r.actor_user_id ? (nameById.get(r.actor_user_id) ?? r.actor_user_id) : 'System'}
                  {r.actor_role ? <span className="text-slate-500"> as {r.actor_role}</span> : null}
                  <span className="text-slate-500"> · {r.source}</span>
                  {r.reason ? <span> · “{r.reason}”</span> : null}
                </p>
                {r.request_id ? (
                  <p className="font-mono text-xs text-slate-400">request {r.request_id}</p>
                ) : null}
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <JsonBlock label="Before" value={r.before_data} />
                  <JsonBlock label="After" value={r.after_data} />
                </div>
              </li>
            ))}
          </ol>
          <Pagination
            page={page}
            totalPages={Math.ceil(totalItems / PAGE_SIZE)}
            totalItems={totalItems}
            hrefFor={hrefFor}
          />
        </>
      )}
    </>
  );
}
