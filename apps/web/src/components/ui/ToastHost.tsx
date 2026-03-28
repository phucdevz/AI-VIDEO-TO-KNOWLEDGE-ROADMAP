import { AlertCircle, Check, Info, Loader2, X } from 'lucide-react'
import type { ToastVariant } from '../../stores/useToastStore'
import { useToastStore } from '../../stores/useToastStore'

function ToastIcon({ variant }: { variant: ToastVariant }) {
  const cls = 'h-5 w-5 shrink-0 stroke-[1.5]'
  switch (variant) {
    case 'success':
      return <Check className={`${cls} text-ds-secondary`} aria-hidden />
    case 'error':
      return <AlertCircle className={`${cls} text-red-400`} aria-hidden />
    case 'info':
      return <Loader2 className={`${cls} animate-spin text-ds-primary`} aria-hidden />
    default:
      return <Info className={`${cls} text-ds-text-secondary`} aria-hidden />
  }
}

/**
 * Fixed stack above app chrome (z-[200]). Use `useToastStore.getState().pushToast(...)`.
 * Surface: glass + viền primary (design system).
 */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div
      className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-[200] flex max-w-[min(100vw-2rem,24rem)] flex-col gap-2 sm:bottom-6 sm:right-6"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto ds-surface-glass flex items-start gap-3 rounded-ds-sm border border-ds-primary px-4 py-3 text-ds-text-primary shadow-ds-soft backdrop-blur-md"
          role={t.variant === 'error' ? 'alert' : 'status'}
        >
          <ToastIcon variant={t.variant} />
          <p className="min-w-0 flex-1 text-base font-medium leading-snug md:text-sm">{t.message}</p>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="ds-interactive-icon shrink-0 rounded-ds-sm p-1 text-ds-text-secondary hover:text-ds-text-primary"
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  )
}
