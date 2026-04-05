import type { EtherMindmapEdge, EtherMindmapNode } from './etherMindmapTypes'
import type { EtherMindmapQuadrant } from './etherMindmapTypes'
import { quadrantForHubChildIndex } from './etherMindmapJson'

export type EtherLayoutMeta = {
  width: number
  height: number
  quadrant: EtherMindmapQuadrant
  branchKey: Exclude<EtherMindmapQuadrant, 'center'>
}

/** Horizontal gap between depth levels (left: x decreases; right: x increases). */
const LEVEL_GAP = 260
/** Vertical gap between sibling subtrees. */
const SIBLING_GAP = 24
/** Space between hub edge and first-level nodes. */
const ROOT_GAP = 88
/** Extra vertical slack when a subtree is a single-child chain (zigzag layout). */
const SINGLE_CHILD_CHAIN_SLACK = 52

function subtreeBlockHeight(
  id: string,
  childrenMap: Map<string, string[]>,
  nodeMeta: Map<string, EtherLayoutMeta>,
): number {
  const ch = childrenMap.get(id) ?? []
  const dim = nodeMeta.get(id)!
  if (ch.length === 0) return dim.height
  if (ch.length === 1) {
    const c = ch[0]!
    return Math.max(dim.height, subtreeBlockHeight(c, childrenMap, nodeMeta) + SINGLE_CHILD_CHAIN_SLACK)
  }
  const parts = ch.map((c) => subtreeBlockHeight(c, childrenMap, nodeMeta))
  const sum = parts.reduce((a, b) => a + b, 0) + (ch.length - 1) * SIBLING_GAP
  return Math.max(dim.height, sum)
}

/** Zigzag offset so single-child chains are not a perfect horizontal line. */
const SINGLE_CHILD_STAGGER = 46

/** Left side: x moves **negative** each level away from the hub. */
function layoutLeftSubtree(
  id: string,
  rightEdgeX: number,
  yCenter: number,
  depth: number,
  childrenMap: Map<string, string[]>,
  nodeMeta: Map<string, EtherLayoutMeta>,
  positions: Map<string, { x: number; y: number }>,
): void {
  const dim = nodeMeta.get(id)!
  const w = dim.width
  const h = dim.height
  const x = rightEdgeX - w
  const y = yCenter - h / 2
  positions.set(id, { x, y })

  const ch = childrenMap.get(id) ?? []
  if (ch.length === 0) return

  const childRightEdge = x - LEVEL_GAP
  if (ch.length === 1) {
    const c = ch[0]!
    const stagger = (depth % 2 === 0 ? 1 : -1) * SINGLE_CHILD_STAGGER
    layoutLeftSubtree(c, childRightEdge, yCenter + stagger, depth + 1, childrenMap, nodeMeta, positions)
    return
  }

  const heights = ch.map((c) => subtreeBlockHeight(c, childrenMap, nodeMeta))
  const totalH = heights.reduce((a, b) => a + b, 0) + (ch.length - 1) * SIBLING_GAP
  let yTop = yCenter - totalH / 2
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i]!
    const cy = yTop + heights[i]! / 2
    layoutLeftSubtree(c, childRightEdge, cy, 0, childrenMap, nodeMeta, positions)
    yTop += heights[i]! + SIBLING_GAP
  }
}

/** Right side: x moves **positive** each level away from the hub. */
function layoutRightSubtree(
  id: string,
  leftEdgeX: number,
  yCenter: number,
  depth: number,
  childrenMap: Map<string, string[]>,
  nodeMeta: Map<string, EtherLayoutMeta>,
  positions: Map<string, { x: number; y: number }>,
): void {
  const dim = nodeMeta.get(id)!
  const w = dim.width
  const h = dim.height
  const x = leftEdgeX
  const y = yCenter - h / 2
  positions.set(id, { x, y })

  const ch = childrenMap.get(id) ?? []
  if (ch.length === 0) return

  const childLeftEdge = x + w + LEVEL_GAP
  if (ch.length === 1) {
    const c = ch[0]!
    const stagger = (depth % 2 === 0 ? 1 : -1) * SINGLE_CHILD_STAGGER
    layoutRightSubtree(c, childLeftEdge, yCenter + stagger, depth + 1, childrenMap, nodeMeta, positions)
    return
  }

  const heights = ch.map((c) => subtreeBlockHeight(c, childrenMap, nodeMeta))
  const totalH = heights.reduce((a, b) => a + b, 0) + (ch.length - 1) * SIBLING_GAP
  let yTop = yCenter - totalH / 2
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i]!
    const cy = yTop + heights[i]! / 2
    layoutRightSubtree(c, childLeftEdge, cy, 0, childrenMap, nodeMeta, positions)
    yTop += heights[i]! + SIBLING_GAP
  }
}

function isLeftQuadrant(q: Exclude<EtherMindmapQuadrant, 'center'>): boolean {
  return q === 'tl' || q === 'bl'
}

/**
 * **Bilateral tree mind map**: hub center at coordinate origin (0,0) (node top-left = −w/2, −h/2).
 * Group A = TL/BL → **left** (x negative); Group B = TR/BR → **right** (x positive).
 * Children inherit the same horizontal direction as their ancestor branch.
 */
export function layoutEtherMindmapCenterOut(
  rootId: string,
  childrenMap: Map<string, string[]>,
  nodeMeta: Map<string, EtherLayoutMeta>,
  rootBranchOverride?: Map<string, Exclude<EtherMindmapQuadrant, 'center'>>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const rootDim = nodeMeta.get(rootId) ?? {
    width: 220,
    height: 56,
    quadrant: 'center',
    branchKey: 'tl',
  }
  const rw = rootDim.width
  const rh = rootDim.height
  /** Geometric center of hub at (0,0). */
  positions.set(rootId, { x: -rw / 2, y: -rh / 2 })

  const rootCh = childrenMap.get(rootId) ?? []
  const k = rootCh.length

  const branchOf = new Map<string, Exclude<EtherMindmapQuadrant, 'center'>>()
  for (let i = 0; i < k; i++) {
    const cid = rootCh[i]!
    branchOf.set(cid, rootBranchOverride?.get(cid) ?? quadrantForHubChildIndex(i, k))
  }

  const leftIds = rootCh.filter((cid) => isLeftQuadrant(branchOf.get(cid) ?? 'tl'))
  const rightIds = rootCh.filter((cid) => !isLeftQuadrant(branchOf.get(cid) ?? 'tl'))

  const leftAttachRightEdge = -rw / 2 - ROOT_GAP
  const rightAttachLeftEdge = rw / 2 + ROOT_GAP

  if (leftIds.length > 0) {
    const heights = leftIds.map((id) => subtreeBlockHeight(id, childrenMap, nodeMeta))
    const totalH = heights.reduce((a, b) => a + b, 0) + (leftIds.length - 1) * SIBLING_GAP
    let yTop = -totalH / 2
    for (let i = 0; i < leftIds.length; i++) {
      const id = leftIds[i]!
      const cy = yTop + heights[i]! / 2
      layoutLeftSubtree(id, leftAttachRightEdge, cy, 0, childrenMap, nodeMeta, positions)
      yTop += heights[i]! + SIBLING_GAP
    }
  }

  if (rightIds.length > 0) {
    const heights = rightIds.map((id) => subtreeBlockHeight(id, childrenMap, nodeMeta))
    const totalH = heights.reduce((a, b) => a + b, 0) + (rightIds.length - 1) * SIBLING_GAP
    let yTop = -totalH / 2
    for (let i = 0; i < rightIds.length; i++) {
      const id = rightIds[i]!
      const cy = yTop + heights[i]! / 2
      layoutRightSubtree(id, rightAttachLeftEdge, cy, 0, childrenMap, nodeMeta, positions)
      yTop += heights[i]! + SIBLING_GAP
    }
  }

  return positions
}

export const layoutEtherQuadrantPolar = layoutEtherMindmapCenterOut

/**
 * **Spiral path layout** — when the spanning tree is a single path (common when the model
 * outputs root→A→B→C…), bilateral “left/right” stacking becomes an endless horizontal strip.
 * A compact Archimedean-style spiral around the hub matches familiar mindmap / flow readability.
 *
 * Root center at (0,0); node `i` at polar (r, θ) with θ increasing per hop (opens outward).
 */
const SPIRAL_ANGLE_STEP = 0.36
const SPIRAL_R0 = 128
const SPIRAL_DR = 88

export function layoutEtherMindmapSpiralPath(
  path: string[],
  nodeMeta: Map<string, EtherLayoutMeta>,
  rootId: string,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  const rootDim = nodeMeta.get(rootId) ?? {
    width: 220,
    height: 56,
    quadrant: 'center',
    branchKey: 'tl',
  }
  positions.set(rootId, { x: -rootDim.width / 2, y: -rootDim.height / 2 })

  for (let i = 1; i < path.length; i++) {
    const id = path[i]!
    const dim = nodeMeta.get(id) ?? {
      width: 160,
      height: 40,
      quadrant: 'tr',
      branchKey: 'tr',
    }
    const θ = (i - 1) * SPIRAL_ANGLE_STEP
    const r = SPIRAL_R0 + (i - 1) * SPIRAL_DR
    const cx = r * Math.cos(θ)
    const cy = r * Math.sin(θ)
    positions.set(id, { x: cx - dim.width / 2, y: cy - dim.height / 2 })
  }
  return positions
}

/** Match Bézier edges: Left/Right handles from node centers. */
export function assignEtherMindmapHandles(nodes: EtherMindmapNode[], edges: EtherMindmapEdge[]): EtherMindmapEdge[] {
  const dims = new Map<string, { w: number; h: number }>()
  for (const n of nodes) {
    const box = etherNodeMeasuredBox(
      n.data.variant === 'central'
        ? 'central'
        : n.data.role === 'detail'
          ? 'detail'
          : 'pill',
      n.data.label,
      n.data.highlight,
    )
    dims.set(n.id, { w: box.width, h: box.height })
  }
  const rootId = nodes.find((n) => n.type === 'etherCentral')?.id

  return edges.map((e) => {
    if (e.type === 'etherCross') return e
    const s = dims.get(e.source)
    const t = dims.get(e.target)
    const pn = nodes.find((x) => x.id === e.source)
    const tn = nodes.find((x) => x.id === e.target)
    if (!s || !t || !pn || !tn) return e
    const scx = pn.position.x + s.w / 2
    const tcx = tn.position.x + t.w / 2
    if (tcx < scx) {
      const srcH = e.source === rootId ? 'l' : 'ls'
      return { ...e, sourceHandle: srcH, targetHandle: 'rt' }
    }
    const srcH = e.source === rootId ? 'r' : 'rs'
    return { ...e, sourceHandle: srcH, targetHandle: 'lt' }
  })
}

/** Hub / branch pills / compact **detail** focal nodes. Optional `highlight` adds height under the chip. */
export function etherNodeMeasuredBox(
  variant: 'central' | 'pill' | 'detail',
  label: string,
  highlight?: string,
): { width: number; height: number } {
  const t = String(label ?? '').trim() || '—'
  if (variant === 'detail') {
    const charWd = 6.2
    const maxRow = 170
    const lines = Math.max(1, Math.ceil((t.length * charWd) / maxRow))
    const hl = String(highlight ?? '').trim()
    const hlLines = hl ? Math.min(2, Math.max(1, Math.ceil(hl.length / 50))) : 0
    const extraH = hl ? 4 + hlLines * 11 : 0
    const h = Math.max(26, 11 + lines * 13) + extraH
    const w = Math.min(200, Math.max(88, (t.length * charWd) / Math.max(lines, 1) + 20))
    return { width: Math.round(w), height: Math.round(h) }
  }
  const charW = 7.2
  const maxRow = variant === 'central' ? 300 : 220
  const lines = Math.max(1, Math.ceil((t.length * charW) / maxRow))
  const hl = String(highlight ?? '').trim()
  const hlLines = hl ? Math.min(4, Math.max(1, Math.ceil(hl.length / 52))) : 0
  const extraH = hl ? 8 + hlLines * 12 : 0
  if (variant === 'central') {
    const h = Math.max(56, 24 + lines * 24) + extraH
    const w = Math.min(340, Math.max(200, (t.length * charW) / lines + 56))
    return { width: Math.round(w), height: Math.round(h) }
  }
  const h = Math.max(38, 16 + lines * 20) + extraH
  const w = Math.min(280, Math.max(120, (t.length * charW) / lines + 36))
  return { width: Math.round(w), height: Math.round(h) }
}
