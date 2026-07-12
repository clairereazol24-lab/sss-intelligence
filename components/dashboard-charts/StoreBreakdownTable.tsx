'use client'
import { fmtPhp } from './chartTheme'

type StoreRow = {
  store_name: string
  registered_members: number
  active_member: number
  total_deposit: number
}

export default function StoreBreakdownTable({ stores }: { stores: StoreRow[] }) {
  if (stores.length === 0) {
    return <p className="text-xs text-gray-400 dark:text-gray-500">No store data for this partner in the last 14 days.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-700">
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Store</th>
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Registered Members</th>
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Active Member</th>
            <th className="px-3 py-2.5 text-center text-gray-500 dark:text-gray-400 font-medium">Total Deposit</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s, i) => (
            <tr key={`${s.store_name}-${i}`} className="border-t border-gray-100 dark:border-gray-700">
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300 font-medium">{s.store_name}</td>
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{s.registered_members.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{s.active_member.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-center text-gray-700 dark:text-gray-300">{fmtPhp(s.total_deposit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
