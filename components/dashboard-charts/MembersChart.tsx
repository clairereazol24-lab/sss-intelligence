'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipValueType } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtCount } from './chartTheme'

type SeriesPoint = {
  date: string
  registered_members: number | null
  effective_member: number | null
}

export default function MembersChart({ data }: { data: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Registered Members & Effective Member</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toLocaleString('en-PH')} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: TooltipValueType | undefined) => fmtCount(typeof value === 'number' ? value : undefined)}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: c.text }} />
          <Line type="monotone" dataKey="registered_members" name="Registered Members" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
          <Line type="monotone" dataKey="effective_member" name="Effective Member" stroke={c.seriesAqua} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
