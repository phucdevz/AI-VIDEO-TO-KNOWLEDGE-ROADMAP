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

export function learningProgressStats(currentSeconds: number): {
  percent: number
  completed: number
  total: number
} {
  const total = LEARNING_MILESTONE_THRESHOLDS_SECONDS.length
  const completed = LEARNING_MILESTONE_THRESHOLDS_SECONDS.filter(
    (t) => currentSeconds >= t - EPSILON_SEC,
  ).length
  const percent = total === 0 ? 0 : Math.min(100, Math.round((completed / total) * 100))
  return { percent, completed, total }
}

/**
 * Đánh dấu hoàn thành trên các `g.node` của SVG Mermaid.
 */
export function syncMindmapNodeCompletion(svgEl: SVGElement, currentSeconds: number): void {
  svgEl.querySelectorAll('g.node, g[class*="node"]').forEach((g) => {
    const label = extractMindmapNodeLabel(g)
    const threshold = getProgressThresholdSecondsForLabel(label)
    if (threshold === null) return
    const complete = currentSeconds >= threshold - EPSILON_SEC
    g.classList.toggle('mindmap-node-complete', complete)
  })
}
