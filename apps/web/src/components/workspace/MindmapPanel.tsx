import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import { motion } from 'framer-motion'
import { Contrast, Copy, Download, Maximize2, Palette, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toPng } from 'html-to-image'
import type { TimelineSegment } from '../../data/lectures'
import { DEFAULT_TIMELINE_SEGMENTS } from '../../data/lectures'
import {
  collectMindmapLabels,
  DEMO_WORKSPACE_MINDMAP_TREE,
  getNeuralLedEdgeIds,
  mindmapTreeToReactFlow,
  type MindmapDiagramTheme,
  type NeuralFlowGraphEdge,
  type NeuralFlowGraphNode,
} from '../../lib/mindmapToReactFlow'
import {
  resolveClipRangeFromMindmapLabel,
  resolveSeekFromMindmapLabel,
} from '../../lib/mindmapLearning'
import { etherWorkspaceToasts } from '../../lib/etherToast'
import { useToastStore } from '../../stores/useToastStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { NeuralFlowEdge } from './NeuralFlowEdge'
import { NeuralNode } from './NeuralNode'

const EXPORT_BG: Record<MindmapDiagramTheme, string> = {
  highContrast: '#0f172a',
  softPastel: '#faf5ff',
}

const SEGMENT_TO_FLOW_NODE: Record<string, string> = {
  s1: 'root',
  s2: 'attention',
  s3: 'transformers',
}

const nodeTypes = { neural: NeuralNode }
const edgeTypes = { neuralFlow: NeuralFlowEdge }

type MindContextMenuState = {
  x: number
  y: number
  nodeLabel: string
  startSeconds: number
  endSeconds: number
} | null

function MindmapFlowCanvas({
  diagramTheme,
  exportContainerRef,
  setMindContextMenu,
  registerFocusSegment,
}: {
  diagramTheme: MindmapDiagramTheme
  exportContainerRef: MutableRefObject<HTMLDivElement | null>
  setMindContextMenu: Dispatch<SetStateAction<MindContextMenuState>>
  registerFocusSegment: (fn: (segmentId: string) => void) => void
}) {
  const notifiedRef = useRef(false)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  const labels = useMemo(() => collectMindmapLabels(DEMO_WORKSPACE_MINDMAP_TREE), [])
  const { nodes: seedNodes, edges: seedEdges } = useMemo(
    () => mindmapTreeToReactFlow(DEMO_WORKSPACE_MINDMAP_TREE, diagramTheme),
    [diagramTheme],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<NeuralFlowGraphNode>(seedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<NeuralFlowGraphEdge>(seedEdges)

  useEffect(() => {
    const { nodes: n, edges: e } = mindmapTreeToReactFlow(DEMO_WORKSPACE_MINDMAP_TREE, diagramTheme)
    setNodes(n)
    setEdges(e)
  }, [diagramTheme, setNodes, setEdges])

  const videoCurrentTimeSeconds = useWorkspaceStore((s) => s.videoCurrentTimeSeconds)

  const ledEdgeIds = useMemo(
    () => getNeuralLedEdgeIds(videoCurrentTimeSeconds, labels),
    [labels, videoCurrentTimeSeconds],
  )

  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: { ...e.data, active: ledEdgeIds.has(e.id) },
      })),
    )
  }, [ledEdgeIds, setEdges])

  const requestSeek = useWorkspaceStore((s) => s.requestSeek)
  const pushToast = useToastStore((s) => s.pushToast)

  const focusSegmentOnCanvas = useCallback(
    (segmentId: string) => {
      const id = SEGMENT_TO_FLOW_NODE[segmentId]
      if (!id) return
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fitView({ nodes: [{ id }], padding: 0.38, duration: 300 })
        })
      })
    },
    [fitView],
  )

  useEffect(() => {
    registerFocusSegment(focusSegmentOnCanvas)
  }, [focusSegmentOnCanvas, registerFocusSegment])

  const onInit = useCallback(() => {
    fitView({ padding: 0.22, duration: 0 })
    if (!notifiedRef.current) {
      notifiedRef.current = true
      etherWorkspaceToasts.diagramUpdated()
    }
  }, [fitView])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: NeuralFlowGraphNode) => {
      const label = String(node.data.label ?? '')
      const seconds = resolveSeekFromMindmapLabel(label)
      if (seconds === null) {
        useToastStore.getState().pushToast('Chưa có mốc thời gian cho nút mindmap này.', 'default')
        return
      }
      const r = requestSeek(seconds, `flow-${label.slice(0, 48)}`)
      if (!r.ok) pushToast(r.message, 'error')
    },
    [pushToast, requestSeek],
  )

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: NeuralFlowGraphNode) => {
      e.preventDefault()
      const label = String(node.data.label ?? '')
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
    },
    [setMindContextMenu],
  )

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail === 2) {
        fitView({ padding: 0.22, duration: 220 })
      }
    },
    [fitView],
  )

  const controlBtnClass =
    'ds-interactive flex items-center justify-center rounded-ds-sm !border-0 !bg-transparent p-2 text-ds-text-secondary hover:!text-ds-text-primary'

  return (
    <div
      ref={exportContainerRef}
      data-knowledge-mindmap-export=""
      data-mindmap-theme={diagramTheme}
      className={[
        'mindmap-react-flow-host h-full min-h-[280px] rounded-ds-sm',
        diagramTheme === 'softPastel' ? 'bg-ds-bg/[0.12]' : 'bg-ds-bg/25',
      ].join(' ')}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={onInit}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag
        minZoom={0.12}
        maxZoom={2.25}
        proOptions={{ hideAttribution: true }}
        fitView={false}
        className="h-full min-h-[280px] rounded-ds-sm"
      >
        <Background
          id="mindmap-bg"
          gap={20}
          size={1}
          color="#102038"
          variant={BackgroundVariant.Dots}
        />
        <MiniMap
          position="bottom-left"
          pannable
          zoomable
          className="ds-surface-glass !m-3 !overflow-hidden rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px]"
          maskColor="rgba(10, 25, 47, 0.5)"
          nodeStrokeWidth={2}
          nodeStrokeColor="#7c4dff"
          nodeColor={() => 'rgba(124, 77, 255, 0.32)'}
        />
        <Controls
          position="top-right"
          showZoom={false}
          showFitView={false}
          showInteractive={false}
          orientation="vertical"
          className="mindmap-flow-controls ds-surface-glass m-2 flex flex-col gap-0.5 rounded-ds-lg border border-ds-border p-1 shadow-ds-soft backdrop-blur-[10px]"
        >
          <ControlButton
            onClick={() => zoomOut()}
            className={controlBtnClass}
            title="Thu nhỏ"
            aria-label="Thu nhỏ"
          >
            <ZoomOut className="h-4 w-4" strokeWidth={1.5} />
          </ControlButton>
          <ControlButton
            onClick={() => zoomIn()}
            className={controlBtnClass}
            title="Phóng to"
            aria-label="Phóng to"
          >
            <ZoomIn className="h-4 w-4" strokeWidth={1.5} />
          </ControlButton>
          <ControlButton
            onClick={() => fitView({ padding: 0.22, duration: 220 })}
            className={controlBtnClass}
            title="Vừa khung (hoặc double-click canvas)"
            aria-label="Vừa khung"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={1.5} />
          </ControlButton>
        </Controls>
      </ReactFlow>
    </div>
  )
}

/**
 * React Flow infinite canvas + deep time-links (seeks video via Zustand).
 */
export function MindmapPanel() {
  const holderRef = useRef<HTMLDivElement>(null)
  const exportWrapRef = useRef<HTMLDivElement>(null)
  const focusSegmentRef = useRef<(segmentId: string) => void>(() => {})
  const [mapVisible, setMapVisible] = useState(false)
  const [diagramTheme, setDiagramTheme] = useState<MindmapDiagramTheme>('highContrast')
  const [mindContextMenu, setMindContextMenu] = useState<MindContextMenuState>(null)

  const registerFocusSegment = useCallback((fn: (segmentId: string) => void) => {
    focusSegmentRef.current = fn
  }, [])

  const requestSeek = useWorkspaceStore((s) => s.requestSeek)
  const addMindmapHighlight = useWorkspaceStore((s) => s.addMindmapHighlight)
  const activeSegmentId = useWorkspaceStore((s) => s.activeSegmentId)
  const pushToast = useToastStore((s) => s.pushToast)

  const onDeepTimeLinkClick = useCallback(
    (seg: TimelineSegment) => {
      const r = requestSeek(seg.startSeconds, seg.id)
      if (!r.ok) {
        pushToast(r.message, 'error')
        return
      }
      focusSegmentRef.current(seg.id)
    },
    [pushToast, requestSeek],
  )

  const copySegmentToClipboard = useCallback(
    async (seg: TimelineSegment) => {
      const line = `${formatTime(seg.startSeconds)} — ${seg.label}`
      try {
        await navigator.clipboard.writeText(line)
        etherWorkspaceToasts.copyMilestone()
      } catch {
        pushToast('Không sao chép được.', 'error')
      }
    },
    [pushToast],
  )

  const toggleDiagramTheme = useCallback(() => {
    setDiagramTheme((t) => (t === 'highContrast' ? 'softPastel' : 'highContrast'))
  }, [])

  const downloadPng = useCallback(async () => {
    const node = exportWrapRef.current
    if (!node) {
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
        aria-label="React Flow mindmap canvas"
        aria-busy={!mapVisible}
      >
        {mapVisible ? (
          <div
            className="absolute right-1 top-1 z-20 flex flex-wrap items-center justify-end gap-0.5 rounded-ds-sm border border-ds-border bg-ds-bg/90 p-1 shadow-ds-soft backdrop-blur-md"
            role="toolbar"
            aria-label="Mindmap export & theme"
          >
            <button
              type="button"
              onClick={downloadPng}
              className="ds-interactive rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
              aria-label="Tải PNG"
              title="Tải PNG"
            >
              <Download className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <span className="mx-0.5 h-5 w-px shrink-0 bg-ds-border" aria-hidden />
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
                diagramTheme === 'highContrast' ? 'Theme: Soft Pastel' : 'Theme: High Contrast'
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
        <div className="min-h-0 flex-1 overflow-hidden rounded-ds-sm pt-10">
          <motion.div
            className="h-full min-h-[300px] will-change-[opacity,transform]"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            {mapVisible ? (
              <ReactFlowProvider>
                <MindmapFlowCanvas
                  diagramTheme={diagramTheme}
                  exportContainerRef={exportWrapRef}
                  setMindContextMenu={setMindContextMenu}
                  registerFocusSegment={registerFocusSegment}
                />
              </ReactFlowProvider>
            ) : null}
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
