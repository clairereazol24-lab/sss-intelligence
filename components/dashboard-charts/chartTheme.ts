export type ChartPalette = {
  seriesBlue: string
  seriesAqua: string
  grid: string
  axis: string
  text: string
  surface: string
}

export const chartColors: { light: ChartPalette; dark: ChartPalette } = {
  light: {
    seriesBlue: '#2a78d6',
    seriesAqua: '#1baf7a',
    grid: '#e1e0d9',
    axis: '#898781',
    text: '#52514e',
    surface: '#fcfcfb',
  },
  dark: {
    seriesBlue: '#3987e5',
    seriesAqua: '#199e70',
    grid: '#2c2c2a',
    axis: '#898781',
    text: '#c3c2b7',
    surface: '#1a1a19',
  },
}

export const fmtDate = (d: string | unknown): string => {
  if (typeof d !== 'string') return ''
  const parts = d.split('-')
  return `${parts[1]}/${parts[2]}`
}

export const fmtPct = (v?: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `${v.toFixed(1)}%`

export const fmtPhp = (v?: number | null | undefined): string =>
  v === null || v === undefined ? '—' : `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const fmtCount = (v?: number | null | undefined): string =>
  v === null || v === undefined ? '—' : v.toLocaleString('en-PH')
