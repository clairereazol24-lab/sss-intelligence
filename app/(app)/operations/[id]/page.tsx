import TaskDetailClient from './TaskDetailClient'

export default function Page({ params }: { params: { id: string } }) {
  return <TaskDetailClient taskId={params.id} />
}
