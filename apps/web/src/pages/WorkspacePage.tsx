import { AnimatePresence, motion } from 'framer-motion'
import { Focus, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import {
  LearningProgressHud,
  MindmapPanel,
  ProcessingVisualizer,
  TutorSidebar,
  WorkspaceVideoPanel,
} from '../components/workspace'
import { PageMeta, WorkspaceJsonLd } from '../components/seo'
import { DEFAULT_TIMELINE_SEGMENTS, getLectureById } from '../data/lectures'
import { lectureOgDescription, lectureOgTitle } from '../lib/lectureSeo'
import { SITE_NAME } from '../lib/site'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

const DEMO_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

type PlayerLayoutState = { stickyMini: boolean; resumeAtSeconds: number }

function playerLayoutReducer(
  state: PlayerLayoutState,
  action: { type: 'visibility'; isIntersecting: boolean; playedSeconds: number },
): PlayerLayoutState {
  const nextSticky = !action.isIntersecting
  if (nextSticky === state.stickyMini) return state
  return { stickyMini: nextSticky, resumeAtSeconds: action.playedSeconds }
}

/**
 * Heart of the app — 3 columns on large screens; stacked on smaller viewports.
 * Focus Mode: ẩn tutor, mở rộng video + mindmap (framer-motion).
 * Cuộn qua vùng video: sticky mini-player góc phải (viewport IntersectionObserver + portal).
 */
export function WorkspacePage() {
  const [searchParams] = useSearchParams()
  const lectureIdParam = searchParams.get('lecture')
  const lecture = getLectureById(lectureIdParam ?? undefined)

  const resolvedId = lecture?.id ?? 'demo'
  const resolvedTitle = lecture?.title ?? 'Bài giảng demo'
  const resolvedCourse = lecture?.course ?? 'Demo'

  const metaPath =
    lecture != null ? `/workspace?lecture=${encodeURIComponent(lecture.id)}` : '/workspace'

  const docTitle = `${lectureOgTitle(resolvedTitle)} | ${SITE_NAME}`
  const metaDesc = lectureOgDescription(resolvedTitle, resolvedCourse)

  const [focusMode, setFocusMode] = useState(false)
  const [playerLayout, dispatchPlayerLayout] = useReducer(playerLayoutReducer, {
    stickyMini: false,
    resumeAtSeconds: 0,
  })
  const { stickyMini, resumeAtSeconds } = playerLayout

  const videoBlockRef = useRef<HTMLDivElement>(null)
  const mindmapBlockRef = useRef<HTMLElement>(null)
  const workspaceColumnsRef = useRef<HTMLDivElement>(null)
  const playedSecondsRef = useRef(0)
  const [knowledgeProcessing, setKnowledgeProcessing] = useState(false)

  const onPlaybackProgress = useCallback((seconds: number) => {
    playedSecondsRef.current = seconds
  }, [])

  const scrollToVideo = useCallback(() => {
    videoBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  useEffect(() => {
    const el = videoBlockRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        dispatchPlayerLayout({
          type: 'visibility',
          isIntersecting: entry.isIntersecting,
          playedSeconds: playedSecondsRef.current,
        })
      },
      {
        root: null,
        threshold: 0,
        rootMargin: '-56px 0px 0px 0px',
      },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    return () => {
      useWorkspaceStore.getState().setVideoCurrentTimeSeconds(0)
    }
  }, [])

  const miniPortal =
    typeof document !== 'undefined' &&
    createPortal(
      <AnimatePresence>
        {stickyMini && (
          <motion.div
            key="workspace-sticky-video"
            initial={{ opacity: 0, scale: 0.9, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="pointer-events-auto fixed bottom-4 right-4 z-[60] w-[min(100vw-2rem,20rem)]"
          >
            <WorkspaceVideoPanel
              variant="mini"
              videoUrl={DEMO_VIDEO_URL}
              lectureTitle={resolvedTitle}
              resumeAtSeconds={resumeAtSeconds}
              onPlaybackProgress={onPlaybackProgress}
            />
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )

  return (
    <>
      <PageMeta
        title="Workspace"
        description={metaDesc}
        path={metaPath}
        documentTitle={docTitle}
        ogTitle={lectureOgTitle(resolvedTitle)}
        ogDescription={metaDesc}
      />
      <WorkspaceJsonLd
        lectureId={resolvedId}
        lectureTitle={resolvedTitle}
        courseName={resolvedCourse}
        videoUrl={DEMO_VIDEO_URL}
        segments={DEFAULT_TIMELINE_SEGMENTS}
      />
      {miniPortal}
      <LearningProgressHud />

      <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 overflow-y-auto px-4 pb-4 pt-4 max-md:pb-2 lg:h-[calc(100vh-4rem)] lg:gap-4 lg:overflow-hidden lg:px-6 lg:pb-4">
        <motion.div
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2"
        >
          <button
            type="button"
            aria-pressed={knowledgeProcessing}
            onClick={() => setKnowledgeProcessing((v) => !v)}
            className={`ds-interactive inline-flex items-center gap-2 rounded-ds-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              knowledgeProcessing
                ? 'border-ds-primary bg-ds-primary/20 text-ds-text-primary'
                : 'border-ds-border text-ds-text-secondary hover:border-ds-primary/40 hover:text-ds-text-primary'
            }`}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Trích xuất (demo)
          </button>
          <button
            type="button"
            aria-pressed={focusMode}
            onClick={() => setFocusMode((v) => !v)}
            className={`ds-interactive inline-flex items-center gap-2 rounded-ds-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              focusMode
                ? 'border-ds-secondary bg-ds-secondary/15 text-ds-secondary'
                : 'border-ds-border text-ds-text-secondary hover:border-ds-secondary/40 hover:text-ds-text-primary'
            }`}
          >
            <Focus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Focus mode
          </button>
          {stickyMini && (
            <span className="text-[11px] font-normal text-ds-text-secondary max-sm:hidden">
              Mini-player: cuộn lên để xem trong cột
            </span>
          )}
          {knowledgeProcessing && (
            <span className="sr-only" role="status">
              Đang mô phỏng trích xuất tri thức từ video sang mindmap
            </span>
          )}
        </motion.div>

        <div
          ref={workspaceColumnsRef}
          className="relative flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:min-h-0"
        >
          <ProcessingVisualizer
            active={knowledgeProcessing}
            containerRef={workspaceColumnsRef}
            fromRef={videoBlockRef}
            toRef={mindmapBlockRef}
          />
          <motion.div
            ref={videoBlockRef}
            layout
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={`order-1 w-full min-w-0 shrink-0 lg:order-none lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] ${
              focusMode ? 'lg:w-[44%] lg:max-w-none' : 'lg:w-[30%]'
            }`}
          >
            <WorkspaceVideoPanel
              variant={stickyMini ? 'placeholder' : 'inline'}
              videoUrl={DEMO_VIDEO_URL}
              lectureTitle={resolvedTitle}
              resumeAtSeconds={resumeAtSeconds}
              onPlaybackProgress={onPlaybackProgress}
              onScrollToVideo={scrollToVideo}
              compact={focusMode}
            />
          </motion.div>

          <motion.section
            ref={mindmapBlockRef}
            layout
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={`order-2 min-h-[280px] min-w-0 flex-1 lg:order-none lg:min-h-0 lg:transition-[flex-grow] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] ${
              focusMode ? 'lg:flex-[1.35]' : ''
            }`}
            aria-labelledby="workspace-mindmap-title"
          >
            <MindmapPanel />
          </motion.section>

          <AnimatePresence initial={false}>
            {!focusMode && (
              <motion.section
                key="workspace-tutor"
                layout
                initial={{ opacity: 0, x: 28, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 36, filter: 'blur(6px)' }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="order-3 w-full min-w-0 shrink-0 lg:order-none lg:w-[26%]"
                aria-labelledby="workspace-tutor-title"
              >
                <TutorSidebar />
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}
