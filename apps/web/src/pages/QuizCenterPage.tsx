import { CheckCircle2, Lightbulb, Sparkles, Trophy } from 'lucide-react'
import { PageMeta } from '../components/seo'

/**
 * Gamified quizzes + Instructor’s predicted questions (vault).
 */
export function QuizCenterPage() {
  return (
    <div className="mx-auto max-w-ds space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/quiz"
        title="Quiz Center"
        description="Practice AI-generated multiple-choice questions, track your streak, and review instructor-style predicted exam prompts in EtherAI."
      />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="ds-text-label text-ds-secondary">Assessment</p>
          <h2 className="text-2xl font-bold text-ds-text-primary">Quiz center</h2>
          <p className="mt-2 text-base text-ds-text-secondary md:text-sm">
            AI-generated MCQs + predicted exam prompts
          </p>
        </div>
        <aside className="ds-surface-glass flex items-center gap-4 rounded-ds-lg border border-ds-border px-6 py-4 shadow-ds-soft backdrop-blur-[10px]">
          <Trophy className="h-8 w-8 text-ds-secondary" strokeWidth={1.5} />
          <div>
            <p className="text-[14px] font-bold uppercase text-ds-text-secondary md:text-xs">Streak</p>
            <p className="text-xl font-bold text-ds-text-primary">12 days</p>
          </div>
        </aside>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="ds-surface-glass space-y-6 rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-bold uppercase tracking-wider text-ds-primary">Module 4</span>
            <span className="text-xs font-bold text-ds-text-secondary">Question 3 / 12</span>
          </div>
          <h3 className="line-clamp-3 text-xl font-bold text-ds-text-primary">
            How does self-attention mix token representations?
          </h3>
          <ul className="space-y-3">
            {['Static softmax over vocabulary only', 'Pairwise relevance weights (Q·K) then V', 'FIFO over the batch', 'Dropout on labels only'].map(
              (opt, i) => (
                <li key={opt}>
                  <button
                    type="button"
                    className={`ds-interactive w-full rounded-ds-sm border px-4 py-4 text-left text-sm ${
                      i === 1
                        ? 'border-ds-primary bg-ds-primary/20 font-bold text-ds-text-primary hover:brightness-110'
                        : 'border-ds-border bg-ds-bg/40 font-normal text-ds-text-secondary hover:border-ds-primary/40'
                    }`}
                  >
                    <span className="mr-3 font-mono text-ds-secondary">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                </li>
              ),
            )}
          </ul>
          <div className="flex justify-between gap-4">
            <button
              type="button"
              className="ds-interactive rounded-ds-sm border border-ds-border px-6 py-3 text-sm font-bold text-ds-text-secondary hover:bg-ds-border/30"
            >
              Previous
            </button>
            <button
              type="button"
              className="ds-interactive rounded-ds-sm bg-ds-primary px-8 py-3 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95"
            >
              Next
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="ds-surface-glass rounded-ds-lg border border-ds-secondary/30 p-6 shadow-ds-soft backdrop-blur-[10px]">
            <div className="mb-4 flex items-center gap-2">
              <Lightbulb className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
              <h3 className="text-lg font-bold text-ds-text-primary">Instructor&apos;s vault</h3>
            </div>
            <p className="ds-text-label text-ds-secondary">Predicted exam</p>
            <p className="mt-2 text-sm font-normal italic text-ds-text-primary">
              &quot;Derive multi-head attention complexity vs sequence length.&quot;
            </p>
            <button
              type="button"
              className="ds-interactive mt-6 flex w-full items-center justify-center gap-2 rounded-ds-sm bg-ds-secondary/20 py-3 text-sm font-bold text-ds-secondary hover:bg-ds-secondary/30"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.5} />
              Reveal AI hint
            </button>
          </section>
          <section className="ds-surface-glass flex items-center gap-4 rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px]">
            <CheckCircle2 className="h-10 w-10 shrink-0 text-ds-secondary" strokeWidth={1.5} />
            <div>
              <h3 className="text-sm font-bold text-ds-text-primary">Perfect answer</h3>
              <p className="text-[14px] text-ds-text-secondary md:text-xs">+50 XP · Attention mechanisms</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
