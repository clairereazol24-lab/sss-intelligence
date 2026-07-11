'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, TooltipValueType } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtPhp } from './chartTheme'

type SeriesPoint = {
  date: string
  total_deposit: number | null
}

export default function TotalDepositsChart({ data }: { data: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Total Deposits (PHP)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis tick={{ fill: c.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toLocaleString('en-PH')} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: TooltipValueType | undefined) => fmtPhp(typeof value === 'number' ? value : undefined)}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="total_deposit" name="Total Deposits" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 6, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
