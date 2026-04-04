import { useMemo } from 'react'
import { learningProgressStats, milestoneSecondsFromReactFlowNodes } from '../../lib/mindmapLearning'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

/**
 * Badge % cố định góc màn hình (Workspace) — glass, tránh chồng mini-player.
 * Tiến độ gắn với các mốc timestamp trên mindmap pipeline.
 */
export function LearningProgressHud() {
  const t = useWorkspaceStore((s) => s.videoCurrentTimeSeconds)
  const pipelineNodes = useWorkspaceStore((s) => s.pipelineReactFlow?.nodes)
  const milestones = useMemo(
    () => milestoneSecondsFromReactFlowNodes(pipelineNodes ?? null),
    [pipelineNodes],
  )
  const { percent, completed, total } = learningProgressStats(t, milestones)

  return (
    <div
      className="ds-surface-glass pointer-events-none fixed right-4 top-[4.5rem] z-[55] select-none rounded-ds-lg border border-ds-border px-3 py-2 shadow-ds-soft backdrop-blur-[10px] md:right-6 md:top-20"
      aria-live="polite"
      aria-label={`Tiến độ kiến thức ${percent} phần trăm`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-ds-text-secondary">
        Đã tiếp thu
      </p>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-ds-secondary">{percent}%</p>
      <p className="mt-0.5 text-[10px] text-ds-text-secondary">
        {completed}/{total} mốc mindmap
      </p>
    </div>
  )
}
