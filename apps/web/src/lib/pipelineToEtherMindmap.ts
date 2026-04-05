import type { NeuralFlowGraphEdge, NeuralFlowGraphNode } from './mindmapToReactFlow'
import type { EtherMindmapEdge, EtherMindmapNode } from './etherMindmapTypes'
import { ETHER_QUADRANT_STROKE } from './etherMindmapTypes'
import { quadrantForHubChildIndex } from './etherMindmapJson'
import {
  assignEtherMindmapHandles,
  etherNodeMeasuredBox,
  layoutEtherMindmapCenterOut,
  layoutEtherMindmapSpiralPath,
} from './etherMindmapLayout'

function nodeHighlight(raw: NeuralFlowGraphNode): string {
  return String((raw.data as { highlight?: string }).highlight ?? '').trim()
}

function nodeRole(raw: NeuralFlowGraphNode): 'main' | 'detail' {
  return (raw.data as { role?: string }).role === 'detail' ? 'detail' : 'main'
}

function measuredBoxVariant(isRoot: boolean, raw: NeuralFlowGraphNode): 'central' | 'pill' | 'detail' {
  if (isRoot) return 'central'
  return nodeRole(raw) === 'detail' ? 'detail' : 'pill'
}

/** If the tree is one simple path root→…→leaf, bilateral layout degenerates to a long horizontal strip. */
function tryExtractFullPath(
  rootId: string,
  childrenMap: Map<string, string[]>,
  totalNodes: number,
): string[] | null {
  const path: string[] = []
  let cur: string | undefined = rootId
  const seen = new Set<string>()
  while (cur !== undefined) {
    if (seen.has(cur)) return null
    seen.add(cur)
    path.push(cur)
    const ch: string[] = childrenMap.get(cur) ?? []
    if (ch.length === 0) break
    if (ch.length > 1) return null
    cur = ch[0]!
  }
  if (path.length !== totalNodes) return null
  return path
}

function dedupeDirectedEdges(edges: NeuralFlowGraphEdge[]): NeuralFlowGraphEdge[] {
  const seen = new Set<string>()
  const out: NeuralFlowGraphEdge[] = []
  for (const e of edges) {
    const k = `${e.source}\0${e.target}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
  }
  return out
}

function undirectedKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`
}

function findRootId(nodes: NeuralFlowGraphNode[], edges: NeuralFlowGraphEdge[]): string | undefined {
  if (nodes.length === 0) return undefined
  const inc = new Map<string, number>()
  for (const n of nodes) inc.set(n.id, 0)
  for (const e of edges) inc.set(e.target, (inc.get(e.target) ?? 0) + 1)
  const roots = nodes.filter((n) => (inc.get(n.id) ?? 0) === 0)
  if (roots.length === 1) return roots[0]!.id
  return nodes[0]!.id
}

/** Undirected connected components (for bridging disconnected AI output). */
function findUndirectedComponents(
  nodeIds: Set<string>,
  edges: NeuralFlowGraphEdge[],
): Set<string>[] {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (e.source === e.target) continue
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source)!.push(e.target)
    adj.get(e.target)!.push(e.source)
  }
  const seen = new Set<string>()
  const comps: Set<string>[] = []
  for (const id of nodeIds) {
    if (seen.has(id)) continue
    const comp = new Set<string>()
    const st = [id]
    while (st.length) {
      const u = st.pop()!
      if (seen.has(u)) continue
      seen.add(u)
      comp.add(u)
      for (const v of adj.get(u) ?? []) st.push(v)
    }
    comps.push(comp)
  }
  return comps
}

const VIRTUAL_PREFIX = 'ether-virtual-'

/** When the model splits the graph, connect each extra component to the root so nothing floats as “orphans”. */
function virtualBridgeEdgesFromRoot(
  rootId: string,
  nodeIds: Set<string>,
  edges: NeuralFlowGraphEdge[],
): NeuralFlowGraphEdge[] {
  const comps = findUndirectedComponents(nodeIds, edges)
  const extra: NeuralFlowGraphEdge[] = []
  let n = 0
  for (const comp of comps) {
    if (comp.has(rootId)) continue
    const rep = [...comp].sort((a, b) => a.localeCompare(b))[0]!
    n++
    extra.push({
      id: `${VIRTUAL_PREFIX}${n}-${rep}`,
      source: rootId,
      target: rep,
      type: 'neuralFlow',
      data: {},
    })
  }
  return extra
}

/**
 * BFS spanning tree on the **undirected** graph so reversed edges (child→parent in JSON)
 * still attach to the tree. `treeUndirected` lists each tree link as an unordered pair key.
 */
function buildUndirectedSpanningTree(
  rootId: string,
  nodeIds: Set<string>,
  edges: NeuralFlowGraphEdge[],
): { parent: Map<string, string | null>; treeUndirected: Set<string> } {
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (e.source === e.target) continue
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue
    if (!adj.has(e.source)) adj.set(e.source, [])
    if (!adj.has(e.target)) adj.set(e.target, [])
    adj.get(e.source)!.push(e.target)
    adj.get(e.target)!.push(e.source)
  }

  const parent = new Map<string, string | null>()
  const treeUndirected = new Set<string>()
  const visited = new Set<string>()
  const q: string[] = [rootId]
  visited.add(rootId)
  parent.set(rootId, null)

  while (q.length) {
    const u = q.shift()!
    for (const v of adj.get(u) ?? []) {
      if (visited.has(v)) continue
      visited.add(v)
      parent.set(v, u)
      treeUndirected.add(undirectedKey(u, v))
      q.push(v)
    }
  }

  return { parent, treeUndirected }
}

function parentMapToChildrenMap(
  rootId: string,
  parent: Map<string, string | null>,
  rawNodes: NeuralFlowGraphNode[],
): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const [child, p] of parent) {
    if (child === rootId || p === null) continue
    if (!m.has(p)) m.set(p, [])
    m.get(p)!.push(child)
  }
  const ts = (id: string) => {
    const n = rawNodes.find((x) => x.id === id)
    return Number((n?.data as { timestamp?: number })?.timestamp) || 0
  }
  for (const p of m.keys()) {
    const ch = m.get(p)!
    m.set(p, [...ch].sort((a, b) => ts(a) - ts(b)))
  }
  return m
}

function canonicalTreeDirection(
  a: string,
  b: string,
  parent: Map<string, string | null>,
): { source: string; target: string } | null {
  if (parent.get(b) === a) return { source: a, target: b }
  if (parent.get(a) === b) return { source: b, target: a }
  return null
}

function nodeDepthMap(rootId: string, childrenMap: Map<string, string[]>): Map<string, number> {
  const depths = new Map<string, number>()
  function walk(id: string, d: number) {
    depths.set(id, d)
    for (const c of childrenMap.get(id) ?? []) walk(c, d + 1)
  }
  walk(rootId, 0)
  return depths
}

/**
 * Maps pipeline `neural` nodes into Ether quadrant mindmap nodes.
 * Uses an **undirected** spanning tree so wrong edge directions from the model do not strand
 * half the nodes as a separate column with dashed “cross” edges.
 */
export function pipelineToEtherMindmap(
  rawNodes: NeuralFlowGraphNode[],
  rawEdges: NeuralFlowGraphEdge[],
): { nodes: EtherMindmapNode[]; edges: EtherMindmapEdge[] } {
  if (rawNodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const nodeIds = new Set(rawNodes.map((n) => n.id))
  const baseEdges = dedupeDirectedEdges(rawEdges).filter(
    (e) => e.source !== e.target && nodeIds.has(e.source) && nodeIds.has(e.target),
  )
  const rootId = findRootId(rawNodes, baseEdges)
  if (!rootId) {
    return { nodes: [], edges: [] }
  }

  const bridges = virtualBridgeEdgesFromRoot(rootId, nodeIds, baseEdges)
  const edgesForTree = [...baseEdges, ...bridges]

  const { parent, treeUndirected } = buildUndirectedSpanningTree(rootId, nodeIds, edgesForTree)
  const childrenMap = parentMapToChildrenMap(rootId, parent, rawNodes)

  const nodeMeta = new Map<
    string,
    { width: number; height: number; quadrant: 'tl' | 'bl' | 'tr' | 'br' | 'center'; branchKey: 'tl' | 'bl' | 'tr' | 'br' }
  >()

  const pathOnly = tryExtractFullPath(rootId, childrenMap, rawNodes.length)
  /** Spiral: compact, learnable curve when the model outputs a chain; bilateral: real branches. */
  const useSpiralLayout = pathOnly !== null && pathOnly.length >= 2

  if (useSpiralLayout) {
    const ROT = ['tl', 'tr', 'br', 'bl'] as const
    for (let i = 0; i < pathOnly.length; i++) {
      const id = pathOnly[i]!
      const n = rawNodes.find((x) => x.id === id)
      if (!n) continue
      const label = String(n.data?.label ?? '—')
      const hl = nodeHighlight(n)
      const bv = measuredBoxVariant(i === 0, n)
      if (i === 0) {
        const { width, height } = etherNodeMeasuredBox(bv, label, hl)
        nodeMeta.set(id, { width, height, quadrant: 'center', branchKey: 'tl' })
      } else {
        const { width, height } = etherNodeMeasuredBox(bv, label, hl)
        const bk = ROT[(i - 1) % 4]!
        nodeMeta.set(id, { width, height, quadrant: bk, branchKey: bk })
      }
    }
  } else {
    function visitMeta(id: string, branch: 'tl' | 'bl' | 'tr' | 'br' | 'center', isRoot: boolean) {
      const n = rawNodes.find((x) => x.id === id)
      if (!n) return
      const label = String(n.data?.label ?? '—')
      const { width, height } = etherNodeMeasuredBox(measuredBoxVariant(isRoot, n), label, nodeHighlight(n))
      const quad = isRoot ? 'center' : (branch as 'tl' | 'bl' | 'tr' | 'br')
      const branchKey = isRoot ? 'tl' : (branch as 'tl' | 'bl' | 'tr' | 'br')
      nodeMeta.set(id, { width, height, quadrant: quad, branchKey })
      const ch = childrenMap.get(id) ?? []
      if (isRoot) {
        const k = ch.length
        ch.forEach((cid, i) => visitMeta(cid, quadrantForHubChildIndex(i, k), false))
      } else {
        ch.forEach((cid) => visitMeta(cid, branch as 'tl' | 'bl' | 'tr' | 'br', false))
      }
    }
    visitMeta(rootId, 'center', true)
  }

  const positions = useSpiralLayout
    ? layoutEtherMindmapSpiralPath(pathOnly!, nodeMeta, rootId)
    : layoutEtherMindmapCenterOut(rootId, childrenMap, nodeMeta)
  const depths = nodeDepthMap(rootId, childrenMap)

  const nodes: EtherMindmapNode[] = rawNodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 }
    const meta = nodeMeta.get(n.id)
    const isRoot = n.id === rootId
    const ts = Number((n.data as { timestamp?: number }).timestamp)
    const hl = nodeHighlight(n)
    const r = nodeRole(n)
    const data = {
      label: String(n.data?.label ?? '—'),
      timestamp: Number.isFinite(ts) ? ts : 0,
      highlight: hl || undefined,
      role: r,
      label_full: (n.data as { label_full?: string }).label_full,
      quadrant: meta?.quadrant ?? 'tr',
      variant: isRoot ? ('central' as const) : ('pill' as const),
      branchKey: meta?.branchKey ?? 'tr',
    }
    if (isRoot) {
      return { id: n.id, type: 'etherCentral', position: pos, data }
    }
    return { id: n.id, type: 'etherPill', position: pos, data }
  })

  let outEdges: EtherMindmapEdge[] = edgesForTree.map((e, i) => {
    const uk = undirectedKey(e.source, e.target)
    const onTree = treeUndirected.has(uk)
    const dir = canonicalTreeDirection(e.source, e.target, parent)

    if (onTree && dir) {
      const tgtMeta = nodeMeta.get(dir.target)
      const br = tgtMeta && tgtMeta.quadrant !== 'center' ? tgtMeta.quadrant : 'tl'
      const stroke = ETHER_QUADRANT_STROKE[br]
      const td = depths.get(dir.target) ?? 1
      const strokeWidth = Math.max(1.25, 3.4 - td * 0.42)
      return {
        id: e.id || `pe-${i}`,
        source: dir.source,
        target: dir.target,
        type: 'etherBezier' as const,
        data: { kind: 'tree' as const, stroke, strokeWidth },
      }
    }

    return {
      id: e.id || `pe-${i}`,
      source: e.source,
      target: e.target,
      type: 'etherCross' as const,
      data: { kind: 'crossLink' as const },
    }
  })

  outEdges = assignEtherMindmapHandles(nodes, outEdges)

  return { nodes, edges: outEdges }
}
