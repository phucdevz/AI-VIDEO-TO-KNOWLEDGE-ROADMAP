import { Bookmark, Play, Send, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useToastStore } from '../../stores/useToastStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'

type TutorTab = 'summary' | 'highlights'

function formatClipRange(start: number, end: number) {
  const fmt = (total: number) => {
    if (!Number.isFinite(total) || total < 0) return '--:--'
    const m = Math.floor(total / 60)
    const s = Math.floor(total % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${fmt(start)} → ${fmt(end)}`
}

/**
 * AI summary + tutor chat (placeholder) + Highlights (AI Bookmark clips).
 */
export function TutorSidebar() {
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<TutorTab>('summary')
  const mindmapHighlights = useWorkspaceStore((s) => s.mindmapHighlights)
  const removeMindmapHighlight = useWorkspaceStore((s) => s.removeMindmapHighlight)
  const startClipLoop = useWorkspaceStore((s) => s.startClipLoop)
  const stopClipLoop = useWorkspaceStore((s) => s.stopClipLoop)
  const clipLoop = useWorkspaceStore((s) => s.clipLoop)
  const pushToast = useToastStore((s) => s.pushToast)

  const onPlayClip = (startSeconds: number, endSeconds: number) => {
    const r = startClipLoop(startSeconds, endSeconds)
    if (!r.ok) {
      pushToast(r.message, 'error')
      return
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 shadow-ds-soft backdrop-blur-[10px]">
      <div
        className="flex shrink-0 border-b border-ds-border p-2"
        role="tablist"
        aria-label="Thanh tutor"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'summary'}
          className={`ds-interactive flex flex-1 items-center justify-center gap-2 rounded-ds-sm py-2.5 text-xs font-bold uppercase tracking-wider ${
            tab === 'summary'
              ? 'bg-ds-primary/25 text-ds-text-primary'
              : 'text-ds-text-secondary hover:bg-ds-border/25'
          }`}
          onClick={() => setTab('summary')}
        >
          <Sparkles className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          Summary
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'highlights'}
          className={`ds-interactive flex flex-1 items-center justify-center gap-2 rounded-ds-sm py-2.5 text-xs font-bold uppercase tracking-wider ${
            tab === 'highlights'
              ? 'bg-ds-primary/25 text-ds-text-primary'
              : 'text-ds-text-secondary hover:bg-ds-border/25'
          }`}
          onClick={() => setTab('highlights')}
        >
          <Bookmark className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          Highlights
        </button>
      </div>

      {tab === 'summary' ? (
        <>
          <div className="border-b border-ds-border p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-ds-secondary" strokeWidth={1.5} />
              <h2 id="workspace-tutor-title" className="text-sm font-bold text-ds-text-primary">
                Auto-summary
              </h2>
            </div>
            <p className="mt-4 text-sm font-normal leading-relaxed text-ds-text-secondary">
              Placeholder: Gemini will inject section summaries and key claims from the transcript. Export
              to Supabase when the pipeline is connected.
            </p>
            <button
              type="button"
              className="ds-interactive mt-4 w-full rounded-ds-sm border border-ds-border py-2 text-xs font-bold uppercase tracking-wider text-ds-secondary hover:bg-ds-border/30"
            >
              Export summary
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <h3 className="ds-text-label text-ds-text-secondary">AI tutor</h3>
            <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-ds-sm bg-ds-bg/60 p-4">
              <div className="rounded-ds-sm bg-ds-border/20 p-3 text-sm text-ds-text-primary">
                Ask anything grounded in this lecture — RAG on the transcript will answer here.
              </div>
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setDraft('')
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask your tutor…"
                className="ds-transition flex-1 rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
              />
              <button
                type="submit"
                className="ds-interactive flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-sm bg-ds-primary text-ds-text-primary hover:opacity-90"
                aria-label="Send"
              >
                <Send className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </form>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ds-text-primary">Highlights</h2>
              <p className="mt-1 text-xs leading-relaxed text-ds-text-secondary">
                Chuột phải vào nút trên Neural map, chọn Lưu vào mục ưa thích.
              </p>
            </div>
          </div>
          {clipLoop ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-ds-sm border border-ds-primary/40 bg-ds-primary/10 px-3 py-2">
              <p className="min-w-0 text-[11px] text-ds-text-secondary">
                Đang lặp:{' '}
                <span className="font-mono text-ds-text-primary">
                  {formatClipRange(clipLoop.start, clipLoop.end)}
                </span>
              </p>
              <button
                type="button"
                className="ds-interactive shrink-0 rounded-ds-sm border border-ds-border bg-ds-bg/60 px-2 py-1 text-[11px] font-bold text-ds-text-primary hover:bg-ds-border/30"
                onClick={() => stopClipLoop()}
              >
                Dừng lặp
              </button>
            </div>
          ) : null}
          <div className="mt-4 flex-1 overflow-y-auto">
            {mindmapHighlights.length === 0 ? (
              <p className="rounded-ds-sm bg-ds-border/15 p-4 text-sm text-ds-text-secondary">
                Chưa có clip nào. Lưu từ mindmap để ôn nhanh từng khối kiến thức.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mindmapHighlights.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-ds-sm border border-ds-border/60 bg-ds-bg/50 p-3 shadow-ds-soft"
                  >
                    <p className="text-sm font-semibold text-ds-text-primary line-clamp-2">{h.nodeLabel}</p>
                    <p className="mt-1 font-mono text-xs tabular-nums text-ds-secondary">
                      {formatClipRange(h.startSeconds, h.endSeconds)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="ds-interactive inline-flex items-center gap-1.5 rounded-ds-sm bg-ds-primary px-3 py-1.5 text-xs font-bold text-ds-text-primary hover:opacity-95"
                        onClick={() => onPlayClip(h.startSeconds, h.endSeconds)}
                      >
                        <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        Phát clip
                      </button>
                      <button
                        type="button"
                        className="ds-interactive inline-flex items-center gap-1.5 rounded-ds-sm border border-ds-border px-3 py-1.5 text-xs font-bold text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary"
                        onClick={() => removeMindmapHighlight(h.id)}
                        aria-label={`Xóa ${h.nodeLabel}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                        Xóa
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
