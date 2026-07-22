import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabase.from('marketing_efforts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
