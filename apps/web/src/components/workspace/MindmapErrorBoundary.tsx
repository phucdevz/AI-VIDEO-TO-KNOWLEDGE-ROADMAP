import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null }

/**
 * Tránh crash cả Workspace khi React Flow / canvas mindmap lỗi render.
 */
export class MindmapErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[MindmapErrorBoundary]', error.message, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-ds-lg border border-ds-border border-dashed bg-ds-bg/40 p-8 text-center shadow-ds-soft backdrop-blur-[10px]"
        >
          <AlertTriangle className="h-10 w-10 text-amber-400" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="text-sm font-bold text-ds-text-primary">Không hiển thị được sơ đồ tư duy</p>
            <p className="mt-2 max-w-md text-xs text-ds-text-secondary">
              Có thể do dữ liệu sơ đồ không hợp lệ hoặc lỗi tạm thời của canvas. Thử tải lại trang hoặc bấm render
              lại bên dưới.
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm border border-ds-primary bg-ds-primary/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ds-text-primary hover:bg-ds-primary/30"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Thử render lại
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
