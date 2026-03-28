import { motion, useAnimation } from 'framer-motion'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Contrast, Copy, Download, Palette, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { TimelineSegment } from '../../data/lectures'
import { DEFAULT_TIMELINE_SEGMENTS } from '../../data/lectures'
import {
  extractMindmapNodeLabel,
  findMindmapNodeGroupForSegmentId,
  resolveClipRangeFromMindmapLabel,
  resolveSeekFromMindmapLabel,
  scrollMindmapNodeIntoViewportCenter,
  syncMindmapNodeCompletion,
} from '../../lib/mindmapLearning'
import { etherWorkspaceToasts } from '../../lib/etherToast'
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
      /* Viền/link nhạt — màu nét & fill nút chủ yếu do CSS .mindmap-panel-svg */
      primaryColor: '#7c4dff',
      primaryTextColor: '#e6f1ff',
      secondaryColor: '#1e293b',
      tertiaryColor: '#334155',
      lineColor: 'rgba(136, 146, 176, 0.45)',
      mainBkg: '#0f172a',
      nodeBorder: '#7c4dff',
      clusterBkg: '#1e293b',
      git0: 'rgba(124, 77, 255, 0.22)',
      gitBranchLabel0: '#e6f1ff',
    },
  },
  softPastel: {
    theme: 'base',
    themeVariables: {
      primaryColor: '#7c4dff',
      primaryTextColor: '#0a192f',
      secondaryColor: '#fae8ff',
      tertiaryColor: '#ede9fe',
      lineColor: 'rgba(136, 146, 176, 0.55)',
      background: '#faf5ff',
      mainBkg: '#fdf4ff',
      nodeBorder: '#7c4dff',
      clusterBkg: '#fae8ff',
      git0: 'rgba(124, 77, 255, 0.2)',
      gitBranchLabel0: '#312e81',
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
  const diagramMotion = useAnimation()
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [mapVisible, setMapVisible] = useState(false)
  const [scale, setScale] = useState(1)
  const [diagramTheme, setDiagramTheme] = useState<MindmapDiagramTheme>('highContrast')
  const [mindContextMenu, setMindContextMenu] = useState<{
    x: number
    y: number
    nodeLabel: string
    startSeconds: number
    endSeconds: number
  } | null>(null)

  const requestSeek = useWorkspaceStore((s) => s.requestSeek)
  const addMindmapHighlight = useWorkspaceStore((s) => s.addMindmapHighlight)
  const activeSegmentId = useWorkspaceStore((s) => s.activeSegmentId)
  const videoCurrentTimeSeconds = useWorkspaceStore((s) => s.videoCurrentTimeSeconds)
  const pushToast = useToastStore((s) => s.pushToast)

  const panMindmapToSegment = useCallback((segmentId: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vp = scrollViewportRef.current
        const svg = containerRef.current?.querySelector('svg')
        if (!vp || !svg) return
        const g = findMindmapNodeGroupForSegmentId(svg, segmentId)
        if (!g) return
        scrollMindmapNodeIntoViewportCenter(vp, g)
      })
    })
  }, [])

  const onDeepTimeLinkClick = useCallback(
    (seg: TimelineSegment) => {
      const r = requestSeek(seg.startSeconds, seg.id)
      if (!r.ok) {
        pushToast(r.message, 'error')
        return
      }
      panMindmapToSegment(seg.id)
    },
    [panMindmapToSegment, pushToast, requestSeek],
  )

  const copySegmentToClipboard = useCallback(async (seg: TimelineSegment) => {
    const line = `${formatTime(seg.startSeconds)} — ${seg.label}`
    try {
      await navigator.clipboard.writeText(line)
      etherWorkspaceToasts.copyMilestone()
    } catch {
      pushToast('Không sao chép được.', 'error')
    }
  }, [pushToast])

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
    if (!mindContextMenu) return
    const close = () => setMindContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', close)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', close)
    }
  }, [mindContextMenu])

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

    ;(async () => {
      void diagramMotion.set({ opacity: 0, scale: 0.92 })
      const mermaid = (await import('mermaid')).default
      const cfg = MERMAID_THEME_CONFIG[diagramTheme]
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: cfg.theme,
        themeVariables: cfg.themeVariables,
      })
      const id = `mmd-${reactId}`
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
          const onSvgContextMenu = (e: MouseEvent) => {
            const t = e.target as Element | null
            if (!t) return
            const g = t.closest('g.node') ?? t.closest('g[class*="node"]')
            if (!g) return
            e.preventDefault()
            e.stopPropagation()
            const label = extractMindmapNodeLabel(g)
            const range = resolveClipRangeFromMindmapLabel(label)
            if (!range) {
              useToastStore.getState().pushToast('Chưa gắn khoảng thời gian cho nút này.', 'default')
              return
            }
            setMindContextMenu({
              x: e.clientX,
              y: e.clientY,
              nodeLabel: label,
              startSeconds: range.start,
              endSeconds: range.end,
            })
          }
          svgEl.addEventListener('click', onSvgClick)
          svgEl.addEventListener('contextmenu', onSvgContextMenu)
          detachSvg = () => {
            svgEl.removeEventListener('click', onSvgClick)
            svgEl.removeEventListener('contextmenu', onSvgContextMenu)
          }
          syncMindmapNodeCompletion(svgEl, useWorkspaceStore.getState().videoCurrentTimeSeconds)
          if (!cancelled) {
            etherWorkspaceToasts.diagramUpdated()
          }
        }
        if (!cancelled) {
          void diagramMotion.start({
            opacity: 1,
            scale: 1,
            transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          })
        }
      } catch {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML =
            '<p class="p-4 text-base text-ds-text-secondary md:text-sm">Mindmap preview unavailable.</p>'
        }
        if (!cancelled) {
          void diagramMotion.start({
            opacity: 1,
            scale: 1,
            transition: { duration: 0.25 },
          })
        }
      }
    })()

    return () => {
      cancelled = true
      detachSvg?.()
      diagramMotion.stop()
    }
  }, [diagramMotion, diagramTheme, reactId, mapVisible])

  useEffect(() => {
    const svg = containerRef.current?.querySelector('svg')
    if (!svg) return
    syncMindmapNodeCompletion(svg, videoCurrentTimeSeconds)
  }, [videoCurrentTimeSeconds])

  const saveMindmapBookmark = useCallback(() => {
    if (!mindContextMenu) return
    const r = addMindmapHighlight({
      nodeLabel: mindContextMenu.nodeLabel,
      startSeconds: mindContextMenu.startSeconds,
      endSeconds: mindContextMenu.endSeconds,
    })
    setMindContextMenu(null)
    if (!r.ok) {
      pushToast(r.message, r.message.includes('Đã lưu') ? 'default' : 'error')
      return
    }
    pushToast('Đã lưu vào Highlights.', 'default')
  }, [addMindmapHighlight, mindContextMenu, pushToast])

  return (
    <div className="relative isolate z-0 flex h-full min-h-0 flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 p-4 shadow-ds-soft backdrop-blur-[10px]">
      {mindContextMenu ? (
        <div
          role="menu"
          aria-label="Tùy chọn nút mindmap"
          className="fixed z-[300] min-w-[14rem] overflow-hidden rounded-ds-sm border border-ds-primary/60 bg-[rgba(16,30,56,0.92)] py-1 shadow-ds-soft backdrop-blur-md"
          style={{
            left: Math.min(mindContextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 240 : 0),
            top: Math.min(mindContextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 52 : 0),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            className="ds-interactive flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/20"
            onClick={saveMindmapBookmark}
          >
            Lưu vào mục ưa thích
          </button>
          <p className="border-t border-ds-border/50 px-4 py-2 text-[11px] leading-snug text-ds-text-secondary">
            {formatTime(mindContextMenu.startSeconds)} → {formatTime(mindContextMenu.endSeconds)} ·{' '}
            <span className="line-clamp-2">{mindContextMenu.nodeLabel}</span>
          </p>
        </div>
      ) : null}
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
          <motion.div
            className="inline-block origin-top-left will-change-[opacity,transform]"
            initial={false}
            animate={diagramMotion}
          >
            <div
              className="inline-block origin-top-left will-change-transform"
              style={{ transform: `scale(${scale})` }}
            >
              <div
                ref={containerRef}
                data-mindmap-theme={diagramTheme}
                className="mindmap-panel-svg text-ds-text-primary [&_svg]:max-w-none"
              />
            </div>
          </motion.div>
        </div>
      </div>
      <div className="relative z-10 mt-4 space-y-2 border-t border-ds-border pt-4">
        <h3 className="ds-text-label text-ds-text-secondary">Deep time-links</h3>
        <ul className="flex flex-col gap-2">
          {DEFAULT_TIMELINE_SEGMENTS.map((seg) => (
            <li key={seg.id} className="flex items-stretch gap-1">
              <button
                type="button"
                title={seg.label}
                onClick={() => onDeepTimeLinkClick(seg)}
                className={`ds-interactive flex min-w-0 flex-1 items-start gap-2 rounded-ds-sm px-4 py-2 text-left text-base md:text-sm ${
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
              <button
                type="button"
                title="Sao chép mốc thời gian"
                aria-label={`Sao chép mốc ${formatTime(seg.startSeconds)}`}
                onClick={() => void copySegmentToClipboard(seg)}
                className="ds-interactive-icon shrink-0 self-stretch rounded-ds-sm border border-ds-border/60 bg-ds-border/15 px-2.5 text-ds-text-secondary hover:border-ds-primary/40 hover:text-ds-text-primary"
              >
                <Copy className="mx-auto h-4 w-4" strokeWidth={1.5} aria-hidden />
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
