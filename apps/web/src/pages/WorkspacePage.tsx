import { AnimatePresence, motion } from 'framer-motion'
import { Focus, Maximize2, Minimize2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
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
import { mapLectureRowToPipeline } from '../lib/mapLectureRowToPipeline'
import { fetchLecturesRows, getSupabase } from '../lib/supabase'
import { etherWorkspaceToasts } from '../lib/etherToast'
import { lectureOgDescription, lectureOgTitle } from '../lib/lectureSeo'
import { SITE_NAME } from '../lib/site'
import { useAppStore } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

/** Chọn bài mới nhất có URL hoặc mindmap (danh sách đã order id desc). */
function pickBestLectureRow(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  for (const row of rows) {
    const url =
      typeof row.video_url === 'string'
        ? row.video_url.trim()
        : typeof row.source_url === 'string'
          ? row.source_url.trim()
          : ''
    const flow = row.flow_data
    let nodeCount = 0
    if (flow && typeof flow === 'object' && flow !== null && 'nodes' in flow) {
      const nodes = (flow as { nodes?: unknown }).nodes
      if (Array.isArray(nodes)) nodeCount = nodes.length
    }
    if (url.length > 0 || nodeCount > 0) return row
  }
  return null
}

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

  const pipelineSourceUrl = useWorkspaceStore((s) => s.pipelineSourceUrl)
  const pipelineVideoUrl = useWorkspaceStore((s) => s.pipelineVideoUrl)
  const pipelineLectureId = useWorkspaceStore((s) => s.pipelineLectureId)
  const pipelineLectureTitle = useWorkspaceStore((s) => s.pipelineLectureTitle)
  const pipelineReactFlow = useWorkspaceStore((s) => s.pipelineReactFlow)

  const hasPipelinePayload = useMemo(() => {
    const u = (pipelineSourceUrl ?? pipelineVideoUrl ?? '').trim()
    return u.length > 0 || (pipelineReactFlow?.nodes?.length ?? 0) > 0
  }, [pipelineSourceUrl, pipelineVideoUrl, pipelineReactFlow])

  const resolvedTitle = pipelineLectureTitle ?? lecture?.title ?? 'Bài giảng'
  const resolvedCourse = lecture?.course ?? ''
  const resolvedVideoUrl = (pipelineVideoUrl ?? pipelineSourceUrl ?? '').trim()
  const finalLectureId = pipelineLectureId ?? lecture?.id ?? lectureIdParam ?? ''

  const metaPath = useMemo(() => {
    const id = pipelineLectureId ?? lecture?.id
    if (id && hasPipelinePayload) return `/workspace?lecture=${encodeURIComponent(id)}`
    return '/workspace'
  }, [pipelineLectureId, lecture?.id, hasPipelinePayload])

  const docTitle = hasPipelinePayload
    ? `${lectureOgTitle(resolvedTitle)} | ${SITE_NAME}`
    : `Workspace | ${SITE_NAME}`
  const metaDesc = hasPipelinePayload
    ? lectureOgDescription(resolvedTitle, resolvedCourse || '—')
    : `Không gian học tập — ${SITE_NAME}.`

  const [hydrationReady, setHydrationReady] = useState(false)
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
  const setPipelineResult = useWorkspaceStore((s) => s.setPipelineResult)
  const authUser = useAuthStore((s) => s.user)
  const language = useAppStore((s) => s.language)
  const quizDifficulty = useAppStore((s) => s.quizDifficulty)

  const knowledgePackCtx = useMemo(
    () => ({
      lectureTitle: resolvedTitle,
      course: resolvedCourse,
      lectureId: finalLectureId,
      highlights: mindmapHighlights,
    }),
    [mindmapHighlights, resolvedCourse, finalLectureId, resolvedTitle],
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
      if (!pipelineSourceUrl) {
        pushToast('Chưa có URL pipeline. Vui lòng quay lại Dashboard và chạy pipeline.', 'error')
        return
      }
      const data = await postAudioExtraction(pipelineSourceUrl, authUser?.id ?? null, language, quizDifficulty)
      useWorkspaceStore.getState().setPipelineResult(data)
      pushToast('Trích xuất thành công.', 'success')
    } catch {
      /* lỗi: toast từ interceptor Axios */
    } finally {
      setKnowledgeProcessing(false)
    }
  }, [knowledgeProcessing, pushToast, pipelineSourceUrl, authUser?.id, language, quizDifficulty])

  useEffect(() => {
    let cancelled = false

    async function hydrate() {
      const store = useWorkspaceStore.getState()
      const hasStore =
        Boolean(store.pipelineSourceUrl?.trim() || store.pipelineVideoUrl?.trim()) ||
        (store.pipelineReactFlow?.nodes?.length ?? 0) > 0

      if (lectureIdParam && looksLikeUuid(lectureIdParam)) {
        const supabase = getSupabase()
        if (!supabase) {
          if (!cancelled) setHydrationReady(true)
          return
        }
        const { data } = await supabase.from('lectures').select('*').eq('id', lectureIdParam).maybeSingle()
        if (cancelled) return
        if (data) {
          setPipelineResult(mapLectureRowToPipeline(data as Record<string, unknown>))
        }
        if (!cancelled) setHydrationReady(true)
        return
      }

      if (lectureIdParam && getLectureById(lectureIdParam)) {
        if (!cancelled) setHydrationReady(true)
        return
      }

      if (hasStore) {
        if (!cancelled) setHydrationReady(true)
        return
      }

      const supabase = getSupabase()
      const user = useAuthStore.getState().user
      if (!supabase || !user?.id) {
        if (!cancelled) setHydrationReady(true)
        return
      }

      const { data, error } = await fetchLecturesRows(supabase, user.id)
      if (cancelled) return
      if (!error && data?.length) {
        const row = pickBestLectureRow(data as Record<string, unknown>[])
        if (row) {
          const mapped = mapLectureRowToPipeline(row)
          const hasUrl = Boolean(mapped.source_url?.trim())
          const hasNodes = (mapped.react_flow?.nodes?.length ?? 0) > 0
          if (hasUrl || hasNodes) {
            setPipelineResult(mapped)
          }
        }
      }
      if (!cancelled) setHydrationReady(true)
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [lectureIdParam, setPipelineResult, authUser?.id])

  useEffect(() => {
    if (!hydrationReady) return
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
  }, [hydrationReady])

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
    hydrationReady &&
    hasPipelinePayload &&
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
              videoUrl={resolvedVideoUrl}
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
        ogTitle={hasPipelinePayload ? lectureOgTitle(resolvedTitle) : 'Workspace'}
        ogDescription={metaDesc}
      />
      {hasPipelinePayload && resolvedVideoUrl ? (
        <WorkspaceJsonLd
          lectureId={finalLectureId || 'workspace'}
          lectureTitle={resolvedTitle}
          courseName={resolvedCourse || '—'}
          videoUrl={resolvedVideoUrl}
          segments={DEFAULT_TIMELINE_SEGMENTS}
        />
      ) : null}
      {miniPortal}
      {hydrationReady && hasPipelinePayload && fullscreenPanel == null && <LearningProgressHud />}

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

      {!hydrationReady ? (
        <div className="relative isolate">
          <WorkspaceSkeleton />
          <ProcessingOverlay active />
        </div>
      ) : !hasPipelinePayload ? (
        <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-5 px-4 py-16 text-center">
          <p className="max-w-md text-sm leading-relaxed text-ds-text-secondary">
            Chưa có dữ liệu pipeline. Khi bạn đã xử lý video hoặc có bài giảng đã lưu, nội dung sẽ hiển thị tại
            đây — ưu tiên bài gần nhất.
          </p>
          <Link
            to="/dashboard"
            className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm border border-ds-primary bg-ds-primary/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ds-text-primary shadow-ds-soft transition-colors hover:border-ds-primary/80 hover:bg-ds-primary/25"
          >
            Về Dashboard
          </Link>
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
              className="flex w-full shrink-0 flex-wrap items-center justify-between gap-2 overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-2">
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
                  {knowledgeProcessing ? 'Đang trích xuất…' : 'Trích xuất'}
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
                  Focus
                </button>
              </div>

              <KnowledgePackExportMenu
                ctx={knowledgePackCtx}
                mindmapFilenameBase={resolvedTitle}
                onError={(msg) => pushToast(msg, 'error')}
                onSuccess={(msg) => pushToast(msg, 'default')}
              />
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
                videoUrl={resolvedVideoUrl}
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
            <div className={fullscreenPanel === 'mindmap' ? 'flex min-h-0 flex-1 flex-col' : 'contents'}>
              <MindmapErrorBoundary>
                <MindmapPanel
                  isFullscreen={fullscreenPanel === 'mindmap'}
                  onToggleFullscreen={() =>
                    setFullscreenPanel(fullscreenPanel === 'mindmap' ? null : 'mindmap')
                  }
                />
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
