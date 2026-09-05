import { Skeleton } from '@/components/ui/skeleton'

export default function PageSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  )
}
