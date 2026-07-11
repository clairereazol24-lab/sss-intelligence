'use client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipValueType } from 'recharts'
import { useTheme } from '@/components/ThemeProvider'
import { chartColors, fmtDate, fmtPct, fmtPhp } from './chartTheme'

type SeriesPoint = {
  date: string
  conversion_rate: number | null
  retention_7d: number | null
  avg_deposit_per_member: number | null
}

function computeDomain(values: (number | null | undefined)[]): [number, number] {
  const nums = values.filter((v): v is number => v !== null && v !== undefined)
  if (nums.length === 0) return [0, 1]
  const min = Math.min(0, ...nums)
  const max = Math.max(...nums)
  const pad = (max - min) * 0.1 || 1
  return [Math.floor(min - pad), Math.ceil(max + pad)]
}

export default function EfficiencyLoyaltyChart({ lastWeek, thisWeek }: { lastWeek: SeriesPoint[]; thisWeek: SeriesPoint[] }) {
  const { theme } = useTheme()
  const c = chartColors[theme]

  const all = [...lastWeek, ...thisWeek]
  const leftDomain = computeDomain(all.flatMap(d => [d.conversion_rate, d.retention_7d]))
  const rightDomain = computeDomain(all.map(d => d.avg_deposit_per_member))

  const renderPanel = (data: SeriesPoint[], label: string, key: string) => (
    <div key={key}>
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 text-center mb-2">{label}</h4>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fill: c.axis, fontSize: 10 }} axisLine={{ stroke: c.axis }} tickLine={false} />
          <YAxis yAxisId="left" domain={leftDomain} tick={{ fill: c.axis, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
          <YAxis yAxisId="right" orientation="right" domain={rightDomain} tick={{ fill: c.axis, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v.toLocaleString('en-PH')} />
          <Tooltip
            labelFormatter={fmtDate}
            formatter={(value: TooltipValueType | undefined, name: number | string | undefined) => {
              const num = typeof value === 'number' ? value : undefined
              return name === 'Avg Deposit/Member' ? fmtPhp(num) : fmtPct(num)
            }}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, color: c.text, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: c.text }} />
          <Line yAxisId="left" type="monotone" dataKey="conversion_rate" name="Conversion Rate" stroke={c.seriesBlue} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
          <Line yAxisId="left" type="monotone" dataKey="retention_7d" name="7-Day Retention" stroke={c.seriesAqua} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
          <Line yAxisId="right" type="monotone" dataKey="avg_deposit_per_member" name="Avg Deposit/Member" stroke={c.seriesYellow} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: c.surface }} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 dark:bg-gray-800 dark:border-gray-700">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-center">Efficiency & Loyalty Metrics</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderPanel(lastWeek, 'Last Week', 'last')}
        {renderPanel(thisWeek, 'This Week', 'this')}
      </div>
    </div>
  )
}
