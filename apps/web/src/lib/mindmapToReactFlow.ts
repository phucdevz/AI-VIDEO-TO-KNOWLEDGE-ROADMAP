import type { Edge, Node } from '@xyflow/react'
import { getCurrentMindmapNodeLabelForVideoTime } from './mindmapLearning'

export type MindmapDiagramTheme = 'highContrast' | 'softPastel'

/** Tree shape compatible with AI pipeline JSON (nested topics). */
export type MindmapJsonNode = {
  id: string
  label: string
  children?: MindmapJsonNode[]
}

export type NeuralNodeFlowData = {
  label: string
  /** Deep time-linking anchor (seconds) when provided by backend AI. */
  timestamp?: number
  /**
   * UI theme hint for demo nodes. Backend may not provide it.
   * Kept optional so rendering can work with backend-provided nodes.
   */
  theme?: MindmapDiagramTheme
  isRoot?: boolean
}

export type NeuralEdgeFlowData = {
  active?: boolean
}

export type NeuralFlowGraphNode = Node<NeuralNodeFlowData, 'neural'>
export type NeuralFlowGraphEdge = Edge<NeuralEdgeFlowData, 'neuralFlow'>

const NODE_W = 196
const H_GAP = 28
const V_GAP = 128

export const DEMO_WORKSPACE_MINDMAP_TREE: MindmapJsonNode = {
  id: 'root',
  label: 'Lecture core',
  children: [
    {
      id: 'concepts',
      label: 'Concepts',
      children: [
        { id: 'attention', label: 'Attention' },
        { id: 'transformers', label: 'Transformers' },
      ],
    },
    {
      id: 'skills',
      label: 'Skills',
      children: [
        { id: 'implementation', label: 'Implementation' },
        { id: 'evaluation', label: 'Evaluation' },
      ],
    },
  ],
}

/** Branch node ids for LED edge sync (root → leaf), aligned with lecture hierarchy. */
export const DEMO_MINDMAP_BRANCH_PATHS: string[][] = [
  ['root'],
  ['root', 'concepts'],
  ['root', 'concepts', 'attention'],
  ['root', 'concepts', 'transformers'],
  ['root', 'skills'],
  ['root', 'skills', 'implementation'],
  ['root', 'skills', 'evaluation'],
]

const NODE_MATCH: Record<string, RegExp> = {
  root: /lecture core|^root$/i,
  concepts: /concepts/i,
  attention: /attention/i,
  transformers: /transformers/i,
  skills: /skills/i,
  implementation: /implementation/i,
  evaluation: /evaluation/i,
}

export function collectMindmapLabels(tree: MindmapJsonNode): string[] {
  const out = [tree.label]
  for (const c of tree.children ?? []) {
    out.push(...collectMindmapLabels(c))
  }
  return out
}

export function matchBranchNodeIdsForActiveLabel(activeLabel: string | null): string[] | null {
  if (!activeLabel?.trim()) return null
  let best: string[] | null = null
  for (const path of DEMO_MINDMAP_BRANCH_PATHS) {
    const leaf = path[path.length - 1]
    const re = NODE_MATCH[leaf]
    if (re?.test(activeLabel) && (!best || path.length > best.length)) {
      best = path
    }
  }
  return best
}

export function edgeIdsOnNodePath(nodeIds: string[] | null): Set<string> {
  if (!nodeIds || nodeIds.length < 2) return new Set()
  const ids = new Set<string>()
  for (let i = 0; i < nodeIds.length - 1; i++) {
    ids.add(`e-${nodeIds[i]}-${nodeIds[i + 1]}`)
  }
  return ids
}

/** Edges on the branch nearest current playback time (for LED stroke animation). */
export function getNeuralLedEdgeIds(currentSeconds: number, labels: string[]): Set<string> {
  const activeLabel = getCurrentMindmapNodeLabelForVideoTime(currentSeconds, labels)
  const path = matchBranchNodeIdsForActiveLabel(activeLabel)
  return edgeIdsOnNodePath(path)
}

type SubtreeLayout = {
  nodes: NeuralFlowGraphNode[]
  edges: NeuralFlowGraphEdge[]
  width: number
  anchorX: number
}

function makeNode(
  n: MindmapJsonNode,
  posX: number,
  y: number,
  theme: MindmapDiagramTheme,
  isRoot: boolean,
): NeuralFlowGraphNode {
  const node: NeuralFlowGraphNode = {
    id: n.id,
    type: 'neural',
    position: { x: posX, y },
    selectable: true,
    data: {
      label: n.label,
      theme,
      isRoot,
    },
  }
  return node
}

function layoutSubtree(
  n: MindmapJsonNode,
  depth: number,
  startX: number,
  theme: MindmapDiagramTheme,
  isRoot: boolean,
): SubtreeLayout {
  const y = 24 + depth * V_GAP
  const children = n.children ?? []
  if (children.length === 0) {
    const anchorX = startX + NODE_W / 2
    const posX = startX
    return {
      nodes: [makeNode(n, posX, y, theme, isRoot)],
      edges: [],
      width: NODE_W + H_GAP,
      anchorX,
    }
  }

  let cursor = startX
  const childLayouts: SubtreeLayout[] = []
  const allChildNodes: NeuralFlowGraphNode[] = []
  const allChildEdges: NeuralFlowGraphEdge[] = []

  for (const child of children) {
    const sub = layoutSubtree(child, depth + 1, cursor, theme, false)
    childLayouts.push(sub)
    allChildNodes.push(...sub.nodes)
    allChildEdges.push(...sub.edges)
    cursor += sub.width
  }

  const totalSpan = cursor - startX
  const firstAnchor = childLayouts[0].anchorX
  const lastAnchor = childLayouts[childLayouts.length - 1].anchorX
  const myAnchorX = (firstAnchor + lastAnchor) / 2
  const myPosX = myAnchorX - NODE_W / 2
  const selfNode = makeNode(n, myPosX, y, theme, isRoot)

  const downEdges: NeuralFlowGraphEdge[] = children.map((c) => {
    const edge: NeuralFlowGraphEdge = {
      id: `e-${n.id}-${c.id}`,
      source: n.id,
      target: c.id,
      type: 'neuralFlow',
      data: {},
    }
    return edge
  })

  const minWidth = NODE_W + H_GAP
  const width = Math.max(totalSpan, minWidth)
  let anchorX = myAnchorX
  if (width > totalSpan) {
    anchorX = startX + width / 2
  }

  return {
    nodes: [selfNode, ...allChildNodes],
    edges: [...allChildEdges, ...downEdges],
    width: Math.max(width, minWidth),
    anchorX,
  }
}

/**
 * Convert a hierarchical mindmap tree (e.g. Lecture core → Concepts → Transformers)
 * into React Flow `nodes` and `edges` JSON. Same pedagogy shape as the former Mermaid mindmap.
 */
export function mindmapTreeToReactFlow(
  root: MindmapJsonNode,
  theme: MindmapDiagramTheme,
): { nodes: NeuralFlowGraphNode[]; edges: NeuralFlowGraphEdge[] } {
  const { nodes, edges } = layoutSubtree(root, 0, 0, theme, true)
  return { nodes, edges }
}

/** Flat transcript / segment list → star mindmap (for pipeline output without hierarchy). */
export function transcriptSegmentsToMindmapTree(
  segments: { id?: string; startSeconds: number; text: string }[],
  rootLabel = 'Session',
): MindmapJsonNode {
  return {
    id: 'root',
    label: rootLabel,
    children: segments.map((s, i) => ({
      id: s.id ?? `seg-${i}`,
      label: `${formatTimestamp(s.startSeconds)} · ${s.text.replace(/\s+/g, ' ').trim().slice(0, 80) || `Clip ${i + 1}`}`,
    })),
  }
}

export function formatTimestamp(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
