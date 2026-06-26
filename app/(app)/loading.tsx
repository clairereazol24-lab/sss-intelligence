export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    </div>
  )
}
