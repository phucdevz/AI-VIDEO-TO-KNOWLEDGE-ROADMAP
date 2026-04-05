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
import { Contrast, Copy, Download, Map, Maximize2, Minimize2, Palette, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { toPng } from 'html-to-image'
import type { MindmapDiagramTheme, NeuralFlowGraphEdge, NeuralFlowGraphNode } from '../../lib/mindmapToReactFlow'
import { buildEtherDemoFlow } from '../../lib/etherMindmapDemo'
import type { EtherMindmapEdge, EtherMindmapNode } from '../../lib/etherMindmapTypes'
import { dispatchEtherMindmapSeek } from '../../lib/etherMindmapTypes'
import { pipelineToEtherMindmap } from '../../lib/pipelineToEtherMindmap'
import { useIsMobileViewport } from '../../hooks/useMatchMedia'
import {
  resolveClipRangeFromMindmapLabel,
  resolveSeekFromMindmapLabel,
} from '../../lib/mindmapLearning'
import { MAX_SEEK_SECONDS } from '../../lib/validateSeekSeconds'
import type { KnowledgeChunk, TranscriptSegment } from '../../stores/useWorkspaceStore'
import { etherWorkspaceToasts } from '../../lib/etherToast'
import { useToastStore } from '../../stores/useToastStore'
import { useEtherMindmapStore } from '../../stores/useEtherMindmapStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { EtherBezierEdge, EtherCrossLinkEdge } from './ether/EtherMindmapEdges'
import { EtherCentralNode, EtherPillNode } from './ether/EtherMindmapNodes'

const EXPORT_BG: Record<MindmapDiagramTheme, string> = {
  highContrast: '#0f172a',
  softPastel: '#faf5ff',
}

const SEGMENT_TO_FLOW_NODE: Record<string, string> = {
  s1: 'root',
  s2: 'attention',
  s3: 'transformers',
}

const nodeTypes = { etherCentral: EtherCentralNode, etherPill: EtherPillNode }
const edgeTypes = { etherBezier: EtherBezierEdge, etherCross: EtherCrossLinkEdge }

type MindContextMenuState = {
  x: number
  y: number
  nodeLabel: string
  startSeconds: number
  endSeconds: number
} | null

type DeepTimeLink = {
  id: string
  startSeconds: number
  endSeconds: number
  label: string
  kind: 'chunk' | 'segment'
}

/**
 * Khoảng clip cho Highlights: ưu tiên segment ASR nếu có; nếu không thì chunk chứa `timestamp`;
 * cuối cùng cửa sổ ~90s quanh mốc (pipeline thật không khớp nhãn demo).
 */
function resolveBookmarkClipRangeFromNode(
  node: { data?: { label?: string; timestamp?: number } },
  transcriptSegments: TranscriptSegment[],
  knowledgeChunks: KnowledgeChunk[],
): { start: number; end: number } | null {
  const label = String(node.data?.label ?? '')
  const ts = (node.data as { timestamp?: number })?.timestamp

  if (typeof ts === 'number' && Number.isFinite(ts)) {
    if (transcriptSegments.length > 0) {
      const seg =
        transcriptSegments.find((s) => ts >= s.start && ts <= s.end) ??
        transcriptSegments.reduce((best, s) => {
          const bestMid = (best.start + best.end) / 2
          const mid = (s.start + s.end) / 2
          return Math.abs(ts - mid) < Math.abs(ts - bestMid) ? s : best
        })
      const start = Number.isFinite(seg.start) ? seg.start : ts
      let end = Number.isFinite(seg.end) ? seg.end : ts
      if (end <= start) end = start + 0.25
      return { start, end }
    }

    const chunk = knowledgeChunks.find(
      (c) =>
        Number.isFinite(c.start_seconds) &&
        Number.isFinite(c.end_seconds) &&
        c.end_seconds > c.start_seconds &&
        ts >= c.start_seconds &&
        ts <= c.end_seconds,
    )
    if (chunk) {
      return { start: chunk.start_seconds, end: chunk.end_seconds }
    }

    const start = Math.max(0, ts)
    const end = Math.min(start + 90, MAX_SEEK_SECONDS)
    if (end > start + 0.25) return { start, end }
    return null
  }

  return resolveClipRangeFromMindmapLabel(label)
}

function MindmapFlowCanvas({
  diagramTheme,
  exportContainerRef,
  setMindContextMenu,
  registerFocusSegment,
  showMiniMap,
  showFlowChrome,
  panOnDrag,
}: {
  diagramTheme: MindmapDiagramTheme
  exportContainerRef: MutableRefObject<HTMLDivElement | null>
  setMindContextMenu: Dispatch<SetStateAction<MindContextMenuState>>
  registerFocusSegment: (fn: (segmentId: string) => void) => void
  showMiniMap: boolean
  /** Nút zoom / vừa khung trong canvas (luôn bật; MiniMap vẫn tắt trên mobile). */
  showFlowChrome: boolean
  /** Kéo để pan graph; trên mobile cần bật để dùng được Neural map. */
  panOnDrag: boolean
}) {
  const notifiedRef = useRef(false)
  const { fitView, zoomIn, zoomOut } = useReactFlow()

  const pipelineReactFlow = useWorkspaceStore((s) => s.pipelineReactFlow)
  const transcriptSegments = useWorkspaceStore((s) => s.transcriptSegments)
  const knowledgeChunks = useWorkspaceStore((s) => s.knowledgeChunks)

  const [nodes, setNodes, onNodesChange] = useNodesState<EtherMindmapNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<EtherMindmapEdge>([])
  const setMindmapGraph = useEtherMindmapStore((s) => s.setMindmapGraph)

  useEffect(() => {
    if (pipelineReactFlow?.nodes?.length) {
      const rawNodes = pipelineReactFlow.nodes as unknown as NeuralFlowGraphNode[]
      const rawEdges = (pipelineReactFlow.edges ?? []) as unknown as NeuralFlowGraphEdge[]

      // Sanitize graph to avoid ReactFlow crashes on long/dirty payloads.
      const safeNodes = (Array.isArray(rawNodes) ? rawNodes : [])
        .filter((n) => n && typeof n === 'object' && typeof (n as any).id === 'string')
        .slice(0, 1200)
        .map((n) => {
          const pos = (n as any).position ?? {}
          const x = Number(pos.x)
          const y = Number(pos.y)
          const data = (n as any).data ?? {}
          const ts = Number(data.timestamp)
          return {
            ...(n as any),
            position: {
              x: Number.isFinite(x) ? x : 0,
              y: Number.isFinite(y) ? y : 0,
            },
            data: {
              ...data,
              timestamp: Number.isFinite(ts) ? ts : 0,
            },
          } as NeuralFlowGraphNode
        })

      const nodeIds = new Set(safeNodes.map((n) => n.id))
      const safeEdges = (Array.isArray(rawEdges) ? rawEdges : [])
        .filter((e) => e && typeof e === 'object')
        .filter((e) => typeof (e as any).source === 'string' && typeof (e as any).target === 'string')
        .filter((e) => nodeIds.has((e as any).source) && nodeIds.has((e as any).target))
        .slice(0, 2000)
        .map((e) => ({ ...(e as any) })) as NeuralFlowGraphEdge[]

      const ether = pipelineToEtherMindmap(safeNodes, safeEdges)
      setNodes(ether.nodes)
      setEdges(ether.edges)
      setMindmapGraph(ether.nodes, ether.edges)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }))
      })

      let cancelled = false
      void import('../../lib/etherMindmapElkLayout').then(({ applyEtherMindmapElkLayout }) => {
        void applyEtherMindmapElkLayout(ether.nodes, ether.edges).then((refined) => {
          if (cancelled) return
          setNodes(refined.nodes)
          setEdges(refined.edges)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => fitView({ padding: 0.22, duration: 280 }))
          })
        })
      })
      return () => {
        cancelled = true
      }
    }
    const demo = buildEtherDemoFlow()
    setNodes(demo.nodes)
    setEdges(demo.edges)
    setMindmapGraph(demo.nodes, demo.edges)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitView({ padding: 0.2, duration: 0 }))
    })
  }, [pipelineReactFlow, setNodes, setEdges, fitView, setMindmapGraph])

  useEffect(() => {
    setMindmapGraph(nodes, edges)
  }, [nodes, edges, setMindmapGraph])

  const videoCurrentTimeSeconds = useWorkspaceStore((s) => s.videoCurrentTimeSeconds)

  useEffect(() => {
    const nodesWithTs = nodes.filter((n) => {
      const ts = n.data.timestamp
      return typeof ts === 'number' && Number.isFinite(ts) && ts > 0
    })
    if (nodesWithTs.length === 0) return

    // Choose the node whose timestamp is closest to current playback time.
    let bestNode = nodesWithTs[0]
    let bestDist = Math.abs(videoCurrentTimeSeconds - bestNode.data.timestamp)
    for (const n of nodesWithTs) {
      const ts = n.data.timestamp
      const d = Math.abs(videoCurrentTimeSeconds - ts)
      if (d < bestDist) {
        bestDist = d
        bestNode = n
      }
    }
    const activeNodeId = bestNode.id
    const activeEdgeIds = new Set(edges.filter((e) => e.target === activeNodeId).map((e) => e.id))

    // Update edge.data.active only if it actually changed to avoid render loops.
    setEdges((eds) => {
      let changed = false
      const next = eds.map((e) => {
        const shouldBeActive = activeEdgeIds.has(e.id)
        const prevActive = Boolean((e.data as any)?.active)
        if (shouldBeActive === prevActive) return e
        changed = true
        return {
          ...e,
          data: { ...(e.data as any), active: shouldBeActive },
        }
      })
      return changed ? next : eds
    })
  }, [videoCurrentTimeSeconds, nodes, edges, setEdges])

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
    if (nodes.length > 0) {
      fitView({ padding: 0.2, duration: 0 })
      if (!notifiedRef.current) {
        notifiedRef.current = true
        etherWorkspaceToasts.diagramUpdated()
      }
    }
  }, [fitView, nodes.length])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: EtherMindmapNode) => {
      const label = String(node.data.label ?? '')
      const ts = Number(node.data.timestamp)
      dispatchEtherMindmapSeek({
        nodeId: node.id,
        label,
        timestamp: Number.isFinite(ts) ? ts : 0,
      })
      if (typeof ts === 'number' && Number.isFinite(ts) && ts > 0) {
        const r = requestSeek(ts, `flow-${node.id}`)
        if (!r.ok) pushToast(r.message, 'error')
        return
      }

      const seconds = resolveSeekFromMindmapLabel(label)
      if (seconds === null) {
        useToastStore.getState().pushToast('Chưa có mốc thời gian cho nút này trên sơ đồ.', 'default')
        return
      }
      const r = requestSeek(seconds, `flow-${label.slice(0, 48)}`)
      if (!r.ok) pushToast(r.message, 'error')
    },
    [pushToast, requestSeek],
  )

  const openBookmarkMenuAt = useCallback(
    (e: React.MouseEvent, node: EtherMindmapNode) => {
      const label = String(node.data.label ?? '').trim()
      if (!label) {
        useToastStore.getState().pushToast('Thiếu tên nút.', 'default')
        return
      }
      const range = resolveBookmarkClipRangeFromNode(node, transcriptSegments, knowledgeChunks)
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
    [knowledgeChunks, setMindContextMenu, transcriptSegments],
  )

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: EtherMindmapNode) => {
      e.preventDefault()
      openBookmarkMenuAt(e, node)
    },
    [openBookmarkMenuAt],
  )

  const onNodeDoubleClick = useCallback(
    (e: React.MouseEvent, node: EtherMindmapNode) => {
      e.preventDefault()
      openBookmarkMenuAt(e, node)
    },
    [openBookmarkMenuAt],
  )

  const onPaneClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.detail === 2) {
        fitView({ padding: 0.2, duration: 220 })
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
        'mindmap-react-flow-host h-full min-h-[280px] max-md:[overscroll-behavior:contain] rounded-ds-sm',
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
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        /* Cảm ứng: tránh kéo vùng chọn thay vì pan; tăng ngưỡng để phân biệt tap vs kéo node */
        selectionOnDrag={false}
        nodeDragThreshold={3}
        panOnScroll={false}
        /* Tắt zoom bằng bánh xe — để cuộn chuột luôn tác động khung / trang cha (iframe video vẫn có thể giữ focus). */
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag={panOnDrag}
        /* Không chặn wheel — nếu true, desktop không cuộn được cột/workspace khi con trỏ trên canvas. */
        preventScrolling={false}
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
        {showFlowChrome && showMiniMap ? (
          <MiniMap
            position="bottom-left"
            pannable
            zoomable
            className="ds-surface-glass !m-3 !overflow-hidden rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-md md:backdrop-blur-[10px]"
            maskColor="rgba(10, 25, 47, 0.5)"
            nodeStrokeWidth={2}
            nodeStrokeColor="#7c4dff"
            nodeColor={() => 'rgba(124, 77, 255, 0.32)'}
          />
        ) : null}
        {showFlowChrome ? (
          <Controls
            position="top-right"
            showZoom={false}
            showFitView={false}
            showInteractive={false}
            orientation="vertical"
            className="mindmap-flow-controls ds-surface-glass m-2 flex flex-col gap-0.5 rounded-ds-lg border border-ds-border p-1 shadow-ds-soft backdrop-blur-md md:backdrop-blur-[10px]"
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
              onClick={() => fitView({ padding: 0.2, duration: 220 })}
              className={controlBtnClass}
              title="Vừa khung"
              aria-label="Vừa khung"
            >
              <Maximize2 className="h-4 w-4" strokeWidth={1.5} />
            </ControlButton>
          </Controls>
        ) : null}
      </ReactFlow>
    </div>
  )
}

/**
 * React Flow infinite canvas + deep time-links (seeks video via Zustand).
 */
export function MindmapPanel({
  isFullscreen = false,
  onToggleFullscreen,
}: {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  const isMobileViewport = useIsMobileViewport()
  const holderRef = useRef<HTMLDivElement>(null)
  const exportWrapRef = useRef<HTMLDivElement>(null)
  const focusSegmentRef = useRef<(segmentId: string) => void>(() => {})
  const [mapVisible, setMapVisible] = useState(false)
  const [diagramTheme, setDiagramTheme] = useState<MindmapDiagramTheme>('highContrast')
  const [mindContextMenu, setMindContextMenu] = useState<MindContextMenuState>(null)
  const [showMiniMap, setShowMiniMap] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return window.localStorage.getItem('etherai:workspace-mindmap-minimap-v1') !== '0'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('etherai:workspace-mindmap-minimap-v1', showMiniMap ? '1' : '0')
    } catch {
      // ignore (private mode / blocked storage)
    }
  }, [showMiniMap])

  const registerFocusSegment = useCallback((fn: (segmentId: string) => void) => {
    focusSegmentRef.current = fn
  }, [])

  const requestSeek = useWorkspaceStore((s) => s.requestSeek)
  const transcriptSegments = useWorkspaceStore((s) => s.transcriptSegments)
  const knowledgeChunks = useWorkspaceStore((s) => s.knowledgeChunks)
  const addMindmapHighlight = useWorkspaceStore((s) => s.addMindmapHighlight)
  const activeSegmentId = useWorkspaceStore((s) => s.activeSegmentId)
  const pushToast = useToastStore((s) => s.pushToast)

  const deepTimeLinks = useMemo<DeepTimeLink[]>(() => {
    const cleanText = (t: string) => t.replace(/\s+/g, ' ').trim()
    const titleFromText = (t: string) => {
      const s = cleanText(t)
      if (!s) return '—'
      const firstSentence = s.split(/[.!?。！？]/)[0] ?? s
      const base = cleanText(firstSentence)
      return base.length > 62 ? `${base.slice(0, 62)}…` : base
    }

    // Prefer semantic chunks (they already represent "meaningful" spans).
    const chunks = knowledgeChunks
      .filter((c) => Number.isFinite(c.start_seconds) && Number.isFinite(c.end_seconds) && c.end_seconds > c.start_seconds)
      .filter((c) => c.text.trim().length > 0)
      .slice(0, 220)

    if (chunks.length > 0) {
      const totalDuration = Math.max(...chunks.map((c) => c.end_seconds))
      const target = Math.max(10, Math.min(22, Math.round(totalDuration / 210))) // ~1 link / 3.5 minutes

      // Spread across time: pick best chunk per bin using a simple score (length + segment coverage).
      const bins = Math.max(6, Math.min(14, Math.round(totalDuration / 480)))
      const perBin: { best: (typeof chunks)[number] | null; bestScore: number }[] = Array.from({ length: bins }).map(() => ({
        best: null,
        bestScore: -1,
      }))
      for (const c of chunks) {
        const mid = (c.start_seconds + c.end_seconds) / 2
        const b = Math.min(bins - 1, Math.max(0, Math.floor((mid / Math.max(1, totalDuration)) * bins)))
        const lenScore = Math.min(1, c.text.length / 520)
        const spanScore = Math.min(1, (c.end_seconds - c.start_seconds) / 120)
        const segScore = Array.isArray(c.segment_indices) ? Math.min(1, c.segment_indices.length / 8) : 0.2
        const score = lenScore * 0.55 + spanScore * 0.25 + segScore * 0.2
        if (score > perBin[b]!.bestScore) {
          perBin[b] = { best: c, bestScore: score }
        }
      }

      const picked = perBin
        .map((x) => x.best)
        .filter(Boolean) as (typeof chunks)[number][]

      // If we still have fewer than target, fill with remaining best-scored chunks.
      const pickedSet = new Set(picked.map((c) => `${Math.round(c.start_seconds)}-${Math.round(c.end_seconds)}`))
      if (picked.length < target) {
        const rest = chunks
          .filter((c) => !pickedSet.has(`${Math.round(c.start_seconds)}-${Math.round(c.end_seconds)}`))
          .map((c) => {
            const lenScore = Math.min(1, c.text.length / 520)
            const spanScore = Math.min(1, (c.end_seconds - c.start_seconds) / 120)
            const segScore = Array.isArray(c.segment_indices) ? Math.min(1, c.segment_indices.length / 8) : 0.2
            const score = lenScore * 0.55 + spanScore * 0.25 + segScore * 0.2
            return { c, score }
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, target - picked.length)
          .map((x) => x.c)
        picked.push(...rest)
      }

      // Sort by time and de-dup close starts.
      picked.sort((a, b) => a.start_seconds - b.start_seconds)
      const out: DeepTimeLink[] = []
      let lastStart = -999
      for (const c of picked) {
        if (Math.abs(c.start_seconds - lastStart) < 10) continue
        out.push({
          id: `tl-ch-${Math.round(c.start_seconds * 10)}`,
          startSeconds: c.start_seconds,
          endSeconds: c.end_seconds,
          label: titleFromText(c.text),
          kind: 'chunk',
        })
        lastStart = c.start_seconds
      }
      return out.slice(0, target)
    }

    // Fallback: transcript segments (spread across timeline)
    const segs = transcriptSegments
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start && s.text.trim().length > 0)
      .slice(0, 5000)
    if (segs.length === 0) return []
    const totalDuration = Math.max(...segs.map((s) => s.end))
    const target = Math.max(8, Math.min(16, Math.round(totalDuration / 210)))
    const n = Math.min(target, segs.length)
    const pickIdx = new Set<number>()
    for (let i = 0; i < n; i += 1) {
      const idx = Math.round((i * (segs.length - 1)) / Math.max(1, n - 1))
      pickIdx.add(idx)
    }
    const picked = Array.from(pickIdx)
      .sort((a, b) => a - b)
      .map((idx) => segs[idx]!)
      .map((s, i) => ({
        id: `tl-seg-${Math.round(s.start * 10)}-${i}`,
        startSeconds: s.start,
        endSeconds: s.end,
        label: titleFromText(s.text),
        kind: 'segment' as const,
      }))
    const out: DeepTimeLink[] = []
    let lastStart = -999
    for (const p of picked) {
      if (Math.abs(p.startSeconds - lastStart) < 8) continue
      out.push(p)
      lastStart = p.startSeconds
    }
    return out
  }, [transcriptSegments, knowledgeChunks])

  const onDeepTimeLinkClick = useCallback(
    (seg: DeepTimeLink) => {
      const r = requestSeek(seg.startSeconds, seg.id)
      if (!r.ok) {
        pushToast(r.message, 'error')
        return
      }
    },
    [pushToast, requestSeek],
  )

  const copySegmentToClipboard = useCallback(
    async (seg: DeepTimeLink) => {
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
    <div className="relative isolate z-0 flex h-full min-h-0 touch-manipulation flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 p-4 shadow-ds-soft backdrop-blur-md md:backdrop-blur-[10px]">
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2
          id="workspace-mindmap-title"
          className="ds-text-label min-w-0 flex-1 truncate text-ds-secondary"
        >
          Neural map
        </h2>
        {mapVisible ? (
          <div
            className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-0.5 rounded-ds-sm border border-ds-border bg-ds-bg/70 p-1 shadow-ds-soft backdrop-blur-md"
            role="toolbar"
            aria-label="Mindmap tools"
          >
            {onToggleFullscreen ? (
              <button
                type="button"
                onClick={onToggleFullscreen}
                aria-pressed={isFullscreen}
                className="ds-interactive shrink-0 rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
                aria-label={isFullscreen ? 'Thu nhỏ (Esc)' : 'Toàn màn hình'}
                title={isFullscreen ? 'Thu nhỏ (Esc)' : 'Toàn màn hình'}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                ) : (
                  <Maximize2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setShowMiniMap((v) => !v)}
              aria-pressed={showMiniMap}
              className={`ds-interactive shrink-0 rounded-ds-sm p-2 hover:bg-ds-border/40 ${
                showMiniMap ? 'text-ds-secondary' : 'text-ds-text-secondary hover:text-ds-text-primary'
              }`}
              aria-label={showMiniMap ? 'Ẩn MiniMap' : 'Hiện MiniMap'}
              title={showMiniMap ? 'Ẩn MiniMap' : 'Hiện MiniMap'}
            >
              <Map className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={downloadPng}
              className="ds-interactive shrink-0 rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/40 hover:text-ds-text-primary"
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
              className={`ds-interactive shrink-0 rounded-ds-sm p-2 hover:bg-ds-border/40 ${
                diagramTheme === 'softPastel'
                  ? 'text-ds-secondary'
                  : 'text-ds-text-secondary hover:text-ds-text-primary'
              }`}
              aria-label={
                diagramTheme === 'highContrast'
                  ? 'Chuyển sang Soft Pastel'
                  : 'Chuyển sang High Contrast'
              }
              title={diagramTheme === 'highContrast' ? 'Theme: Soft Pastel' : 'Theme: High Contrast'}
            >
              {diagramTheme === 'highContrast' ? (
                <Palette className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Contrast className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={holderRef}
        className="relative z-10 flex min-h-[200px] flex-1 flex-col rounded-ds-sm"
        aria-label="React Flow mindmap canvas"
        aria-busy={!mapVisible}
      >
        {!mapVisible ? (
          <p className="p-4 text-sm text-ds-text-secondary">Đang tải sơ đồ…</p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden rounded-ds-sm pt-2">
          <motion.div
            className="h-full min-h-[300px] max-md:min-h-[min(44vh,20rem)] will-change-[opacity,transform]"
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
                  showMiniMap={showMiniMap && !isMobileViewport}
                  showFlowChrome
                  panOnDrag
                />
              </ReactFlowProvider>
            ) : null}
          </motion.div>
        </div>
      </div>
      <div className="relative z-10 mt-4 space-y-2 border-t border-ds-border pt-4">
        <h3 className="ds-text-label text-ds-text-secondary">Deep time-links</h3>
        <div className="scrollbar-hide max-h-[9.5rem] overflow-y-auto pr-1">
          <ul className="flex flex-col gap-2">
          {deepTimeLinks.length === 0 ? (
            <li className="rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-3 text-sm text-ds-text-secondary">
              Chưa có transcript segments để tạo time-links. Hãy chạy pipeline để nạp transcript.
            </li>
          ) : null}
          {deepTimeLinks.map((seg) => (
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
                <span className="min-w-0 flex-1 line-clamp-2">
                  {seg.label}
                  <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-ds-text-secondary">
                    {seg.kind === 'chunk' ? 'đoạn' : 'câu'}
                  </span>
                </span>
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
    </div>
  )
}

function formatTime(total: number) {
  if (!Number.isFinite(total) || total < 0) return '--:--'
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
