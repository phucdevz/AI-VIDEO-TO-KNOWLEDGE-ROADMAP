import type { BackendAudioExtractionResponse } from '../stores/useWorkspaceStore'

/** Map a `lectures` row from Supabase into workspace pipeline state. */
export function mapLectureRowToPipeline(row: Record<string, unknown>): BackendAudioExtractionResponse {
  const transcript = row.transcript
  const flow = row.flow_data
  const quiz = row.quiz ?? row.quiz_data
  const tutor = row.tutor_data ?? (typeof row.summary === 'string' ? { summary: row.summary, key_points: [] } : undefined)
  const knowledgeChunks = row.knowledge_chunks
  const videoUrl =
    typeof row.video_url === 'string'
      ? row.video_url
      : typeof row.source_url === 'string'
        ? row.source_url
        : undefined
  return {
    source_url: videoUrl,
    video_id: typeof row.video_id === 'string' ? row.video_id : undefined,
    title: typeof row.title === 'string' ? row.title : (row.title as null | undefined),
    lecture_id: row.id != null ? String(row.id) : null,
    persisted: true,
    react_flow:
      flow && typeof flow === 'object' && 'nodes' in flow && 'edges' in flow
        ? (flow as BackendAudioExtractionResponse['react_flow'])
        : { nodes: [], edges: [] },
    transcription:
      transcript && typeof transcript === 'object'
        ? (transcript as BackendAudioExtractionResponse['transcription'])
        : undefined,
    knowledge_chunks: Array.isArray(knowledgeChunks)
      ? (knowledgeChunks as BackendAudioExtractionResponse['knowledge_chunks'])
      : undefined,
    quiz: quiz ?? undefined,
    tutor: tutor ?? undefined,
  }
}
