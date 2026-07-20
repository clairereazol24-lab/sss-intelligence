import { requireCalendarAccess } from '@/lib/calendar-access'
import { fetchCalendarEvents } from '@/lib/calendar-events'
import CalendarClient from './CalendarClient'

export default async function Page() {
  const auth = await requireCalendarAccess()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const initialEvents = auth ? await fetchCalendarEvents(year, month) : []

  return (
    <CalendarClient
      initialEvents={initialEvents}
      initialYear={year}
      initialMonth={month}
      initialIsAdmin={auth?.access.role === 'admin'}
      initialUserId={auth?.userId}
    />
  )
}
