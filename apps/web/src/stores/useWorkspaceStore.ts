import { create } from 'zustand'
import { validateSeekSeconds } from '../lib/validateSeekSeconds'

export type SeekResult = { ok: true } | { ok: false; message: string }

export type MindmapHighlightBookmark = {
  id: string
  nodeLabel: string
  startSeconds: number
  endSeconds: number
  savedAt: number
}

/**
 * Deep Time-Linking: mindmap segments / timestamps request a seek on the video player.
 * AI Bookmark: saved clip ranges + optional A-B loop playback.
 */
type WorkspaceState = {
  seekToSeconds: number | null
  activeSegmentId: string | null
  /** Thời gian phát hiện tại (Workspace video) — mindmap + learning progress. */
  videoCurrentTimeSeconds: number
  requestSeek: (seconds: number, segmentId?: string) => SeekResult
  clearSeekRequest: () => void
  setVideoCurrentTimeSeconds: (seconds: number) => void

  mindmapHighlights: MindmapHighlightBookmark[]
  addMindmapHighlight: (
    input: Pick<MindmapHighlightBookmark, 'nodeLabel' | 'startSeconds' | 'endSeconds'>,
  ) => SeekResult
  removeMindmapHighlight: (id: string) => void

  /** Khi > 0, WorkspaceVideoPanel bật phát và seek tới clipLoop.start */
  clipLoopPlaybackPulse: number
  clipLoop: { start: number; end: number } | null
  startClipLoop: (start: number, end: number) => SeekResult
  stopClipLoop: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  seekToSeconds: null,
  activeSegmentId: null,
  videoCurrentTimeSeconds: 0,

  mindmapHighlights: [],
  clipLoopPlaybackPulse: 0,
  clipLoop: null,

  requestSeek: (seconds, segmentId) => {
    const v = validateSeekSeconds(seconds)
    if (!v.ok) return { ok: false, message: v.message }
    set({
      seekToSeconds: seconds,
      activeSegmentId: segmentId ?? null,
      clipLoop: null,
    })
    return { ok: true }
  },
  clearSeekRequest: () => set({ seekToSeconds: null }),
  setVideoCurrentTimeSeconds: (seconds) =>
    set({ videoCurrentTimeSeconds: Number.isFinite(seconds) ? Math.max(0, seconds) : 0 }),

  addMindmapHighlight: ({ nodeLabel, startSeconds, endSeconds }) => {
    const vs = validateSeekSeconds(startSeconds)
    if (!vs.ok) return { ok: false, message: vs.message }
    const ve = validateSeekSeconds(endSeconds)
    if (!ve.ok) return { ok: false, message: ve.message }
    if (endSeconds <= startSeconds) {
      return { ok: false, message: 'Đoạn clip không hợp lệ.' }
    }
    const trimmed = nodeLabel.trim()
    if (!trimmed) return { ok: false, message: 'Thiếu tên nút.' }
    const dup = get().mindmapHighlights.some(
      (h) =>
        h.nodeLabel === trimmed &&
        h.startSeconds === startSeconds &&
        h.endSeconds === endSeconds,
    )
    if (dup) return { ok: false, message: 'Đã lưu mốc này rồi.' }
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `hl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    set((s) => ({
      mindmapHighlights: [
        {
          id,
          nodeLabel: trimmed,
          startSeconds,
          endSeconds,
          savedAt: Date.now(),
        },
        ...s.mindmapHighlights,
      ],
    }))
    return { ok: true }
  },
  removeMindmapHighlight: (id) =>
    set((s) => ({
      mindmapHighlights: s.mindmapHighlights.filter((h) => h.id !== id),
    })),

  startClipLoop: (start, end) => {
    const vs = validateSeekSeconds(start)
    if (!vs.ok) return { ok: false, message: vs.message }
    const ve = validateSeekSeconds(end)
    if (!ve.ok) return { ok: false, message: ve.message }
    if (end <= start) return { ok: false, message: 'Khoảng phát không hợp lệ.' }
    set((s) => ({
      clipLoop: { start, end },
      seekToSeconds: start,
      activeSegmentId: null,
      clipLoopPlaybackPulse: s.clipLoopPlaybackPulse + 1,
    }))
    return { ok: true }
  },
  stopClipLoop: () => set({ clipLoop: null }),
}))
