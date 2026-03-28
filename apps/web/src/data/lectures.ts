/** Mock library — đồng bộ Dashboard ↔ Workspace (?lecture=). */

import lectureList from './lectures.json'

export type LectureRecord = {
  id: string
  title: string
  course: string
  progress: number
  duration: string
  /** Bài đã kiểm duyệt — dùng cho sitemap / SEO. */
  is_verified: boolean
}

export const MOCK_LECTURES: LectureRecord[] = lectureList

/** Mốc thời gian demo (đồng bộ Mindmap deep-links + JSON-LD Clip). */
export type TimelineSegment = { id: string; label: string; startSeconds: number }

export const DEFAULT_TIMELINE_SEGMENTS: TimelineSegment[] = [
  { id: 's1', label: 'Introduction & goals', startSeconds: 0 },
  { id: 's2', label: 'Attention mechanism', startSeconds: 252 },
  { id: 's3', label: 'Multi-head depth', startSeconds: 512 },
]

export function getLectureById(id: string | null | undefined): LectureRecord | undefined {
  if (!id) return undefined
  return MOCK_LECTURES.find((l) => l.id === id)
}
