import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { requireCalendarAccess } from '@/lib/calendar-access'
import { fetchCalendarEvents } from '@/lib/calendar-events'

export async function GET(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const year = Number(searchParams.get('year'))
  const month = Number(searchParams.get('month'))
  if (!year || !month) {
    return NextResponse.json({ error: 'year and month are required.' }, { status: 400 })
  }

  const events = await fetchCalendarEvents(year, month)
  return NextResponse.json({ events })
}

export async function POST(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'Title is required.' }, { status: 400 })
  if (!body.date) return NextResponse.json({ error: 'Date is required.' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .insert({
      title,
      date: body.date,
      time: body.time || null,
      details: body.details || '',
      attendees: Array.isArray(body.attendees) ? body.attendees : [],
      remarks: body.remarks || '',
      created_by: auth.userId,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ event: data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { data: existing, error: fetchError } = await supabaseAdmin.from('calendar_events').select('id').eq('id', id).maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if ('title' in body) updates.title = String(body.title).trim()
  if ('date' in body) updates.date = body.date
  if ('time' in body) updates.time = body.time || null
  if ('details' in body) updates.details = body.details || ''
  if ('attendees' in body) updates.attendees = Array.isArray(body.attendees) ? body.attendees : []
  if ('remarks' in body) updates.remarks = body.remarks || ''

  const { data, error } = await supabaseAdmin.from('calendar_events').update(updates).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ event: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireCalendarAccess()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const { data: existing, error: fetchError } = await supabaseAdmin.from('calendar_events').select('id').eq('id', id).maybeSingle()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const { error } = await supabaseAdmin.from('calendar_events').update({ is_deleted: true }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
