import { AnimatePresence, motion } from 'framer-motion'
import { Focus, Maximize2, Minimize2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import {
  KnowledgePackExportMenu,
  LearningProgressHud,
  MindmapErrorBoundary,
  MindmapPanel,
  ProcessingOverlay,
  ProcessingVisualizer,
  TutorSidebar,
  WorkspaceSkeleton,
  WorkspaceVideoPanel,
} from '../components/workspace'
import { PageMeta, WorkspaceJsonLd } from '../components/seo'
import { DEFAULT_TIMELINE_SEGMENTS, getLectureById } from '../data/lectures'
import { postAudioExtraction } from '../lib/api'
import { etherWorkspaceToasts } from '../lib/etherToast'
import { lectureOgDescription, lectureOgTitle } from '../lib/lectureSeo'
import { SITE_NAME } from '../lib/site'
import { useToastStore } from '../stores/useToastStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

const DEMO_VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

type FullscreenPanel = 'video' | 'mindmap' | 'tutor'

type PlayerLayoutState = { stickyMini: boolean; resumeAtSeconds: number }

function playerLayoutReducer(
  state: PlayerLayoutState,
  action: { type: 'visibility'; isIntersecting: boolean; playedSeconds: number },
): PlayerLayoutState {
  const nextSticky = !action.isIntersecting
  if (nextSticky === state.stickyMini) return state
  return { stickyMini: nextSticky, resumeAtSeconds: action.playedSeconds }
}

function PanelFullscreenControl({
  panel,
  fullscreenPanel,
  setFullscreen,
  className: controlClassName = '',
}: {
  panel: FullscreenPanel
  fullscreenPanel: FullscreenPanel | null
  setFullscreen: (p: FullscreenPanel | null) => void
  /** Ví dụ Mindmap: tránh đè toolbar zoom — `top-14`. */
  className?: string
}) {
  const isFs = fullscreenPanel === panel
  return (
    <button
      type="button"
      className={`ds-interactive-icon absolute right-2 top-2 z-[32] rounded-ds-sm border border-ds-border/80 bg-ds-bg/90 p-2 text-ds-text-secondary shadow-ds-soft backdrop-blur-sm hover:border-ds-primary/50 hover:text-ds-text-primary ${controlClassName}`}
      aria-label={isFs ? 'Thu nhỏ panel' : 'Toàn màn hình panel'}
      aria-pressed={isFs}
      title={isFs ? 'Thu nhỏ (Esc)' : 'Toàn màn hình'}
      onClick={(e) => {
        e.stopPropagation()
        setFullscreen(isFs ? null : panel)
      }}
    >
      {isFs ? (
        <Minimize2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      ) : (
        <Maximize2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      )}
    </button>
  )
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

  const [isLoading, setIsLoading] = useState(true)
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
  const [fullscreenPanel, setFullscreenPanel] = useState<FullscreenPanel | null>(null)
  const pushToast = useToastStore((s) => s.pushToast)
  const mindmapHighlights = useWorkspaceStore((s) => s.mindmapHighlights)

  const knowledgePackCtx = useMemo(
    () => ({
      lectureTitle: resolvedTitle,
      course: resolvedCourse,
      lectureId: resolvedId,
      highlights: mindmapHighlights,
    }),
    [mindmapHighlights, resolvedCourse, resolvedId, resolvedTitle],
  )

  const onPlaybackProgress = useCallback((seconds: number) => {
    playedSecondsRef.current = seconds
  }, [])

  const scrollToVideo = useCallback(() => {
    videoBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const runExtraction = useCallback(async () => {
    if (knowledgeProcessing) return
    setKnowledgeProcessing(true)
    etherWorkspaceToasts.aiAnalysisStart()
    try {
      await postAudioExtraction(DEMO_VIDEO_URL)
      pushToast('Trích xuất thành công.', 'success')
    } catch {
      /* lỗi: toast từ interceptor Axios */
    } finally {
      setKnowledgeProcessing(false)
    }
  }, [knowledgeProcessing, pushToast])

  useEffect(() => {
    const t = window.setTimeout(() => setIsLoading(false), 900)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    if (isLoading) return
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
  }, [isLoading])

  useEffect(() => {
    return () => {
      useWorkspaceStore.getState().setVideoCurrentTimeSeconds(0)
    }
  }, [])

  useEffect(() => {
    if (fullscreenPanel == null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreenPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [fullscreenPanel])

  const miniPortal =
    !isLoading &&
    fullscreenPanel !== 'video' &&
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
      {!isLoading && fullscreenPanel == null && <LearningProgressHud />}

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {fullscreenPanel != null && (
              <motion.button
                key="workspace-fs-backdrop"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="fixed inset-0 z-[115] cursor-default border-0 bg-ds-bg/72 backdrop-blur-[3px]"
                aria-label="Đóng toàn màn hình"
                onClick={() => setFullscreenPanel(null)}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}

      {isLoading ? (
        <div className="relative isolate">
          <WorkspaceSkeleton />
          <ProcessingOverlay active />
        </div>
      ) : (
      <div className="flex min-h-[calc(100vh-4rem)] min-w-0 flex-col gap-3 overflow-x-clip overflow-y-auto px-4 pb-4 pt-4 max-md:pb-2 lg:h-[calc(100vh-4rem)] lg:gap-4 lg:overflow-hidden lg:px-6 lg:pb-4">
        <AnimatePresence initial={false}>
          {fullscreenPanel == null && (
            <motion.div
              key="workspace-toolbar"
              initial={false}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 overflow-hidden"
            >
              <KnowledgePackExportMenu
                ctx={knowledgePackCtx}
                mindmapFilenameBase={resolvedTitle}
                onError={(msg) => pushToast(msg, 'error')}
                onSuccess={(msg) => pushToast(msg, 'default')}
              />
              <button
                type="button"
                aria-busy={knowledgeProcessing}
                aria-pressed={knowledgeProcessing}
                disabled={knowledgeProcessing}
                onClick={() => void runExtraction()}
                className={`ds-interactive inline-flex items-center gap-2 rounded-ds-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors disabled:pointer-events-none disabled:opacity-60 ${
                  knowledgeProcessing
                    ? 'border-ds-primary bg-ds-primary/20 text-ds-text-primary'
                    : 'border-ds-border text-ds-text-secondary hover:border-ds-primary/40 hover:text-ds-text-primary'
                }`}
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                {knowledgeProcessing ? 'Đang trích xuất…' : 'Trích xuất (demo)'}
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
          )}
        </AnimatePresence>

        <div
          ref={workspaceColumnsRef}
          className={`relative flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:min-h-0 ${
            fullscreenPanel != null ? 'min-h-[min(60vh,28rem)]' : ''
          }`}
        >
          <ProcessingVisualizer
            active={knowledgeProcessing && fullscreenPanel == null}
            containerRef={workspaceColumnsRef}
            fromRef={videoBlockRef}
            toRef={mindmapBlockRef}
          />
          <motion.div
            ref={videoBlockRef}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className={
              fullscreenPanel === 'video'
                ? 'pointer-events-auto fixed inset-0 z-[120] m-0 flex min-h-0 w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-ds-bg p-3 shadow-none sm:p-5 md:p-6'
                : fullscreenPanel === 'mindmap' || fullscreenPanel === 'tutor'
                  ? 'hidden'
                  : `relative order-1 w-full min-w-0 shrink-0 lg:order-none lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      focusMode ? 'lg:w-[44%] lg:max-w-none' : 'lg:w-[30%]'
                    }`
            }
          >
            <PanelFullscreenControl
              panel="video"
              fullscreenPanel={fullscreenPanel}
              setFullscreen={setFullscreenPanel}
            />
            <div
              className={
                fullscreenPanel === 'video' ? 'flex min-h-0 flex-1 flex-col' : 'contents'
              }
            >
              <WorkspaceVideoPanel
                variant={fullscreenPanel === 'video' ? 'inline' : stickyMini ? 'placeholder' : 'inline'}
                videoUrl={DEMO_VIDEO_URL}
                lectureTitle={resolvedTitle}
                resumeAtSeconds={resumeAtSeconds}
                onPlaybackProgress={onPlaybackProgress}
                onScrollToVideo={scrollToVideo}
                compact={focusMode && fullscreenPanel !== 'video'}
              />
            </div>
          </motion.div>

          <motion.section
            ref={mindmapBlockRef}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className={
              fullscreenPanel === 'mindmap'
                ? 'pointer-events-auto fixed inset-0 z-[120] m-0 flex min-h-0 w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-ds-bg p-3 shadow-none sm:p-5 md:p-6'
                : fullscreenPanel === 'video' || fullscreenPanel === 'tutor'
                  ? 'hidden'
                  : `relative order-2 min-h-[280px] min-w-0 flex-1 lg:order-none lg:min-h-0 lg:transition-[flex-grow] lg:duration-300 lg:ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      focusMode ? 'lg:flex-[1.35]' : ''
                    }`
            }
            aria-labelledby="workspace-mindmap-title"
          >
            <PanelFullscreenControl
              panel="mindmap"
              fullscreenPanel={fullscreenPanel}
              setFullscreen={setFullscreenPanel}
              className="top-14 sm:top-12"
            />
            <div className={fullscreenPanel === 'mindmap' ? 'flex min-h-0 flex-1 flex-col' : 'contents'}>
              <MindmapErrorBoundary>
                <MindmapPanel />
              </MindmapErrorBoundary>
            </div>
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
                className={
                  fullscreenPanel === 'tutor'
                    ? 'pointer-events-auto fixed inset-0 z-[120] m-0 flex min-h-0 w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-ds-bg p-3 shadow-none sm:p-5 md:p-6 lg:!w-full'
                    : fullscreenPanel === 'video' || fullscreenPanel === 'mindmap'
                      ? 'hidden'
                      : 'relative order-3 w-full min-w-0 shrink-0 lg:order-none lg:w-[26%]'
                }
                aria-labelledby="workspace-tutor-title"
              >
                <PanelFullscreenControl
                  panel="tutor"
                  fullscreenPanel={fullscreenPanel}
                  setFullscreen={setFullscreenPanel}
                />
                <div className={fullscreenPanel === 'tutor' ? 'flex min-h-0 flex-1 flex-col' : 'contents'}>
                  <TutorSidebar />
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
      )}
    </>
  )
}
