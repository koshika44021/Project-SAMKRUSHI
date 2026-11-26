import { NextResponse } from 'next/server';
import { getStaffSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * GET /availability/evidence/{supplyId}: redirects to a 60-second signed URL
 * for the private supply evidence image. The key is resolved by an RPC that
 * enforces the role (super_admin / operations_admin), never exposed directly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return new NextResponse('Not signed in', { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse('Not found', { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data: key, error } = await supabase.rpc('admin_supply_evidence_key', { p_supply_id: id });
  if (error) return new NextResponse('Forbidden', { status: error.code === 'PT403' ? 403 : 404 });
  if (typeof key !== 'string') return new NextResponse('Not found', { status: 404 });

  const { data: signed } = await createSupabaseAdminClient()
    .storage.from('supply-evidence')
    .createSignedUrl(key, 60);
  if (!signed?.signedUrl) return new NextResponse('Not found', { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'no-store' } });
}
