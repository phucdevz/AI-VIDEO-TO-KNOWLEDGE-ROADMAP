import type { EtherMindmapQuadrant } from './etherMindmapTypes'

/**
 * Hierarchical mindmap JSON (hub + bidirectional branches).
 * Use on `side` / `color` for direct children of the center when you want explicit placement.
 */
export type EtherMindmapBranchSide = 'left' | 'right'

/** Semantic colors → quadrant mapping (same as UI reference). */
export type EtherMindmapBranchColor = 'yellow' | 'orange' | 'mint' | 'purple'

export type EtherMindmapJsonNode = {
  id?: string
  label: string
  /** Deep time-linking — seconds (required for production maps). */
  timestamp?: number
  /** Only meaningful on nodes whose parent is the hub: place branch on left or right half. */
  side?: EtherMindmapBranchSide
  /** Only on hub-level branches: ties to quadrant fill. */
  color?: EtherMindmapBranchColor
  children?: EtherMindmapJsonNode[]
}

export function colorToQuadrant(c: EtherMindmapBranchColor | undefined): EtherMindmapQuadrant {
  switch (c) {
    case 'yellow':
      return 'tl'
    case 'orange':
      return 'bl'
    case 'mint':
      return 'tr'
    case 'purple':
      return 'br'
    default:
      return 'tl'
  }
}

/**
 * Balanced left/right assignment for hub children when `side`/`color` are absent.
 * Left half of children → alternate TL/BL; right half → alternate TR/BR.
 */
export function quadrantForHubChildIndex(i: number, hubChildCount: number): Exclude<EtherMindmapQuadrant, 'center'> {
  const k = Math.max(1, hubChildCount)
  const leftN = Math.ceil(k / 2)
  if (i < leftN) {
    return i % 2 === 0 ? 'tl' : 'bl'
  }
  const j = i - leftN
  return j % 2 === 0 ? 'tr' : 'br'
}
