import type { Edge, Node } from '@xyflow/react'

/** Four directional branches from the hub (matches reference art). */
export type EtherMindmapQuadrant = 'tl' | 'bl' | 'tr' | 'br' | 'center'

export type EtherMindmapNodeData = {
  label: string
  /** Deep time-linking — seconds into the video (0 if unknown). */
  timestamp: number
  /** One standout takeaway for this main idea (from pipeline `data.highlight`). */
  highlight?: string
  /** `detail` = compact focal child under a main branch; omit/`main` for normal chips. */
  role?: 'main' | 'detail'
  label_full?: string
  quadrant: EtherMindmapQuadrant
  /** Hub vs colored pill leaf/topic. */
  variant: 'central' | 'pill'
  /** Stable hue for stems when not using quadrant fill. */
  branchKey?: EtherMindmapQuadrant
}

export type EtherMindmapEdgeKind = 'tree' | 'crossLink'

export type EtherMindmapEdgeData = {
  kind: EtherMindmapEdgeKind
  /** Stroke for tree edges (quadrant accent). */
  stroke?: string
  /** Thinner toward leaves (optional). */
  strokeWidth?: number
  active?: boolean
}

export type EtherMindmapNodeType = 'etherCentral' | 'etherPill'

export type EtherMindmapNode = Node<EtherMindmapNodeData, EtherMindmapNodeType>
export type EtherMindmapEdge = Edge<EtherMindmapEdgeData, 'etherBezier' | 'etherCross'>

export const ETHER_QUADRANT_STROKE: Record<Exclude<EtherMindmapQuadrant, 'center'>, string> = {
  tl: '#f59e0b',
  bl: '#ea580c',
  tr: '#6ee7b7',
  br: '#a78bfa',
}

export const ETHER_QUADRANT_FILL: Record<Exclude<EtherMindmapQuadrant, 'center'>, string> = {
  tl: 'bg-amber-400 text-slate-900',
  bl: 'bg-orange-600 text-white',
  tr: 'bg-emerald-300 text-slate-900',
  br: 'bg-violet-400 text-slate-900',
}

/** Custom event fired before seek — video player or analytics may subscribe. */
export const ETHER_MINDMAP_SEEK_EVENT = 'etherai:mindmap-node-click' as const

export type EtherMindmapSeekDetail = {
  nodeId: string
  label: string
  timestamp: number
}

export function dispatchEtherMindmapSeek(detail: EtherMindmapSeekDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ETHER_MINDMAP_SEEK_EVENT, { detail, bubbles: true }))
}
