import { MAX_SEEK_SECONDS } from './validateSeekSeconds'

/** Ngưỡng thời gian (giây) cho từng node demo — dùng tính % và tô màu đã xem. */
export const LEARNING_MILESTONE_THRESHOLDS_SECONDS = [0, 45, 252, 280, 320, 380, 420] as const

const EPSILON_SEC = 0.75

export function extractMindmapNodeLabel(g: Element): string {
  const fo = g.querySelector('foreignObject')
  if (fo?.textContent) return fo.textContent.replace(/\s+/g, ' ').trim()
  const texts = Array.from(g.querySelectorAll('text'))
    .map((t) => t.textContent ?? '')
    .join(' ')
  return texts.replace(/\s+/g, ' ').trim()
}

/** Deep time-link id → regex nhãn nút mindmap demo (đồng bộ DEFAULT_TIMELINE_SEGMENTS). */
const TIMELINE_SEGMENT_TO_LABEL_RE: Record<string, RegExp> = {
  s1: /lecture core|^root$/i,
  s2: /attention/i,
  s3: /transformers/i,
}

/**
 * Tìm nhóm `g.node` trong SVG Mermaid khớp mốc timeline (auto-pan).
 */
export function findMindmapNodeGroupForSegmentId(
  svg: SVGElement,
  segmentId: string,
): SVGGElement | null {
  const re = TIMELINE_SEGMENT_TO_LABEL_RE[segmentId]
  if (!re) return null
  for (const g of svg.querySelectorAll('g.node, g[class*="node"]')) {
    if (re.test(extractMindmapNodeLabel(g))) return g as SVGGElement
  }
  return null
}

export function scrollMindmapNodeIntoViewportCenter(
  scrollRoot: HTMLElement,
  node: Element,
): void {
  const vr = scrollRoot.getBoundingClientRect()
  const nr = node.getBoundingClientRect()
  const dx = nr.left + nr.width / 2 - (vr.left + vr.width / 2)
  const dy = nr.top + nr.height / 2 - (vr.top + vr.height / 2)
  scrollRoot.scrollBy({ left: dx, top: dy, behavior: 'smooth' })
}

/**
 * Seek khi click node — Evaluation cố ý vượt MAX để demo lỗi validate.
 */
export function resolveSeekFromMindmapLabel(label: string): number | null {
  const s = label.trim()
  if (!s) return null
  if (/lecture core|^root$/i.test(s)) return 0
  if (/concepts/i.test(s)) return 45
  if (/attention/i.test(s)) return 252
  if (/transformers/i.test(s)) return 280
  if (/skills/i.test(s)) return 320
  if (/implementation/i.test(s)) return 380
  if (/evaluation/i.test(s)) return MAX_SEEK_SECONDS + 1
  return null
}

/**
 * Ngưỡng “đã xem tới mốc này” cho tiến độ & màu node (Evaluation = 7:00 demo).
 */
export function getProgressThresholdSecondsForLabel(label: string): number | null {
  const s = label.trim()
  if (!s) return null
  if (/lecture core|^root$/i.test(s)) return 0
  if (/concepts/i.test(s)) return 45
  if (/attention/i.test(s)) return 252
  if (/transformers/i.test(s)) return 280
  if (/skills/i.test(s)) return 320
  if (/implementation/i.test(s)) return 380
  if (/evaluation/i.test(s)) return 420
  return null
}

/**
 * Khoảng clip demo cho AI Bookmark: từ mốc neo của nút tới mốc kế tiếp (hoặc +120s nếu là mốc cuối).
 */
export function resolveClipRangeFromMindmapLabel(label: string): { start: number; end: number } | null {
  const start =
    getProgressThresholdSecondsForLabel(label) ?? resolveSeekFromMindmapLabel(label)
  if (start == null || start > MAX_SEEK_SECONDS) return null
  const sorted = [...LEARNING_MILESTONE_THRESHOLDS_SECONDS].sort((a, b) => a - b)
  const next = sorted.find((t) => t > start + 0.5)
  const end =
    next != null ? Math.max(start + 0.5, next - 0.25) : Math.min(start + 120, MAX_SEEK_SECONDS)
  if (end <= start) return null
  return { start, end }
}

export function learningProgressStats(currentSeconds: number): {
  percent: number
  completed: number
  total: number
} {
  const total = LEARNING_MILESTONE_THRESHOLDS_SECONDS.length
  const completed = LEARNING_MILESTONE_THRESHOLDS_SECONDS.filter(
    (t) => currentSeconds >= t - EPSILON_SEC,
  ).length
  const percent = Math.min(100, Math.round((completed / total) * 100))
  return { percent, completed, total }
}

/**
 * Node có anchor gần `currentSeconds` nhất (khoảng cách tuyệt đối tới mốc demo).
 * Hòa: chọn mốc nhỏ hơn để ổn định.
 */
function pickNearestAnchoredNode(
  anchored: { g: Element; anchor: number }[],
  currentSeconds: number,
): Element | null {
  if (anchored.length === 0) return null
  let best: Element | null = null
  let bestDist = Infinity
  let bestAnchor = Infinity
  for (const { g, anchor } of anchored) {
    const d = Math.abs(currentSeconds - anchor)
    if (d < bestDist || (d === bestDist && anchor < bestAnchor)) {
      bestDist = d
      bestAnchor = anchor
      best = g
    }
  }
  return best
}

function pickNearestAnchoredLabel(
  anchored: { label: string; anchor: number }[],
  currentSeconds: number,
): string | null {
  if (anchored.length === 0) return null
  let bestLabel: string | null = null
  let bestDist = Infinity
  let bestAnchor = Infinity
  for (const { label, anchor } of anchored) {
    const d = Math.abs(currentSeconds - anchor)
    if (d < bestDist || (d === bestDist && anchor < bestAnchor)) {
      bestDist = d
      bestAnchor = anchor
      bestLabel = label
    }
  }
  return bestLabel
}

/** Nhãn nút mindmap gần `currentSeconds` nhất (đồng bộ pulse / “đang học” với SVG/React Flow). */
export function getCurrentMindmapNodeLabelForVideoTime(
  currentSeconds: number,
  labels: string[],
): string | null {
  const anchored: { label: string; anchor: number }[] = []
  for (const label of labels) {
    const threshold = getProgressThresholdSecondsForLabel(label)
    if (threshold !== null) {
      anchored.push({ label, anchor: threshold })
    }
  }
  return pickNearestAnchoredLabel(anchored, currentSeconds)
}

/**
 * Đồng bộ từ `videoCurrentTimeSeconds` (react-player): hoàn thành mốc + nút “đang học” gần nhất.
 */
/** Nhánh demo từ root → lá (regex khớp nhãn) — đồng bộ với DEMO_WORKSPACE_MINDMAP_TREE + React Flow. */
const DEMO_PULSE_BRANCH_SEGMENTS: RegExp[][] = [
  [/lecture core|^root$/i],
  [/lecture core|^root$/i, /concepts/i],
  [/lecture core|^root$/i, /concepts/i, /attention/i],
  [/lecture core|^root$/i, /concepts/i, /transformers/i],
  [/lecture core|^root$/i, /skills/i],
  [/lecture core|^root$/i, /skills/i, /implementation/i],
  [/lecture core|^root$/i, /skills/i, /evaluation/i],
]

function matchDemoPulseBranchSegments(activeLabel: string): RegExp[] | null {
  const L = activeLabel.trim()
  let best: RegExp[] | null = null
  for (const path of DEMO_PULSE_BRANCH_SEGMENTS) {
    const leaf = path[path.length - 1]
    if (leaf.test(L)) {
      if (!best || path.length > best.length) best = path
    }
  }
  return best
}

function nodeGroupCenter(el: Element): { x: number; y: number } {
  const b = (el as SVGGElement).getBBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

function edgeConnectionScore(path: SVGPathElement, ga: Element, gb: Element): number {
  const ca = nodeGroupCenter(ga)
  const cb = nodeGroupCenter(gb)
  const len = path.getTotalLength()
  if (len < 4) return Infinity
  const tStart = Math.min(len * 0.06, 12)
  const tEnd = Math.max(len * 0.94, len - 12)
  const pStart = path.getPointAtLength(tStart)
  const pEnd = path.getPointAtLength(tEnd)
  const sum1 =
    Math.hypot(pStart.x - ca.x, pStart.y - ca.y) + Math.hypot(pEnd.x - cb.x, pEnd.y - cb.y)
  const sum2 =
    Math.hypot(pStart.x - cb.x, pStart.y - cb.y) + Math.hypot(pEnd.x - ca.x, pEnd.y - ca.y)
  return Math.min(sum1, sum2)
}

/**
 * Theo nhánh nút gần currentTime nhất: gắn `mindmap-neural-pulse-edge` lên các path nối root → active.
 * Gọi sau `syncMindmapNodeCompletion` (cần class `mindmap-node-current`).
 */
export function syncMindmapNeuralPulse(svgEl: SVGElement): void {
  for (const p of svgEl.querySelectorAll('path.mindmap-neural-pulse-edge')) {
    p.classList.remove('mindmap-neural-pulse-edge')
    ;(p as SVGPathElement).style.removeProperty('stroke-dasharray')
    ;(p as SVGPathElement).style.removeProperty('stroke-dashoffset')
    ;(p as SVGPathElement).style.removeProperty('--mindmap-neural-cycle')
  }

  const active = svgEl.querySelector('g.mindmap-node-current')
  if (!active) return

  const segments = matchDemoPulseBranchSegments(extractMindmapNodeLabel(active))
  if (!segments || segments.length < 2) return

  const branch: SVGGElement[] = []
  for (const re of segments) {
    let found: SVGGElement | null = null
    for (const g of svgEl.querySelectorAll('g.node, g[class*="node"]')) {
      if (re.test(extractMindmapNodeLabel(g))) {
        found = g as SVGGElement
        break
      }
    }
    if (!found) return
    branch.push(found)
  }

  const edgePathSet = new Set<SVGPathElement>()
  svgEl.querySelectorAll<SVGPathElement>('path.edge').forEach((p) => edgePathSet.add(p))
  svgEl.querySelectorAll<SVGPathElement>('g.edge path').forEach((p) => edgePathSet.add(p))
  svgEl
    .querySelectorAll<SVGPathElement>('path[class*="section-edge"]')
    .forEach((p) => edgePathSet.add(p))
  const edgePaths = [...edgePathSet]
  if (edgePaths.length === 0) return

  const used = new Set<SVGPathElement>()
  const SCORE_MAX = 420

  for (let i = 0; i < branch.length - 1; i++) {
    let best: SVGPathElement | null = null
    let bestScore = Infinity
    for (const p of edgePaths) {
      if (used.has(p)) continue
      const s = edgeConnectionScore(p, branch[i], branch[i + 1])
      if (s < bestScore) {
        bestScore = s
        best = p
      }
    }
    if (best !== null && bestScore < SCORE_MAX) {
      best.classList.add('mindmap-neural-pulse-edge')
      used.add(best)
      const plen = best.getTotalLength()
      const dash = Math.max(14, Math.min(40, plen * 0.07))
      const gap = Math.max(22, Math.min(72, plen * 0.11))
      const cycle = dash + gap
      best.style.strokeDasharray = `${dash} ${gap}`
      best.style.strokeDashoffset = '0'
      best.style.setProperty('--mindmap-neural-cycle', `-${cycle}px`)
    }
  }
}

export function syncMindmapNodeCompletion(svgEl: SVGElement, currentSeconds: number): void {
  const anchored: { g: Element; anchor: number }[] = []

  svgEl.querySelectorAll('g.node, g[class*="node"]').forEach((g) => {
    const label = extractMindmapNodeLabel(g)
    const threshold = getProgressThresholdSecondsForLabel(label)

    if (threshold !== null) {
      anchored.push({ g, anchor: threshold })
      const complete = currentSeconds >= threshold - EPSILON_SEC
      g.classList.toggle('mindmap-node-complete', complete)
    } else {
      g.classList.remove('mindmap-node-complete')
    }
  })

  const active = pickNearestAnchoredNode(anchored, currentSeconds)
  svgEl.querySelectorAll('g.node, g[class*="node"]').forEach((g) => {
    const isCurrent = active !== null && g === active
    g.classList.toggle('mindmap-node-current', isCurrent)
    if (isCurrent) g.setAttribute('aria-current', 'true')
    else g.removeAttribute('aria-current')
  })
}
