import { requireOpsAccess } from '@/lib/ops-access'
import { fetchOpsTaskList } from '@/lib/ops-tasks'
import OperationsBoard from '../OperationsBoard'

export default async function Page({ params }: { params: { id: string } }) {
  const auth = await requireOpsAccess()
  const initialTasks = auth ? await fetchOpsTaskList(auth) : undefined

  return (
    <OperationsBoard
      initialSelectedId={params.id}
      initialTasks={initialTasks}
      initialIsAdmin={auth?.access.role === 'admin'}
    />
  )
}
