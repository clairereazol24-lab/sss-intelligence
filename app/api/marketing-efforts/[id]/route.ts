import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { requireMarketingAccess } from '@/lib/marketing-access'

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireMarketingAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('marketing_efforts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
