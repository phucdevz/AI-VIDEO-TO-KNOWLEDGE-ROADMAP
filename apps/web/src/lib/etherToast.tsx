import type { CSSProperties } from 'react'
import toast, { Toaster, type Toast as HotToast } from 'react-hot-toast'
import type { LucideIcon } from 'lucide-react'
import { Copy, RefreshCw, Sparkles, X } from 'lucide-react'

/** Nền glass đồng bộ ds-surface-glass (rgba + blur trong class/style). */
const GLASS_STYLE: CSSProperties = {
  background: 'rgba(16, 30, 56, 0.8)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
}

function EtherToastBar({ t, message, Icon }: { t: HotToast; message: string; Icon: LucideIcon }) {
  return (
    <div
      className="pointer-events-auto flex max-w-[min(100vw-2rem,24rem)] items-start gap-3 rounded-ds-sm border border-ds-primary px-4 py-3 text-ds-text-primary shadow-ds-soft"
      style={GLASS_STYLE}
      role="status"
    >
      <Icon className="h-5 w-5 shrink-0 text-ds-secondary" strokeWidth={1.5} aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{message}</p>
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        className="ds-interactive-icon shrink-0 rounded-ds-sm p-1 text-ds-text-secondary hover:text-ds-text-primary"
        aria-label="Đóng thông báo"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}

export function showEtherToast(message: string, Icon: LucideIcon) {
  toast.custom((t) => <EtherToastBar t={t} message={message} Icon={Icon} />, {
    duration: 4200,
    position: 'bottom-right',
  })
}

/** Thông báo workspace theo yêu cầu (Lucide + glass + viền primary). */
export const etherWorkspaceToasts = {
  copyMilestone: () => showEtherToast('Đã sao chép mốc thời gian', Copy),
  aiAnalysisStart: () => showEtherToast('AI bắt đầu phân tích', Sparkles),
  diagramUpdated: () => showEtherToast('Sơ đồ đã được cập nhật', RefreshCw),
}

export function EtherToaster() {
  return (
    <Toaster
      position="bottom-right"
      containerStyle={{
        bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
        right: 'max(1rem, env(safe-area-inset-right, 0px))',
        zIndex: 390,
      }}
      toastOptions={{
        duration: 4200,
        style: {
          background: 'transparent',
          boxShadow: 'none',
          padding: 0,
          margin: 0,
        },
      }}
    />
  )
}
