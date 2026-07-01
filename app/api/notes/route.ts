import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { data, error } = await supabase.from('performance_notes').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(request: NextRequest) {
  const { entity_type, entity_key, partner, notes } = await request.json()
  const { error } = await supabase.from('performance_notes').upsert(
    { entity_type, entity_key, partner: partner ?? '', notes, updated_at: new Date().toISOString() },
    { onConflict: 'entity_type,entity_key,partner' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
