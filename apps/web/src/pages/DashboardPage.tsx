import { Filter, LayoutGrid, Plus, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LlmFriendlyGlossary, SemanticIntroBlocks, TechnologyStackLlm } from '../components/content'
import { MOCK_LECTURES } from '../data/lectures'
import { PageMeta } from '../components/seo'

/**
 * Library / Dashboard — search, filters, grid of processed lectures, prominent new analysis.
 */
export function DashboardPage() {
  const [query, setQuery] = useState('')
  const [pipelineBusy, setPipelineBusy] = useState(false)

  return (
    <div className="mx-auto max-w-ds space-y-10 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/dashboard"
        title="Library"
        description="AI Video-to-Knowledge Roadmap: chuyển video bài giảng thành mindmap với Whisper Large-v3 và Gemini 1.5 Flash; thư viện bài giảng, pipeline phân tích và workspace deep time-linking."
      />
      <SemanticIntroBlocks />
      <div className="grid gap-6 lg:grid-cols-2">
        <TechnologyStackLlm />
        <LlmFriendlyGlossary />
      </div>
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
            <h3 className="mt-2 text-lg font-bold leading-snug text-ds-text-primary sm:text-xl">
              Paste a lecture URL or upload
            </h3>
            <p className="ds-text-body-secondary mt-2">
              Calls FastAPI + yt-dlp → Whisper → Gemini → Supabase (wire with `api.post` when ready).
            </p>
          </div>
          <Link
            to="/workspace"
            className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm bg-ds-primary px-6 py-3 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95"
          >
            <Plus className="h-5 w-5" strokeWidth={1.5} />
            Open workspace
          </Link>
        </div>
        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ds-secondary" strokeWidth={1.5} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 py-4 pl-12 pr-4 text-ds-base text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
          <button
            type="button"
            disabled={pipelineBusy}
            onClick={() => {
              setPipelineBusy(true)
              window.setTimeout(() => setPipelineBusy(false), 1800)
            }}
            className="ds-interactive rounded-ds-sm border border-ds-secondary/50 bg-ds-secondary/10 px-8 py-4 text-sm font-bold text-ds-secondary hover:bg-ds-secondary/20"
          >
            {pipelineBusy ? 'Đang xử lý…' : 'Start pipeline'}
          </button>
        </div>
      </section>

      <section
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Search and filter library"
      >
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ds-text-secondary" strokeWidth={1.5} />
          <input
            placeholder="Search library…"
            className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/60 py-2 pl-10 pr-4 text-base text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40 md:text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ds-interactive flex items-center gap-2 rounded-ds-sm border border-ds-border px-4 py-2 text-[14px] font-bold uppercase tracking-wider text-ds-text-secondary hover:bg-ds-border/30 md:text-xs"
          >
            <Filter className="h-4 w-4" strokeWidth={1.5} />
            Filters
          </button>
          <button
            type="button"
            className="ds-interactive flex items-center gap-2 rounded-ds-sm border border-ds-border px-4 py-2 text-[14px] font-bold uppercase tracking-wider text-ds-text-secondary hover:bg-ds-border/30 md:text-xs"
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={1.5} />
            Grid
          </button>
        </div>
      </section>

      <section aria-labelledby="lecture-library-heading">
        <h2
          id="lecture-library-heading"
          className="mb-4 text-xl font-bold leading-snug text-ds-text-primary sm:text-2xl"
        >
          Danh sách bài giảng trong thư viện
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MOCK_LECTURES.filter((l) => l.title.toLowerCase().includes(query.toLowerCase())).map((lec) => (
            <Link
              key={lec.id}
              to={`/workspace?lecture=${encodeURIComponent(lec.id)}`}
              className="ds-interactive-card ds-surface-glass group block min-h-0 rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px] hover:border-ds-primary/40"
            >
              <article>
                <div className="mb-4 flex gap-3">
                  <h3 className="min-w-0 flex-1 text-lg font-bold leading-snug text-ds-text-primary line-clamp-2">
                    {lec.title}
                  </h3>
                  <span className="shrink-0 self-start rounded-ds-sm bg-ds-primary/20 px-2 py-1 text-[14px] font-bold tabular-nums text-ds-secondary md:text-xs">
                    {lec.duration}
                  </span>
                </div>
                <p className="truncate text-base font-normal text-ds-text-secondary md:text-sm">{lec.course}</p>
                <div className="mt-6 h-2 w-full overflow-hidden rounded-ds-sm bg-ds-border/40">
                  <div
                    className="h-full rounded-ds-sm bg-ds-primary transition-all"
                    style={{ width: `${lec.progress}%` }}
                  />
                </div>
                <p className="mt-2 text-[14px] font-bold text-ds-text-secondary md:text-xs">{lec.progress}% mapped</p>
                <span className="mt-6 inline-flex text-base font-bold text-ds-secondary group-hover:underline md:text-sm">
                  Open in workspace →
                </span>
              </article>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
