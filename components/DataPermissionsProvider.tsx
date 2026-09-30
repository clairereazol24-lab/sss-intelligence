'use client'
import { createContext, useContext } from 'react'
import type { DataPermissionKey } from '@/lib/auth'

const DataPermissionsContext = createContext<DataPermissionKey[]>([])

export function DataPermissionsProvider({ permissions, children }: { permissions: DataPermissionKey[]; children: React.ReactNode }) {
  return <DataPermissionsContext.Provider value={permissions}>{children}</DataPermissionsContext.Provider>
}

// UI-only: hides Import/Export buttons. The API routes enforce the same toggles.
export function useDataPermissions() {
  const permissions = useContext(DataPermissionsContext)
  return {
    canImport: permissions.includes('data_import'),
    canExport: permissions.includes('data_export'),
  }
}
