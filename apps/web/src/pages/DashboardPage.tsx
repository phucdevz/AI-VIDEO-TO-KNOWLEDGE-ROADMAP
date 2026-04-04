import { Filter, LayoutGrid, Library, List, Loader2, Plus, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DashboardIntroTabs } from '../components/content'
import { PageMeta } from '../components/seo'
import { MOCK_LECTURES } from '../data/lectures'
import { postAudioExtraction } from '../lib/api'
import { isSupabaseConfigured } from '../lib/supabase'
import { useAppStore, type LibraryLectureRow } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'
import { useWorkspaceStore } from '../stores/useWorkspaceStore'

function LectureCardSkeleton() {
  return (
    <div
      className="ds-surface-glass rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px]"
      aria-hidden
    >
      <div className="animate-pulse space-y-4">
        <div className="flex gap-3">
          <div className="h-12 min-w-0 flex-1 rounded-ds-sm bg-ds-border/35" />
          <div className="h-8 w-16 shrink-0 rounded-ds-sm bg-ds-border/35" />
        </div>
        <div className="h-4 w-1/2 rounded bg-ds-border/30" />
        <div className="h-2 w-full rounded-ds-sm bg-ds-border/25" />
        <div className="h-3 w-24 rounded bg-ds-border/25" />
      </div>
    </div>
  )
}

function LectureRowSkeleton() {
  return (
    <div
      className="ds-surface-glass flex animate-pulse items-center gap-4 rounded-ds-lg border border-ds-border p-4 shadow-ds-soft backdrop-blur-[10px]"
      aria-hidden
    >
      <div className="h-10 min-w-0 flex-1 rounded-ds-sm bg-ds-border/35" />
      <div className="h-8 w-20 shrink-0 rounded-ds-sm bg-ds-border/30" />
      <div className="h-2 w-24 shrink-0 rounded-ds-sm bg-ds-border/25" />
    </div>
  )
}

function formatDuration(seconds: unknown): string {
  const s = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 0
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

function lectureProgress(row: LibraryLectureRow): number {
  const flow = row.flow_data
  if (!flow || typeof flow !== 'object' || !('nodes' in flow)) return 0
  const nodes = (flow as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) return 0
  return Math.min(100, nodes.length * 10)
}

type GridItem =
  | { kind: 'db'; row: LibraryLectureRow }
  | { kind: 'mock'; id: string; title: string; course: string; duration: string; progress: number }

const LS_VIEW = 'etherai:dashboard-library-view'
const LS_FILTER = 'etherai:dashboard-library-filter'

/** Lọc bài giảng (Supabase có status; mock chỉ lọc theo progress). */
type LibraryStatusFilter = 'all' | 'processing' | 'with_mindmap'

function loadStoredView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(LS_VIEW) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

function loadStoredFilter(): LibraryStatusFilter {
  try {
    const v = localStorage.getItem(LS_FILTER)
    if (v === 'processing' || v === 'with_mindmap') return v
    return 'all'
  } catch {
    return 'all'
  }
}

/**
 * Library / Dashboard — search, filters, grid of processed lectures, prominent new analysis.
 */
export function DashboardPage() {
  const [pipelineUrlDraft, setPipelineUrlDraft] = useState('')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [pipelineBusy, setPipelineBusy] = useState(false)
  const [gridLoading, setGridLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(loadStoredView)
  const [statusFilter, setStatusFilter] = useState<LibraryStatusFilter>(loadStoredFilter)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const navigate = useNavigate()
  const pushToast = useToastStore((s) => s.pushToast)
  const setPipelineResult = useWorkspaceStore((s) => s.setPipelineResult)
  const user = useAuthStore((s) => s.user)
  const language = useAppStore((s) => s.language)
  const quizDifficulty = useAppStore((s) => s.quizDifficulty)

  const libraryLectures = useAppStore((s) => s.libraryLectures)
  const fetchLibraryLectures = useAppStore((s) => s.fetchLibraryLectures)
  const bindLibraryRealtime = useAppStore((s) => s.bindLibraryRealtime)
  const unbindLibraryRealtime = useAppStore((s) => s.unbindLibraryRealtime)

  useEffect(() => {
    const boot = async () => {
      setGridLoading(true)
      if (isSupabaseConfigured() && user?.id) {
        await fetchLibraryLectures()
        bindLibraryRealtime()
      } else {
        await new Promise((r) => setTimeout(r, 400))
      }
      setGridLoading(false)
    }
    void boot()
    return () => unbindLibraryRealtime()
  }, [user?.id, fetchLibraryLectures, bindLibraryRealtime, unbindLibraryRealtime])

  useEffect(() => {
    try {
      localStorage.setItem(LS_VIEW, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  useEffect(() => {
    try {
      localStorage.setItem(LS_FILTER, statusFilter)
    } catch {
      /* ignore */
    }
  }, [statusFilter])

  const gridItems: GridItem[] = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase()
    if (isSupabaseConfigured() && user?.id) {
      let rows = libraryLectures.filter((row) => {
        if (!q) return true
        const title = (row.title ?? '').toLowerCase()
        const url = ((row as { video_url?: string }).video_url ?? row.source_url ?? '').toLowerCase()
        const id = row.id.toLowerCase()
        return title.includes(q) || url.includes(q) || id.includes(q)
      })
      if (statusFilter === 'processing') {
        rows = rows.filter((row) => row.status === 'processing')
      } else if (statusFilter === 'with_mindmap') {
        rows = rows.filter((row) => lectureProgress(row) > 0)
      }
      return rows.map((row) => ({ kind: 'db' as const, row }))
    }
    let mocks = !q
      ? MOCK_LECTURES
      : MOCK_LECTURES.filter(
          (l) =>
            l.title.toLowerCase().includes(q) ||
            l.course.toLowerCase().includes(q) ||
            l.id.includes(q),
        )
    if (statusFilter === 'processing') {
      mocks = []
    } else if (statusFilter === 'with_mindmap') {
      mocks = mocks.filter((l) => l.progress > 0)
    }
    return mocks.map((l) => ({
      kind: 'mock' as const,
      id: l.id,
      title: l.title,
      course: l.course,
      duration: l.duration,
      progress: l.progress,
    }))
  }, [libraryLectures, libraryQuery, user?.id, statusFilter])

  const libraryLayoutClass =
    viewMode === 'grid'
      ? 'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      : 'flex flex-col gap-3'

  const cardBase =
    'ds-interactive-card ds-surface-glass group min-h-0 min-w-0 rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px] hover:border-ds-primary/40'

  return (
    <div className="mx-auto max-w-ds space-y-6 px-4 py-5 sm:px-6 md:px-8 md:py-6">
      <PageMeta
        path="/dashboard"
        title="Library"
        description="EtherAI Library: thư viện bài giảng, pipeline phân tích và workspace deep time-linking."
      />
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ds-text-primary sm:text-3xl">EtherAI Library</h1>
        <p className="max-w-2xl text-sm text-ds-text-secondary sm:text-base">
          Phân tích video bài giảng → mindmap, quiz và workspace có deep time-linking.
        </p>
      </header>

      <details className="ds-surface-glass group rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px] open:shadow-ds-soft">
        <summary className="ds-interactive cursor-pointer list-none px-4 py-3 text-left text-sm font-bold text-ds-text-primary outline-none marker:content-none sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="mr-2 inline-block text-ds-secondary transition-transform group-open:rotate-90">▸</span>
          Giới thiệu EtherAI (tổng quan · quy trình · thuật ngữ)
        </summary>
        <div className="border-t border-ds-border/40 px-4 pb-5 pt-4 sm:px-5 sm:pt-5">
          <DashboardIntroTabs noCard />
        </div>
      </details>

      <section aria-labelledby="dashboard-new-analysis-heading" className="ds-surface-glass overflow-hidden rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px] sm:p-8">
        <h2
          id="dashboard-new-analysis-heading"
          className="text-xl font-bold leading-snug text-ds-text-primary sm:text-2xl"
        >
          Phân tích video mới
        </h2>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="ds-text-label text-ds-secondary">New analysis</p>
            <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-snug text-ds-text-primary sm:text-xl">
              Paste a lecture URL or upload
            </h3>
            <p className="ds-text-body-secondary mt-2 line-clamp-3">
              Dán URL bài giảng và để hệ thống tự phân tích, tạo mindmap.
            </p>
          </div>
          <Link
            to="/workspace"
            className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm bg-ds-primary px-6 py-3 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95"
          >
            <Plus className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            Open workspace
          </Link>
        </div>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ds-secondary" strokeWidth={1.5} aria-hidden />
            <input
              value={pipelineUrlDraft}
              onChange={(e) => setPipelineUrlDraft(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 py-4 pl-12 pr-4 text-ds-base text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
              aria-label="URL bài giảng cho pipeline"
            />
          </div>
          <button
            type="button"
            disabled={pipelineBusy}
            onClick={async () => {
              const url = pipelineUrlDraft.trim()
              if (!url) {
                pushToast('Nhập URL bài giảng trước khi chạy pipeline.', 'error')
                return
              }
              if (pipelineBusy) return
              setPipelineBusy(true)
              try {
                const data = await postAudioExtraction(url, user?.id ?? null, language, quizDifficulty)
                setPipelineResult(data)
                pushToast('Đã chạy pipeline — mở Workspace để xem mindmap.', 'success')
                if (user?.id) void fetchLibraryLectures()
                navigate('/workspace')
              } catch {
                pushToast('Pipeline thất bại. Kiểm tra backend log / keys API.', 'error')
              } finally {
                setPipelineBusy(false)
              }
            }}
            className="ds-interactive shrink-0 rounded-ds-sm border border-ds-secondary/50 bg-ds-secondary/10 px-8 py-4 text-sm font-bold text-ds-secondary hover:bg-ds-secondary/20"
          >
            {pipelineBusy ? 'Đang xử lý…' : 'Start pipeline'}
          </button>
        </div>
      </section>

      <section className="space-y-3" aria-label="Search and filter library">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ds-text-secondary" strokeWidth={1.5} aria-hidden />
            <input
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              placeholder="Search library…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/60 py-2 pl-10 pr-4 text-base text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40 md:text-sm"
              aria-label="Tìm trong thư viện bài giảng"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="dashboard-library-filters"
              aria-pressed={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              className={`ds-interactive flex items-center gap-2 rounded-ds-sm border px-4 py-2 text-[14px] font-bold uppercase tracking-wider md:text-xs ${
                filtersOpen || statusFilter !== 'all'
                  ? 'border-ds-primary/50 bg-ds-primary/10 text-ds-secondary'
                  : 'border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
              }`}
            >
              <Filter className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Filters
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'grid'}
              title="Lưới thẻ"
              onClick={() => setViewMode('grid')}
              className={`ds-interactive flex items-center gap-2 rounded-ds-sm border px-4 py-2 text-[14px] font-bold uppercase tracking-wider md:text-xs ${
                viewMode === 'grid'
                  ? 'border-ds-primary/50 bg-ds-primary/10 text-ds-secondary'
                  : 'border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
              }`}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Grid
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              title="Danh sách (một cột)"
              onClick={() => setViewMode('list')}
              className={`ds-interactive flex items-center gap-2 rounded-ds-sm border px-4 py-2 text-[14px] font-bold uppercase tracking-wider md:text-xs ${
                viewMode === 'list'
                  ? 'border-ds-primary/50 bg-ds-primary/10 text-ds-secondary'
                  : 'border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
              }`}
            >
              <List className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              List
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div
            id="dashboard-library-filters"
            className="ds-surface-glass rounded-ds-lg border border-ds-border p-4 shadow-ds-soft backdrop-blur-[10px]"
            role="region"
            aria-label="Bộ lọc thư viện"
          >
            <p className="ds-text-label mb-3 text-ds-secondary">Trạng thái bài giảng</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
              {(
                [
                  ['all', 'Tất cả'] as const,
                  ['processing', 'Đang xử lý'] as const,
                  ['with_mindmap', 'Đã có mindmap'] as const,
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`ds-interactive flex cursor-pointer items-center gap-2 rounded-ds-sm border px-3 py-2 text-sm ${
                    statusFilter === value
                      ? 'border-ds-primary/45 bg-ds-primary/10 text-ds-text-primary'
                      : 'border-ds-border/80 text-ds-text-secondary hover:bg-ds-border/20'
                  }`}
                >
                  <input
                    type="radio"
                    name="library-status-filter"
                    className="accent-ds-primary"
                    checked={statusFilter === value}
                    onChange={() => setStatusFilter(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {!(isSupabaseConfigured() && user?.id) && statusFilter === 'processing' && (
              <p className="mt-3 text-xs text-ds-text-secondary">
                Đăng nhập và bật Supabase để xem bài đang xử lý; dữ liệu demo không có trạng thái này.
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="lecture-library-heading" aria-busy={gridLoading}>
        <h2
          id="lecture-library-heading"
          className="mb-4 text-xl font-bold leading-snug text-ds-text-primary sm:text-2xl"
        >
          Danh sách bài giảng trong thư viện
        </h2>
        {isSupabaseConfigured() && user?.id && (
          <p className="mb-4 text-sm text-ds-text-secondary">
            Thư viện sẽ tự cập nhật khi pipeline đang chạy.
          </p>
        )}
        {gridLoading ? (
          <div className={libraryLayoutClass}>
            {Array.from({ length: viewMode === 'list' ? 5 : 8 }).map((_, i) =>
              viewMode === 'list' ? (
                <LectureRowSkeleton key={`sk-${i}`} />
              ) : (
                <LectureCardSkeleton key={`sk-${i}`} />
              ),
            )}
          </div>
        ) : gridItems.length === 0 ? (
          <div className="ds-surface-glass flex flex-col items-center justify-center gap-4 rounded-ds-lg border border-ds-border border-dashed px-8 py-16 text-center shadow-ds-soft backdrop-blur-[10px]">
            <Library className="h-12 w-12 text-ds-secondary" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="text-base font-bold text-ds-text-primary">Chưa có bài giảng khớp bộ lọc</p>
              <p className="mt-2 max-w-md text-sm text-ds-text-secondary">
                Thử từ khóa khác hoặc chạy pipeline mới. Khi Supabase bật, thư viện lấy dữ liệu từ bảng `lectures`.
              </p>
            </div>
          </div>
        ) : (
          <div className={libraryLayoutClass}>
            {gridItems.map((item) => {
              if (item.kind === 'mock') {
                return (
                  <Link
                    key={item.id}
                    to={`/workspace?lecture=${encodeURIComponent(item.id)}`}
                    className={`${cardBase} ${viewMode === 'list' ? 'flex flex-row items-center gap-4 p-4' : 'block p-6'}`}
                  >
                    {viewMode === 'list' ? (
                      <article className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-base font-bold leading-snug text-ds-text-primary line-clamp-2 sm:text-lg">
                            {item.title}
                          </h3>
                          <p className="mt-1 line-clamp-1 text-sm text-ds-text-secondary">{item.course}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                          <span className="rounded-ds-sm bg-ds-primary/20 px-2 py-1 text-xs font-bold tabular-nums text-ds-secondary">
                            {item.duration}
                          </span>
                          <div className="h-2 w-24 overflow-hidden rounded-ds-sm bg-ds-border/40 sm:w-28">
                            <div
                              className="h-full rounded-ds-sm bg-ds-primary transition-all"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="text-sm font-bold text-ds-secondary group-hover:underline">Open →</span>
                        </div>
                      </article>
                    ) : (
                      <article>
                        <div className="mb-4 flex gap-3">
                          <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug text-ds-text-primary line-clamp-2">
                            {item.title}
                          </h3>
                          <span className="shrink-0 self-start rounded-ds-sm bg-ds-primary/20 px-2 py-1 text-[14px] font-bold tabular-nums text-ds-secondary md:text-xs">
                            {item.duration}
                          </span>
                        </div>
                        <p className="line-clamp-1 text-base font-normal text-ds-text-secondary md:text-sm">{item.course}</p>
                        <div className="mt-6 h-2 w-full overflow-hidden rounded-ds-sm bg-ds-border/40">
                          <div
                            className="h-full rounded-ds-sm bg-ds-primary transition-all"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[14px] font-bold text-ds-text-secondary md:text-xs">{item.progress}% mapped</p>
                        <span className="mt-6 inline-flex text-base font-bold text-ds-secondary group-hover:underline md:text-sm">
                          Open in workspace →
                        </span>
                      </article>
                    )}
                  </Link>
                )
              }

              const row = item.row
              const t = row.transcript as { duration?: number } | undefined
              const processing = row.status === 'processing'
              const title = row.title?.trim() || 'Untitled lecture'
              const dur = formatDuration(t?.duration)
              const progress = lectureProgress(row)

              const urlShort = (row.source_url ?? '').replace(/^https?:\/\//, '').slice(0, 48)
              const urlEllipsis = (row.source_url ?? '').length > 48 ? '…' : ''

              return (
                <Link
                  key={row.id}
                  to={`/workspace?lecture=${encodeURIComponent(row.id)}`}
                  className={`${cardBase} ${viewMode === 'list' ? 'flex flex-row items-center gap-4 p-4' : 'block p-6'}`}
                >
                  {viewMode === 'list' ? (
                    <article className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold leading-snug text-ds-text-primary line-clamp-2 sm:text-lg">
                          {title}
                          {processing && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-ds-sm bg-ds-secondary/15 px-2 py-0.5 text-xs font-bold text-ds-secondary">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
                              Processing
                            </span>
                          )}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-sm text-ds-text-secondary">
                          {urlShort}
                          {urlEllipsis}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sm:shrink-0 sm:gap-4">
                        <span className="rounded-ds-sm bg-ds-primary/20 px-2 py-1 text-xs font-bold tabular-nums text-ds-secondary">
                          {dur}
                        </span>
                        <div className="h-2 w-24 overflow-hidden rounded-ds-sm bg-ds-border/40 sm:w-28">
                          <div
                            className={`h-full rounded-ds-sm transition-all ${processing ? 'animate-pulse bg-ds-secondary/50' : 'bg-ds-primary'}`}
                            style={{ width: processing ? '35%' : `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-ds-secondary group-hover:underline">Open →</span>
                      </div>
                    </article>
                  ) : (
                    <article>
                      <div className="mb-4 flex gap-3">
                        <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug text-ds-text-primary line-clamp-2">
                          {title}
                          {processing && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-ds-sm bg-ds-secondary/15 px-2 py-0.5 text-xs font-bold text-ds-secondary">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
                              Processing
                            </span>
                          )}
                        </h3>
                        <span className="shrink-0 self-start rounded-ds-sm bg-ds-primary/20 px-2 py-1 text-[14px] font-bold tabular-nums text-ds-secondary md:text-xs">
                          {dur}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-base font-normal text-ds-text-secondary md:text-sm">
                        {urlShort}
                        {urlEllipsis}
                      </p>
                      <div className="mt-6 h-2 w-full overflow-hidden rounded-ds-sm bg-ds-border/40">
                        <div
                          className={`h-full rounded-ds-sm transition-all ${processing ? 'animate-pulse bg-ds-secondary/50' : 'bg-ds-primary'}`}
                          style={{ width: processing ? '35%' : `${progress}%` }}
                        />
                      </div>
                      <p className="mt-2 text-[14px] font-bold text-ds-text-secondary md:text-xs">
                        {processing ? 'Pipeline đang chạy…' : `${progress}% mapped`}
                      </p>
                      <span className="mt-6 inline-flex text-base font-bold text-ds-secondary group-hover:underline md:text-sm">
                        Open in workspace →
                      </span>
                    </article>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
