import dagre from '@dagrejs/dagre'
import type { NeuralFlowGraphEdge, NeuralFlowGraphNode } from './mindmapToReactFlow'

/** Must stay in sync with NeuralNode max-width (padding included in dagre box). */
const NODE_MAX_W = 220
const NODE_MIN_H = 72
const NODE_MAX_H = 320
const COMPONENT_GAP_X = 96

function estimateNodeBox(label: string): { width: number; height: number } {
  const s = String(label ?? '').trim()
  const chars = s.length || 1
  /** ~Latin/VN chars per line at ~14px in a ~220px text box */
  const approxPerLine = 24
  const lines = Math.max(1, Math.ceil(chars / approxPerLine))
  const linePx = 21
  const verticalPad = 36
  const h = Math.min(NODE_MAX_H, Math.max(NODE_MIN_H, verticalPad + lines * linePx))
  return { width: NODE_MAX_W, height: h }
}

function dimsMap(nodes: NeuralFlowGraphNode[]) {
  const m = new Map<string, { width: number; height: number }>()
  for (const n of nodes) {
    const label = String((n.data as { label?: string })?.label ?? '')
    m.set(n.id, estimateNodeBox(label))
  }
  return m
}

function findConnectedComponents(
  nodes: NeuralFlowGraphNode[],
  edges: NeuralFlowGraphEdge[],
): Set<string>[] {
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) {
    adj.set(n.id, new Set())
  }
  for (const e of edges) {
    if (e.source === e.target) continue
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }

  const visited = new Set<string>()
  const components: Set<string>[] = []

  for (const n of nodes) {
    if (visited.has(n.id)) continue
    const comp = new Set<string>()
    const stack = [n.id]
    while (stack.length) {
      const id = stack.pop()!
      if (visited.has(id)) continue
      visited.add(id)
      comp.add(id)
      for (const nb of adj.get(id) ?? []) {
        if (!visited.has(nb)) stack.push(nb)
      }
    }
    components.push(comp)
  }

  return components
}

function dedupeEdgesForLayout(edges: NeuralFlowGraphEdge[]): NeuralFlowGraphEdge[] {
  const seen = new Set<string>()
  const out: NeuralFlowGraphEdge[] = []
  for (const e of edges) {
    if (e.source === e.target) continue
    const k = `${e.source}\0${e.target}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

function layoutDagreComponent(
  nodes: NeuralFlowGraphNode[],
  edges: NeuralFlowGraphEdge[],
  dims: Map<string, { width: number; height: number }>,
): NeuralFlowGraphNode[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  /**
   * LR: bố cục trái → phải (mind map dùng chiều ngang), tránh chuỗi node chỉ xếp một cột dọc như TB.
   */
  g.setGraph({
    rankdir: 'LR',
    align: 'UL',
    nodesep: 56,
    ranksep: 96,
    marginx: 64,
    marginy: 64,
  })

  for (const n of nodes) {
    const { width, height } = dims.get(n.id) ?? { width: NODE_MAX_W, height: NODE_MIN_H }
    g.setNode(n.id, { width, height })
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target)
    }
  }

  dagre.layout(g)

  return nodes.map((n) => {
    const pos = g.node(n.id)
    const { width, height } = dims.get(n.id) ?? { width: NODE_MAX_W, height: NODE_MIN_H }
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      return n
    }
    return {
      ...n,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
    }
  })
}

function bboxOf(nodes: NeuralFlowGraphNode[], dims: Map<string, { width: number; height: number }>) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const { width, height } = dims.get(n.id) ?? { width: NODE_MAX_W, height: NODE_MIN_H }
    const x1 = n.position.x
    const y1 = n.position.y
    const x2 = x1 + width
    const y2 = y1 + height
    minX = Math.min(minX, x1)
    maxX = Math.max(maxX, x2)
    minY = Math.min(minY, y1)
    maxY = Math.max(maxY, y2)
  }
  if (!Number.isFinite(minX)) {
    return {
      minX: 0,
      maxX: NODE_MAX_W,
      minY: 0,
      maxY: NODE_MIN_H,
      width: NODE_MAX_W,
      height: NODE_MIN_H,
    }
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY }
}

function gridLayoutNodes(nodes: NeuralFlowGraphNode[]): NeuralFlowGraphNode[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  const gapX = 96
  const gapY = 96
  const rowStride = NODE_MAX_H + gapY
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: (i % cols) * (NODE_MAX_W + gapX),
      y: Math.floor(i / cols) * rowStride,
    },
  }))
}

/**
 * Replaces AI/backend x/y with a Dagre layered layout so nodes use the canvas
 * instead of piling up when the model emits cramped coordinates.
 */
export function layoutPipelineNeuralGraph(
  nodes: NeuralFlowGraphNode[],
  edges: NeuralFlowGraphEdge[],
): NeuralFlowGraphNode[] {
  if (nodes.length === 0) return nodes

  const dims = dimsMap(nodes)

  if (edges.length === 0) {
    return gridLayoutNodes(nodes)
  }

  const layoutEdges = dedupeEdgesForLayout(edges)
  const components = findConnectedComponents(nodes, layoutEdges)
  const byId = new Map(nodes.map((n) => [n.id, n] as const))

  let cursorX = 0
  const result: NeuralFlowGraphNode[] = []

  for (const comp of components) {
    const compNodes = Array.from(comp)
      .map((id) => byId.get(id))
      .filter((n): n is NeuralFlowGraphNode => Boolean(n))

    const compEdgeList = layoutEdges.filter((e) => comp.has(e.source) && comp.has(e.target))

    let laidOut: NeuralFlowGraphNode[]
    try {
      laidOut = layoutDagreComponent(compNodes, compEdgeList, dims)
    } catch {
      laidOut = gridLayoutNodes(compNodes)
    }

    const { minX, width } = bboxOf(laidOut, dims)
    const dx = cursorX - minX

    for (const n of laidOut) {
      result.push({
        ...n,
        position: {
          x: n.position.x + dx,
          y: n.position.y,
        },
      })
    }

    cursorX += width + COMPONENT_GAP_X
  }

  return result
}
