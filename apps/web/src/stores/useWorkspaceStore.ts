import { create } from 'zustand'
import { validateSeekSeconds } from '../lib/validateSeekSeconds'
import type { NeuralFlowGraphEdge, NeuralFlowGraphNode } from '../lib/mindmapToReactFlow'

export type SeekResult = { ok: true } | { ok: false; message: string }

export type MindmapHighlightBookmark = {
  id: string
  nodeLabel: string
  startSeconds: number
  endSeconds: number
  savedAt: number
}

export type TranscriptSegment = {
  start: number
  end: number
  text: string
}

export type KnowledgeChunk = {
  text: string
  start_seconds: number
  end_seconds: number
  segment_indices?: number[]
}

export type PipelineReactFlowGraph = {
  nodes: NeuralFlowGraphNode[]
  edges: NeuralFlowGraphEdge[]
}

export type BackendAudioExtractionResponse = {
  source_url?: string
  video_id?: string
  title?: string | null
  lecture_id?: string | null
  persisted?: boolean
  react_flow?: PipelineReactFlowGraph | null
  transcription?: {
    segments?: TranscriptSegment[]
  } | null
  knowledge_chunks?: KnowledgeChunk[] | null
  quiz?: unknown
  tutor?: unknown
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

  /** Backend pipeline result (extract -> transcribe -> ai -> save) */
  pipelineSourceUrl: string | null
  pipelineVideoUrl: string | null
  pipelineLectureId: string | null
  pipelineLectureTitle: string | null
  pipelineReactFlow: PipelineReactFlowGraph | null
  transcriptSegments: TranscriptSegment[]
  knowledgeChunks: KnowledgeChunk[]
  quiz: unknown
  tutor: unknown
  persisted: boolean

  setPipelineResult: (r: BackendAudioExtractionResponse) => void
  clearPipelineResult: () => void

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

  pipelineSourceUrl: null,
  pipelineVideoUrl: null,
  pipelineLectureId: null,
  pipelineLectureTitle: null,
  pipelineReactFlow: null,
  transcriptSegments: [],
  knowledgeChunks: [],
  quiz: null,
  tutor: null,
  persisted: false,

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

  setPipelineResult: (r: BackendAudioExtractionResponse) => {
    const sourceUrl = r.source_url ?? null
    const videoUrl = sourceUrl
    const segments = (r.transcription?.segments ?? []).map((s) => ({
      start: Number(s.start) || 0,
      end: Number(s.end) || 0,
      text: String(s.text ?? '').trim(),
    }))
    const rf = r.react_flow
    const reactFlowGraph =
      rf && Array.isArray(rf.nodes) && Array.isArray(rf.edges) ? { nodes: rf.nodes, edges: rf.edges } : null
    const chunks = Array.isArray(r.knowledge_chunks)
      ? r.knowledge_chunks
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            text: String((c as any).text ?? '').trim(),
            start_seconds: Number((c as any).start_seconds) || 0,
            end_seconds: Number((c as any).end_seconds) || 0,
            segment_indices: Array.isArray((c as any).segment_indices) ? (c as any).segment_indices : undefined,
          }))
          .filter((c) => c.text.length > 0 && Number.isFinite(c.start_seconds) && Number.isFinite(c.end_seconds) && c.end_seconds > c.start_seconds)
      : []

    set({
      pipelineSourceUrl: sourceUrl,
      pipelineVideoUrl: videoUrl,
      pipelineLectureId: r.lecture_id ?? null,
      pipelineLectureTitle: r.title ?? null,
      pipelineReactFlow: reactFlowGraph,
      transcriptSegments: segments,
      knowledgeChunks: chunks,
      quiz: r.quiz ?? null,
      tutor: r.tutor ?? null,
      persisted: Boolean(r.persisted),

      // Reset learning state for the new lecture
      seekToSeconds: null,
      activeSegmentId: null,
      clipLoop: null,
      clipLoopPlaybackPulse: 0,
      videoCurrentTimeSeconds: 0,
      mindmapHighlights: [],
    })
  },

  clearPipelineResult: () =>
    set({
      pipelineSourceUrl: null,
      pipelineVideoUrl: null,
      pipelineLectureId: null,
      pipelineLectureTitle: null,
      pipelineReactFlow: null,
      transcriptSegments: [],
      knowledgeChunks: [],
      quiz: null,
      tutor: null,
      persisted: false,

      seekToSeconds: null,
      activeSegmentId: null,
      clipLoop: null,
      clipLoopPlaybackPulse: 0,
      videoCurrentTimeSeconds: 0,
      mindmapHighlights: [],
    }),

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
