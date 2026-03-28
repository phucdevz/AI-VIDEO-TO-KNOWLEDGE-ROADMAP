import { learningProgressStats } from '../../lib/mindmapLearning'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

type LearningProgressTrackProps = {
  compact?: boolean
}

/**
 * Thanh tiến độ theo mốc mindmap vs currentTime video (chỉ hiển thị khi gắn vào panel).
 */
export function LearningProgressTrack({ compact }: LearningProgressTrackProps) {
  const t = useWorkspaceStore((s) => s.videoCurrentTimeSeconds)
  const { percent, completed, total } = learningProgressStats(t)

  return (
    <div className={`w-full ${compact ? 'mb-2' : 'mb-3'}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="ds-text-label text-[10px] text-ds-text-secondary md:text-[10px]">
          Learning progress
        </span>
        <span className="font-mono text-[11px] font-bold tabular-nums text-ds-secondary">
          {completed}/{total} mốc
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-ds-border/40"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Tiến độ kiến thức theo mindmap"
      >
        <div
          className="h-full rounded-full bg-ds-secondary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
