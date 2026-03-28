import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Contrast, Download, Palette, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { DEFAULT_TIMELINE_SEGMENTS } from '../../data/lectures'
import {
  extractMindmapNodeLabel,
  resolveSeekFromMindmapLabel,
  syncMindmapNodeCompletion,
} from '../../lib/mindmapLearning'
import { useToastStore } from '../../stores/useToastStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

const DEMO_MERMAID = `mindmap
  root((Lecture core))
    Concepts
      Attention
      Transformers
    Skills
      Implementation
      Evaluation`

export type MindmapDiagramTheme = 'highContrast' | 'softPastel'

const MERMAID_THEME_CONFIG: Record<
  MindmapDiagramTheme,
  { theme: 'dark' | 'base'; themeVariables: Record<string, string> }
> = {
  highContrast: {
    theme: 'dark',
    themeVariables: {
      primaryColor: '#7c3aed',
      primaryTextColor: '#f8fafc',
      secondaryColor: '#1e293b',
      tertiaryColor: '#334155',
      lineColor: '#e2e8f0',
      mainBkg: '#0f172a',
      nodeBorder: '#a78bfa',
      clusterBkg: '#1e293b',
    },
  },
  softPastel: {
    theme: 'base',
    themeVariables: {
      primaryColor: '#e9d5ff',
      primaryTextColor: '#5b21b6',
      secondaryColor: '#fce7f3',
      tertiaryColor: '#dbeafe',
      lineColor: '#a78bfa',
      background: '#faf5ff',
      mainBkg: '#fdf4ff',
      nodeBorder: '#d8b4fe',
      clusterBkg: '#fae8ff',
    },
  },
}

const EXPORT_BG: Record<MindmapDiagramTheme, string> = {
  highContrast: '#0f172a',
  softPastel: '#faf5ff',
}

/**
 * Mermaid mindmap + clickable segments → Deep Time-Linking (seeks video via Zustand).
 */
export function MindmapPanel() {
  const holderRef = useRef<HTMLDivElement>(null)
  const scrollViewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [mapVisible, setMapVisible] = useState(false)
  const [scale, setScale] = useState(1)
  const [diagramTheme, setDiagramTheme] = useState<MindmapDiagramTheme>('highContrast')

  const requestSeek = useWorkspaceStore((s) => s.requestSeek)
  const activeSegmentId = useWorkspaceStore((s) => s.activeSegmentId)
  const videoCurrentTimeSeconds = useWorkspaceStore((s) => s.videoCurrentTimeSeconds)
  const pushToast = useToastStore((s) => s.pushToast)

  const trySeek = (seconds: number, segmentId?: string) => {
    const r = requestSeek(seconds, segmentId)
    if (!r.ok) pushToast(r.message, 'error')
  }

  const zoomIn = useCallback(() => setScale((s) => Math.min(3, Math.round((s * 1.15) * 1000) / 1000)), [])
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.35, Math.round((s / 1.15) * 1000) / 1000)), [])
  const resetView = useCallback(() => {
    setScale(1)
    scrollViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
  }, [])

  const toggleDiagramTheme = useCallback(() => {
    setDiagramTheme((t) => (t === 'highContrast' ? 'softPastel' : 'highContrast'))
  }, [])

  const downloadPng = useCallback(async () => {
    const node = containerRef.current
    if (!node?.querySelector('svg')) {
      pushToast('Chưa có sơ đồ để xuất.', 'default')
      return
    }
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: EXPORT_BG[diagramTheme],
      })
      const a = document.createElement('a')
      a.download = `mindmap-${diagramTheme}-${Date.now()}.png`
      a.href = dataUrl
      a.click()
    } catch {
      pushToast('Không xuất được PNG. Thử theme khác hoặc tải lại trang.', 'error')
    }
  }, [diagramTheme, pushToast])

  useEffect(() => {
    const el = holderRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setMapVisible(true)
          obs.disconnect()
        }
      },
      { root: null, rootMargin: '180px 0px', threshold: 0.02 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!mapVisible) return
    let cancelled = false
    let detachSvg: (() => void) | undefined
    const cfg = MERMAID_THEME_CONFIG[diagramTheme]

    ;(async () => {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        theme: cfg.theme,
        securityLevel: 'loose',
        themeVariables: cfg.themeVariables,
      })
      const id = `mmd-${reactId}-${diagramTheme}`
      try {
        const { svg } = await mermaid.render(id, DEMO_MERMAID)
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = svg
        const root = containerRef.current
        const svgEl = root.querySelector('svg')
        if (svgEl) {
          svgEl.setAttribute('role', 'img')
          svgEl.querySelectorAll('g.node, g[class*="node"]').forEach((g) => {
            const el = g as unknown as HTMLElement
            el.style.cursor = 'pointer'
            const label = extractMindmapNodeLabel(g)
            if (label.length > 0) {
              g.setAttribute('title', label)
            }
          })
          svgEl.querySelectorAll('text').forEach((t) => {
            const full = (t.textContent ?? '').trim()
            if (full.length > 28) {
              t.setAttribute('title', full)
            }
          })

          const onSvgClick = (e: MouseEvent) => {
            const t = e.target as Element | null
            if (!t) return
            const g = t.closest('g.node') ?? t.closest('g[class*="node"]')
            if (!g) return
            e.stopPropagation()
            const label = extractMindmapNodeLabel(g)
            const seconds = resolveSeekFromMindmapLabel(label)
            if (seconds === null) {
              useToastStore.getState().pushToast('Chưa có mốc thời gian cho nút mindmap này.', 'default')
              return
            }
            const r = useWorkspaceStore.getState().requestSeek(seconds, `mmd-${label.slice(0, 48)}`)
            if (!r.ok) useToastStore.getState().pushToast(r.message, 'error')
          }
          svgEl.addEventListener('click', onSvgClick)
          detachSvg = () => svgEl.removeEventListener('click', onSvgClick)
          syncMindmapNodeCompletion(svgEl, useWorkspaceStore.getState().videoCurrentTimeSeconds)
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML =
            '<p class="p-4 text-base text-ds-text-secondary md:text-sm">Mindmap preview unavailable.</p>'
        }
      }
    })()

    return () => {
      cancelled = true
      detachSvg?.()
    }
  }, [reactId, mapVisible, diagramTheme])

  useEffect(() => {
    const svg = containerRef.current?.querySelector('svg')
    if (!svg) return
    syncMindmapNodeCompletion(svg, videoCurrentTimeSeconds)
  }, [videoCurrentTimeSeconds])

  return (
    <div className="relative isolate z-0 flex h-full min-h-0 flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 p-4 shadow-ds-soft backdrop-blur-[10px]">
      <h2 id="workspace-mindmap-title" className="ds-text-label mb-4 text-ds-secondary">
        Neural map
      </h2>
      <div
        ref={holderRef}
        className="relative z-10 flex min-h-[200px] flex-1 flex-col rounded-ds-sm"
        aria-label="Mermaid mindmap"
        aria-busy={!mapVisible}
      >
        {mapVisible ? (
          <div
            className="absolute right-1 top-1 z-20 flex flex-wrap items-center justify-end gap-0.5 rounded-ds-sm border border-ds-border bg-ds-bg/90 p-1 shadow-ds-soft backdrop-blur-md"
            role="toolbar"
            aria-label="Mindmap tools"
          >
            <button
              type="button"
              onClick={zoomOut}
              className="ds-interactive rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
              aria-label="Thu nhỏ"
              title="Thu nhỏ"
            >
              <ZoomOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={zoomIn}
              className="ds-interactive rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
              aria-label="Phóng to"
              title="Phóng to"
            >
              <ZoomIn className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={resetView}
              className="ds-interactive rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
              aria-label="Đặt lại khung nhìn"
              title="Đặt lại khung nhìn"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border" aria-hidden />
            <button
              type="button"
              onClick={downloadPng}
              className="ds-interactive rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
              aria-label="Tải PNG"
              title="Tải PNG"
            >
              <Download className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={toggleDiagramTheme}
              aria-pressed={diagramTheme === 'softPastel'}
              className={`ds-interactive rounded-ds-sm p-2 hover:bg-ds-border/40 ${
                diagramTheme === 'softPastel'
                  ? 'text-ds-secondary'
                  : 'text-ds-text-secondary hover:text-ds-text-primary'
              }`}
              aria-label={
                diagramTheme === 'highContrast'
                  ? 'Chuyển sang Soft Pastel'
                  : 'Chuyển sang High Contrast'
              }
              title={
                diagramTheme === 'highContrast'
                  ? 'Theme: Soft Pastel'
                  : 'Theme: High Contrast'
              }
            >
              {diagramTheme === 'highContrast' ? (
                <Palette className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Contrast className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
        ) : null}
        {!mapVisible ? (
          <p className="p-4 text-sm text-ds-text-secondary">Đang tải sơ đồ…</p>
        ) : null}
        <div
          ref={scrollViewportRef}
          className="min-h-0 flex-1 overflow-auto rounded-ds-sm bg-ds-bg/20 pt-10"
        >
          <div
            className="inline-block origin-top-left will-change-transform"
            style={{ transform: `scale(${scale})` }}
          >
            <div
              ref={containerRef}
              className="mindmap-panel-svg text-ds-text-primary [&_svg]:max-w-none"
            />
          </div>
        </div>
      </div>
      <div className="relative z-10 mt-4 space-y-2 border-t border-ds-border pt-4">
        <h3 className="ds-text-label text-ds-text-secondary">Deep time-links</h3>
        <ul className="flex flex-col gap-2">
          {DEFAULT_TIMELINE_SEGMENTS.map((seg) => (
            <li key={seg.id}>
              <button
                type="button"
                title={seg.label}
                onClick={() => trySeek(seg.startSeconds, seg.id)}
                className={`ds-interactive flex w-full items-start gap-2 rounded-ds-sm px-4 py-2 text-left text-base md:text-sm ${
                  activeSegmentId === seg.id
                    ? 'bg-ds-primary font-bold text-ds-text-primary shadow-ds-soft hover:brightness-110'
                    : 'bg-ds-border/20 font-normal text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary'
                }`}
              >
                <span className="shrink-0 font-mono text-ds-secondary tabular-nums">
                  {formatTime(seg.startSeconds)}
                </span>
                <span className="min-w-0 flex-1 line-clamp-2">{seg.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function formatTime(total: number) {
  if (!Number.isFinite(total) || total < 0) return '--:--'
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
