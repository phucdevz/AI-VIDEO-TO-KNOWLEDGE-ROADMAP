import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode } from 'elkjs/lib/elk-api'
import type { EtherMindmapEdge, EtherMindmapNode } from './etherMindmapTypes'
import { assignEtherMindmapHandles, etherNodeMeasuredBox } from './etherMindmapLayout'

const elk = new ELK()

/** Above this, ELK blocks the main thread too long on weak devices. */
const ELK_MAX_NODES = 200

function collectElkPositions(elkNode: ElkNode, acc: Map<string, { x: number; y: number }>): void {
  if (
    elkNode.id &&
    typeof elkNode.x === 'number' &&
    typeof elkNode.y === 'number' &&
    typeof elkNode.width === 'number'
  ) {
    acc.set(elkNode.id, { x: elkNode.x, y: elkNode.y })
  }
  for (const c of elkNode.children ?? []) collectElkPositions(c, acc)
}

function bboxCenterOffset(
  nodes: EtherMindmapNode[],
  pos: Map<string, { x: number; y: number }>,
  dims: Map<string, { w: number; h: number }>,
): { dx: number; dy: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const p = pos.get(n.id)
    const d = dims.get(n.id)
    if (!p || !d) continue
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + d.w)
    maxY = Math.max(maxY, p.y + d.h)
  }
  if (!Number.isFinite(minX)) return { dx: 0, dy: 0 }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return { dx: -cx, dy: -cy }
}

/**
 * ELK **MrTree** + **DOWN**: hub-centric tree, long chains become a vertical spine instead of a
 * horizontal strip. Positions are centered on the origin before React Flow renders.
 */
export async function applyEtherMindmapElkLayout(
  nodes: EtherMindmapNode[],
  edges: EtherMindmapEdge[],
): Promise<{ nodes: EtherMindmapNode[]; edges: EtherMindmapEdge[] }> {
  if (nodes.length === 0 || nodes.length > ELK_MAX_NODES) {
    return { nodes, edges }
  }

  const treeEdges = edges.filter((e) => e.type === 'etherBezier')
  if (treeEdges.length === 0) {
    return { nodes, edges }
  }

  const dims = new Map<string, { w: number; h: number }>()
  const elkChildren: ElkNode[] = nodes.map((n) => {
    const label = n.data.label
    const variant =
      n.data.variant === 'central' ? 'central' : n.data.role === 'detail' ? 'detail' : 'pill'
    const { width, height } = etherNodeMeasuredBox(variant, label, n.data.highlight)
    dims.set(n.id, { w: width, h: height })
    return { id: n.id, width, height }
  })

  const elkEdges = treeEdges.map((e, i) => ({
    id: String(e.id ?? `elk-e-${i}`),
    sources: [e.source],
    targets: [e.target],
  }))

  const graph: ElkNode = {
    id: 'ether-elk-graph',
    layoutOptions: {
      'elk.algorithm': 'org.eclipse.elk.mrtree',
      'elk.direction': 'DOWN',
      'org.eclipse.elk.spacing.nodeNode': '48',
      'org.eclipse.elk.spacing.edgeNode': '28',
      'org.eclipse.elk.padding': '[top=40,left=56,bottom=40,right=56]',
    },
    children: elkChildren,
    edges: elkEdges,
  }

  try {
    const layouted = await elk.layout(graph)
    const pos = new Map<string, { x: number; y: number }>()
    collectElkPositions(layouted, pos)

    const { dx, dy } = bboxCenterOffset(nodes, pos, dims)

    const nextNodes: EtherMindmapNode[] = nodes.map((n) => {
      const p = pos.get(n.id)
      if (!p) return n
      return {
        ...n,
        position: { x: p.x + dx, y: p.y + dy },
      }
    })

    const nextEdges = assignEtherMindmapHandles(nextNodes, edges)
    return { nodes: nextNodes, edges: nextEdges }
  } catch {
    return { nodes, edges }
  }
}
