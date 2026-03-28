import { useEffect, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import { useMediaCommandStore } from '../../stores/useMediaCommandStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { LearningProgressTrack } from './LearningProgressTrack'

export type WorkspaceVideoVariant = 'inline' | 'mini' | 'placeholder'

type WorkspaceVideoPanelProps = {
  /** URL video (pipeline sẽ thay theo theo bài giảng). */
  videoUrl: string
  /** Hiển thị poster/thumbnail trước khi phát — chỉ áp dụng variant inline. */
  lightPoster?: boolean
  lectureTitle?: string
  variant: WorkspaceVideoVariant
  /** Khi mount player mới (mini hoặc quay lại inline), seek tới vị trí đã phát. */
  resumeAtSeconds?: number
  onPlaybackProgress?: (playedSeconds: number) => void
  /** Placeholder: cuộn tới vùng video trong workspace. */
  onScrollToVideo?: () => void
  /** Inline: giảm mô tả phụ khi Focus Mode. */
  compact?: boolean
}

/**
 * Video column — Deep Time-Linking qua Zustand; hỗ trợ inline / mini-player / placeholder.
 */
export function WorkspaceVideoPanel({
  videoUrl,
  lightPoster = true,
  lectureTitle,
  variant,
  resumeAtSeconds = 0,
  onPlaybackProgress,
  onScrollToVideo,
  compact = false,
}: WorkspaceVideoPanelProps) {
  const playerRef = useRef<ReactPlayer>(null)
  const resumeAppliedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const seekToSeconds = useWorkspaceStore((s) => s.seekToSeconds)
  const clearSeekRequest = useWorkspaceStore((s) => s.clearSeekRequest)
  const setVideoCurrentTimeSeconds = useWorkspaceStore((s) => s.setVideoCurrentTimeSeconds)
  const clipLoopPlaybackPulse = useWorkspaceStore((s) => s.clipLoopPlaybackPulse)

  useEffect(() => {
    const s0 = useMediaCommandStore.getState()
    let lastPlay = s0.playPulse
    let lastMute = s0.mutePulse
    return useMediaCommandStore.subscribe((s) => {
      if (s.playPulse > lastPlay) {
        lastPlay = s.playPulse
        setPlaying(true)
      }
      if (s.mutePulse > lastMute) {
        lastMute = s.mutePulse
        setMuted((m) => !m)
      }
    })
  }, [])

  useEffect(() => {
    resumeAppliedRef.current = false
  }, [variant, videoUrl])

  useEffect(() => {
    if (seekToSeconds == null) return
    if (variant === 'placeholder') return
    setVideoCurrentTimeSeconds(seekToSeconds)
    const p = playerRef.current
    if (p) {
      p.seekTo(seekToSeconds, 'seconds')
    }
    clearSeekRequest()
  }, [seekToSeconds, clearSeekRequest, setVideoCurrentTimeSeconds, variant])

  useEffect(() => {
    if (variant === 'placeholder') return
    if (clipLoopPlaybackPulse === 0) return
    setPlaying(true)
  }, [clipLoopPlaybackPulse, variant])

  const handleReady = () => {
    if (resumeAppliedRef.current) return
    if (variant === 'placeholder') return
    const p = playerRef.current
    if (p && resumeAtSeconds > 0.25) {
      p.seekTo(resumeAtSeconds, 'seconds')
    }
    resumeAppliedRef.current = true
  }

  const handleProgress = (state: { playedSeconds: number }) => {
    const sec = state.playedSeconds
    const loop = useWorkspaceStore.getState().clipLoop
    if (loop && sec >= loop.end - 0.35) {
      playerRef.current?.seekTo(loop.start, 'seconds')
    }
    onPlaybackProgress?.(sec)
    setVideoCurrentTimeSeconds(sec)
  }

  if (variant === 'placeholder') {
    return (
      <div className="flex min-h-0 w-full max-w-full flex-col rounded-ds-lg border border-ds-border border-dashed bg-ds-bg/30 p-4 shadow-ds-soft backdrop-blur-[10px]">
        <h2 id="workspace-video-title" className="ds-text-label mb-3 text-ds-secondary">
          Video
        </h2>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-ds-sm bg-ds-bg/40 py-10 text-center">
          <p className="max-w-[16rem] text-sm font-bold text-ds-text-primary">
            Video đang phát ở góc dưới bên phải
          </p>
          <p className="max-w-[18rem] text-xs text-ds-text-secondary">
            Cuộn lên để xem lại trong cột hoặc dùng nút bên dưới.
          </p>
          {onScrollToVideo && (
            <button
              type="button"
              onClick={onScrollToVideo}
              className="ds-interactive rounded-ds-sm bg-ds-primary px-4 py-2 text-xs font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95"
            >
              Cuộn tới vị trí video
            </button>
          )}
        </div>
        {lectureTitle && (
          <p className="mt-3 truncate text-xs font-bold text-ds-text-secondary">{lectureTitle}</p>
        )}
      </div>
    )
  }

  if (variant === 'mini') {
    return (
      <div
        role="region"
        aria-label="Video mini-player"
        className="h-full w-full overflow-hidden rounded-ds-lg bg-black shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-ds-bg/95 px-2 py-1.5 backdrop-blur-sm">
          <span className="min-w-0 truncate pl-1 text-[11px] font-bold text-ds-text-primary">
            {lectureTitle ?? 'Video'}
          </span>
        </div>
        <div className="relative aspect-video w-full bg-black">
          <div className="absolute inset-0 z-20 min-h-0 min-w-0 [&_iframe]:relative [&_iframe]:z-20 [&_video]:h-full [&_video]:w-full [&_video]:object-contain">
            <ReactPlayer
              ref={playerRef}
              key={`mini-${videoUrl}`}
              className="!absolute !inset-0 [&_iframe]:max-h-full [&_iframe]:max-w-full"
              url={videoUrl}
              width="100%"
              height="100%"
              controls
              light={false}
              playing={playing}
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onReady={handleReady}
              onProgress={handleProgress}
              progressInterval={500}
              config={{
                youtube: { playerVars: { modestbranding: 1 } },
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex min-h-0 w-full max-w-full flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 shadow-ds-soft backdrop-blur-[10px] ${compact ? 'p-3' : 'p-4'}`}
    >
      <h2 id="workspace-video-title" className="ds-text-label mb-3 text-ds-secondary">
        Video
      </h2>
      <LearningProgressTrack compact={compact} />
      <div className="relative z-20 aspect-video w-full max-w-full overflow-hidden rounded-ds-sm bg-black">
        <div className="absolute inset-0 z-20 min-h-0 min-w-0 [&_iframe]:relative [&_iframe]:z-20 [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
          <ReactPlayer
            ref={playerRef}
            key={`inline-${videoUrl}`}
            className="!absolute !inset-0 [&_iframe]:max-h-full [&_iframe]:max-w-full [&_video]:h-full [&_video]:w-full [&_video]:object-contain"
            url={videoUrl}
            width="100%"
            height="100%"
            controls
            light={lightPoster}
            playing={playing}
            muted={muted}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onReady={handleReady}
            onProgress={handleProgress}
            progressInterval={500}
            config={{
              youtube: { playerVars: { modestbranding: 1 } },
            }}
          />
        </div>
      </div>
      <p className={`mt-4 font-bold text-ds-text-primary ${compact ? 'text-sm' : 'text-sm'}`}>
        {lectureTitle ? lectureTitle : 'Demo lecture (replace URL from pipeline)'}
      </p>
      {!compact && (
        <p className="mt-2 text-xs font-normal text-ds-text-secondary">
          Click a time-link in the mindmap panel to seek — state is shared via Zustand.
        </p>
      )}
    </div>
  )
}
