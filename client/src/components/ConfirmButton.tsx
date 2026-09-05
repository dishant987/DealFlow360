import { useState, type ComponentProps, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

/**
 * A button that asks before doing something destructive.
 * Keeps the trigger looking like any other Button so call sites stay unchanged.
 */
export default function ConfirmButton({
  title,
  description,
  confirmLabel = 'Delete',
  destructive = true,
  onConfirm,
  children,
  ...buttonProps
}: {
  title: string
  description?: ReactNode
  confirmLabel?: string
  /** red confirm button; set false for non-destructive confirmations like sign-out */
  destructive?: boolean
  onConfirm: () => void
  children: ReactNode
} & Omit<ComponentProps<typeof Button>, 'onClick'>) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        {...buttonProps}
        onClick={(e) => {
          e.stopPropagation() // never trigger a row click behind us
          setOpen(true)
        }}
      >
        {children}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={destructive ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
              onClick={() => {
                setOpen(false)
                onConfirm()
              }}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
