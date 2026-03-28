import { create } from 'zustand'
import { validateSeekSeconds } from '../lib/validateSeekSeconds'

export type SeekResult = { ok: true } | { ok: false; message: string }

/**
 * Deep Time-Linking: mindmap segments / timestamps request a seek on the video player.
 */
type WorkspaceState = {
  seekToSeconds: number | null
  activeSegmentId: string | null
  /** Thời gian phát hiện tại (Workspace video) — mindmap + learning progress. */
  videoCurrentTimeSeconds: number
  requestSeek: (seconds: number, segmentId?: string) => SeekResult
  clearSeekRequest: () => void
  setVideoCurrentTimeSeconds: (seconds: number) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  seekToSeconds: null,
  activeSegmentId: null,
  videoCurrentTimeSeconds: 0,
  requestSeek: (seconds, segmentId) => {
    const v = validateSeekSeconds(seconds)
    if (!v.ok) return { ok: false, message: v.message }
    set({ seekToSeconds: seconds, activeSegmentId: segmentId ?? null })
    return { ok: true }
  },
  clearSeekRequest: () => set({ seekToSeconds: null }),
  setVideoCurrentTimeSeconds: (seconds) =>
    set({ videoCurrentTimeSeconds: Number.isFinite(seconds) ? Math.max(0, seconds) : 0 }),
}))
