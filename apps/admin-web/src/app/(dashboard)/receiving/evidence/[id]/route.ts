import { NextResponse } from 'next/server';
import { z } from 'zod';
import { can, getStaffSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * GET /receiving/evidence/:receiptLineId → 302 to a 60-second signed URL.
 * The private key is hidden from clients by column grants; this trusted
 * server route checks the capability (super/ops, same as supply evidence)
 * and reads the key with the service role.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  if (!can(session, 'manageInventory'))
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('goods_receipt_lines')
    .select('evidence_storage_key')
    .eq('id', id)
    .maybeSingle();
  if (!data?.evidence_storage_key)
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const { data: signed, error } = await admin.storage
    .from('supply-evidence')
    .createSignedUrl(data.evidence_storage_key, 60);
  if (error || !signed) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'no-store' } });
}
