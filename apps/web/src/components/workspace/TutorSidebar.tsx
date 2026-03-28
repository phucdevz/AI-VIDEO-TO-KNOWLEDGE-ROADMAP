import { Send, Sparkles } from 'lucide-react'
import { useState } from 'react'

/**
 * AI summary + tutor chat (placeholder messages; wire to RAG later).
 */
export function TutorSidebar() {
  const [draft, setDraft] = useState('')

  return (
    <div className="flex h-full min-h-0 flex-col rounded-ds-lg border border-ds-border bg-ds-bg/40 shadow-ds-soft backdrop-blur-[10px]">
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
      <div className="flex flex-1 flex-col p-4">
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
    </div>
  )
}
