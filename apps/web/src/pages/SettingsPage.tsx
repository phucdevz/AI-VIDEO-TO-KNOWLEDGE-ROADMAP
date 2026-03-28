import { KeyRound, Sliders, User } from 'lucide-react'
import { PageMeta } from '../components/seo'
import { useAppStore } from '../stores/useAppStore'

/**
 * Profile, AI preferences, API keys (client-side only until Supabase auth).
 */
export function SettingsPage() {
  const summaryLength = useAppStore((s) => s.summaryLength)
  const quizDifficulty = useAppStore((s) => s.quizDifficulty)
  const setSummaryLength = useAppStore((s) => s.setSummaryLength)
  const setQuizDifficulty = useAppStore((s) => s.setQuizDifficulty)

  return (
    <div className="mx-auto max-w-ds space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/settings"
        title="Settings"
        description="Configure your EtherAI profile, AI summary and quiz preferences, and developer API keys."
      />
      <header>
        <h2 className="text-3xl font-bold text-ds-text-primary">Settings</h2>
        <p className="ds-text-body-secondary mt-2">Profile, model behavior, and developer keys</p>
      </header>

      <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
        <div className="mb-6 flex items-center gap-3">
          <User className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
          <h3 className="text-lg font-bold text-ds-text-primary">Profile</h3>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Display name
            </label>
            <input
              defaultValue="Kim Vale"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Email
            </label>
            <input
              type="email"
              defaultValue="kim.vale@example.com"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
        </div>
      </section>

      <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
        <div className="mb-6 flex items-center gap-3">
          <Sliders className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
          <h3 className="text-lg font-bold text-ds-text-primary">AI preferences</h3>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Summary length
            </p>
            <div className="flex flex-wrap gap-2">
              {(['short', 'medium', 'long'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setSummaryLength(v)}
                  className={`ds-interactive rounded-ds-sm px-4 py-2 text-sm font-bold capitalize ${
                    summaryLength === v
                      ? 'bg-ds-primary text-ds-text-primary hover:brightness-110'
                      : 'border border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Quiz difficulty
            </p>
            <div className="flex flex-wrap gap-2">
              {(['easy', 'medium', 'hard'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQuizDifficulty(v)}
                  className={`ds-interactive rounded-ds-sm px-4 py-2 text-sm font-bold capitalize ${
                    quizDifficulty === v
                      ? 'bg-ds-secondary/30 text-ds-text-primary ring-2 ring-ds-secondary hover:brightness-110'
                      : 'border border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
        <div className="mb-6 flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
          <h3 className="text-lg font-bold text-ds-text-primary">API keys</h3>
        </div>
        <p className="mb-6 text-sm text-ds-text-secondary">
          Stored in local state only for now — move to Supabase vault + edge functions for production.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Groq API key
            </label>
            <input
              type="password"
              placeholder="gsk_…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 font-mono text-sm text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Google AI (Gemini)
            </label>
            <input
              type="password"
              placeholder="AIza…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 font-mono text-sm text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Supabase anon key
            </label>
            <input
              type="password"
              placeholder="eyJ…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 font-mono text-sm text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
        </div>
        <button
          type="button"
          className="ds-interactive mt-8 rounded-ds-sm bg-ds-primary px-8 py-3 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95"
        >
          Save preferences
        </button>
      </section>
    </div>
  )
}
