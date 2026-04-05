import type { EtherMindmapEdge, EtherMindmapNode } from './etherMindmapTypes'
import { ETHER_QUADRANT_STROKE } from './etherMindmapTypes'
import type { EtherMindmapJsonNode } from './etherMindmapJson'
import { colorToQuadrant, quadrantForHubChildIndex } from './etherMindmapJson'
import { assignEtherMindmapHandles, etherNodeMeasuredBox, layoutEtherMindmapCenterOut } from './etherMindmapLayout'

/** Nested hierarchical JSON — hub branches to 4 colored directions + deeper levels. */
export type EtherDemoNestedNode = EtherMindmapJsonNode & {
  id: string
  /** Demo-only: matches pipeline `data.highlight`. */
  highlight?: string
  role?: 'main' | 'detail'
  children?: EtherDemoNestedNode[]
}

export const ETHER_DEMO_MINDMAP_TREE: EtherDemoNestedNode = {
  id: 'ether-root',
  label: 'Hệ thống đa tác nhân',
  timestamp: 0,
  highlight: 'Tổng quan kiến trúc tác nhân, công cụ và luồng làm việc được đề cập trong bài.',
  children: [
    {
      id: 'ether-tl',
      label: 'Foundations',
      side: 'left',
      color: 'yellow',
      timestamp: 45,
      highlight: 'Các khái niệm nền cần nắm trước khi đi sâu vào triển khai.',
      children: [
        {
          id: 'ether-tl-f',
          role: 'detail',
          label: 'Trọng tâm: nền khái niệm cốt lõi',
          timestamp: 46,
          highlight: 'Bốn ý then chốt cần nhớ trước phần demo.',
        },
        {
          id: 'ether-tl-a',
          label: 'Core terms',
          timestamp: 52,
          highlight: 'Thuật ngữ trọng tâm được định nghĩa rõ trong đoạn mở đầu phần lý thuyết.',
        },
        {
          id: 'ether-tl-b',
          label: 'Definitions',
          timestamp: 88,
          highlight: 'Phân biệt các định nghĩa dễ nhầm để tránh sai lệch khi coding.',
        },
      ],
    },
    {
      id: 'ether-bl',
      label: 'Examples',
      side: 'left',
      color: 'orange',
      timestamp: 120,
      highlight: 'Minh họa cụ thể giúp liên hệ lý thuyết với tình huống thật.',
      children: [
        {
          id: 'ether-bl-f',
          role: 'detail',
          label: 'Điểm nhìn: ví dụ gần thực tế',
          timestamp: 122,
          highlight: 'Hai case minh họa luận điểm chính của phần này.',
        },
        {
          id: 'ether-bl-a',
          label: 'Case A',
          timestamp: 135,
          highlight: 'Kịch bản đầu tiên: điểm mạnh/yếu và khi nào nên áp dụng.',
        },
        {
          id: 'ether-bl-b',
          label: 'Case B',
          timestamp: 158,
          highlight: 'Kịch bản thứ hai: so sánh nhanh với Case A để củng cố.',
        },
      ],
    },
    {
      id: 'ether-tr',
      label: 'Methods',
      side: 'right',
      color: 'mint',
      timestamp: 200,
      highlight: 'Các bước hoặc mẫu triển khai được giảng viên nhấn mạnh.',
      children: [
        {
          id: 'ether-tr-f',
          role: 'detail',
          label: 'Tập trung: hai hướng triển khai',
          timestamp: 202,
          highlight: 'So sánh nhanh khi nên dùng từng approach.',
        },
        {
          id: 'ether-tr-a',
          label: 'Approach 1',
          timestamp: 215,
          highlight: 'Luồng xử lý đầu tiên: phù hợp khi ưu tiên đơn giản và tốc độ.',
        },
        {
          id: 'ether-tr-b',
          label: 'Approach 2',
          timestamp: 242,
          highlight: 'Luồng thay thế: khi cần mở rộng hoặc tích hợp thêm thành phần.',
        },
      ],
    },
    {
      id: 'ether-br',
      label: 'Wrap-up',
      side: 'right',
      color: 'purple',
      timestamp: 300,
      highlight: 'Chốt lại bài và gợi ý hướng đi tiếp theo cho người học.',
      children: [
        {
          id: 'ether-br-f',
          role: 'detail',
          label: 'Tóm lại: việc cần làm tiếp',
          timestamp: 302,
          highlight: 'Một dòng hành động sau khi xem xong phần kết.',
        },
        {
          id: 'ether-br-a',
          label: 'Summary',
          timestamp: 318,
          highlight: 'Tóm tắt ba ý lớn nhất đã được nhắc lại trong phần kết.',
        },
        {
          id: 'ether-br-b',
          label: 'Next steps',
          timestamp: 340,
          highlight: 'Gợi ý tài liệu hoặc bài tập để củng cố sau khi xem xong.',
        },
      ],
    },
  ],
}

function depthMapFromRoot(
  rootId: string,
  childrenMap: Map<string, string[]>,
): Map<string, number> {
  const depths = new Map<string, number>()
  function walk(id: string, d: number) {
    depths.set(id, d)
    for (const c of childrenMap.get(id) ?? []) walk(c, d + 1)
  }
  walk(rootId, 0)
  return depths
}

function collectTree(
  n: EtherDemoNestedNode,
  edges: { source: string; target: string }[],
  order: string[],
) {
  order.push(n.id)
  for (const c of n.children ?? []) {
    edges.push({ source: n.id, target: c.id })
    collectTree(c, edges, order)
  }
}

/** When demo nodes specify `color`, map to quadrant; else use balanced hub indexing. */
function branchForDemoChild(
  node: EtherDemoNestedNode,
  indexAmongSiblings: number,
  hubChildCount: number,
): 'tl' | 'bl' | 'tr' | 'br' {
  if (node.color) {
    return colorToQuadrant(node.color) as 'tl' | 'bl' | 'tr' | 'br'
  }
  return quadrantForHubChildIndex(indexAmongSiblings, hubChildCount)
}

export function buildEtherDemoFlow(): { nodes: EtherMindmapNode[]; edges: EtherMindmapEdge[] } {
  const tree = ETHER_DEMO_MINDMAP_TREE
  const edgeList: { source: string; target: string }[] = []
  const order: string[] = []
  collectTree(tree, edgeList, order)

  const childrenMap = new Map<string, string[]>()
  for (const e of edgeList) {
    if (!childrenMap.has(e.source)) childrenMap.set(e.source, [])
    childrenMap.get(e.source)!.push(e.target)
  }

  const hubCh = childrenMap.get(tree.id) ?? []
  const hubK = hubCh.length

  const nodeMeta = new Map<
    string,
    { width: number; height: number; quadrant: 'tl' | 'bl' | 'tr' | 'br' | 'center'; branchKey: 'tl' | 'bl' | 'tr' | 'br' }
  >()

  function visitMeta(n: EtherDemoNestedNode, branch: 'tl' | 'bl' | 'tr' | 'br' | 'center', indexInHub: number) {
    const isRoot = n.id === tree.id
    const boxVar = isRoot ? 'central' : n.role === 'detail' ? 'detail' : 'pill'
    const { width, height } = etherNodeMeasuredBox(boxVar, n.label, n.highlight)
    const quad = isRoot ? 'center' : (branch as 'tl' | 'bl' | 'tr' | 'br')
    const branchKey = isRoot ? 'tl' : (branch as 'tl' | 'bl' | 'tr' | 'br')
    nodeMeta.set(n.id, {
      width,
      height,
      quadrant: quad,
      branchKey,
    })
    const ch = n.children ?? []
    if (isRoot) {
      ch.forEach((c, i) => {
        const child = c as EtherDemoNestedNode
        const b = branchForDemoChild(child, i, hubK)
        visitMeta(child, b, i)
      })
    } else {
      ch.forEach((c) => visitMeta(c as EtherDemoNestedNode, branch as 'tl' | 'bl' | 'tr' | 'br', indexInHub))
    }
  }
  visitMeta(tree, 'center', 0)

  const rootBranchOverride = new Map<string, 'tl' | 'bl' | 'tr' | 'br'>()
  hubCh.forEach((cid, i) => {
    const node = tree.children?.find((c) => c.id === cid) as EtherDemoNestedNode | undefined
    if (node) {
      rootBranchOverride.set(cid, branchForDemoChild(node, i, hubK))
    }
  })

  const positions = layoutEtherMindmapCenterOut(tree.id, childrenMap, nodeMeta, rootBranchOverride)
  const depths = depthMapFromRoot(tree.id, childrenMap)

  const nodes: EtherMindmapNode[] = order.map((id) => {
    const flat = findNodeById(tree, id)!
    const pos = positions.get(id) ?? { x: 0, y: 0 }
    const meta = nodeMeta.get(id)!
    const isRoot = id === tree.id
    const data = {
      label: flat.label,
      timestamp: flat.timestamp ?? 0,
      highlight: flat.highlight?.trim() || undefined,
      role: flat.role === 'detail' ? 'detail' : 'main',
      quadrant: meta.quadrant,
      variant: isRoot ? ('central' as const) : ('pill' as const),
      branchKey: meta.branchKey,
    }
    if (isRoot) {
      return {
        id,
        type: 'etherCentral',
        position: pos,
        data,
      }
    }
    return {
      id,
      type: 'etherPill',
      position: pos,
      data,
    }
  })

  const treeEdges: EtherMindmapEdge[] = edgeList.map((e, i) => {
    const tgt = nodeMeta.get(e.target)
    const branch = tgt && tgt.quadrant !== 'center' ? tgt.quadrant : 'tl'
    const stroke = ETHER_QUADRANT_STROKE[branch]
    const td = depths.get(e.target) ?? 1
    const strokeWidth = Math.max(1.25, 3.4 - td * 0.42)
    return {
      id: `e-tree-${i}-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'etherBezier' as const,
      data: { kind: 'tree' as const, stroke, strokeWidth },
    }
  })

  const cross: EtherMindmapEdge = {
    id: 'e-cross-tl-bl',
    source: 'ether-tl-a',
    target: 'ether-bl-a',
    type: 'etherCross',
    data: { kind: 'crossLink' },
  }

  return { nodes, edges: assignEtherMindmapHandles(nodes, [...treeEdges, cross]) }
}

function findNodeById(n: EtherDemoNestedNode, id: string): EtherDemoNestedNode | null {
  if (n.id === id) return n
  for (const c of n.children ?? []) {
    const f = findNodeById(c, id)
    if (f) return f
  }
  return null
}
