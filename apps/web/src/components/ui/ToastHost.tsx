import { X } from 'lucide-react'
import { useToastStore } from '../../stores/useToastStore'

/**
 * Fixed stack above app chrome (z-[200]). Use `useToastStore.getState().pushToast(...)`.
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
          className={[
            'pointer-events-auto ds-surface-glass flex items-start gap-3 rounded-ds-sm border px-4 py-3 shadow-ds-soft backdrop-blur-md',
            t.variant === 'error' && 'border-red-400/40 text-ds-text-primary',
            t.variant === 'success' && 'border-ds-secondary/50 text-ds-text-primary',
            t.variant === 'default' && 'border-ds-border text-ds-text-primary',
          ]
            .filter(Boolean)
            .join(' ')}
          role="status"
        >
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
