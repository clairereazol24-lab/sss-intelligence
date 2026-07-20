import { supabaseAdmin } from '@/lib/supabase-admin'
import type { CalendarEvent } from '@/lib/supabase'

export async function fetchCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const mm = String(month).padStart(2, '0')
  const startDate = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

  const { data, error } = await supabaseAdmin
    .from('calendar_events')
    .select('*')
    .eq('is_deleted', false)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
  if (error) throw new Error(error.message)

  return (data || []) as CalendarEvent[]
}
