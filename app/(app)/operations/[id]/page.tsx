import OperationsBoard from '../OperationsBoard'

export default function Page({ params }: { params: { id: string } }) {
  return <OperationsBoard initialSelectedId={params.id} />
}
