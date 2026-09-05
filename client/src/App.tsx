import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await api.get('/health')).data as { status: string; db: string },
  })

  const label = isLoading ? 'checking...' : isError ? 'server down' : `${data?.status} / db ${data?.db}`

  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold text-primary">DealFlow360</h1>
      <p className="text-muted-foreground text-sm">
        server: <span className="font-mono">{label}</span>
      </p>
      <Button>Odoo-purple button</Button>
    </div>
  )
}
