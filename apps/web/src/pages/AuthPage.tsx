import { Chrome, Github, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LlmFriendlyGlossary, SemanticIntroBlocks, TechnologyStackLlm } from '../components/content'
import { PageMeta } from '../components/seo'

/**
 * Login / Signup — high-tech glass shell + abstract “3D” gradient field (CSS).
 */
export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  return (
    <div className="relative min-h-screen overflow-hidden bg-ds-bg">
      <PageMeta
        path="/login"
        title="Sign in"
        description="EtherAI: đăng nhập để đồng bộ roadmap video-to-knowledge; pipeline Whisper Large-v3 + Gemini 1.5 Flash, mindmap và deep time-linking."
        noindex
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-ds-primary/30 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-ds-secondary/20 blur-[100px]" />
        <div className="absolute left-1/3 top-1/2 h-64 w-64 rounded-full bg-ds-primary/20 blur-[80px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `linear-gradient(rgba(230,241,255,0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(230,241,255,0.15) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-ds flex-col pb-page-safe lg:flex-row">
        <section className="flex flex-1 flex-col justify-center px-8 py-16 lg:px-16">
          <div className="mb-8 inline-flex items-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-2 backdrop-blur-[10px]">
            <Sparkles className="h-5 w-5 text-ds-secondary" strokeWidth={1.5} />
            <span className="text-[14px] font-bold uppercase tracking-wider text-ds-text-secondary md:text-xs">
              EtherAI · Intelligent Ether
            </span>
          </div>
          <h1 className="max-w-xl text-4xl font-bold leading-tight text-ds-text-primary lg:text-5xl">
            Turn every lecture into a{' '}
            <span className="text-ds-secondary">navigable knowledge graph</span>.
          </h1>
          <p className="mt-8 max-w-md text-base font-normal text-ds-text-secondary">
            Deep time-linking, AI quizzes, and analytics — one pipeline from video to mastery.
          </p>
          <div className="mt-10 max-w-2xl space-y-6">
            <SemanticIntroBlocks condensed />
            <div className="grid gap-4 sm:grid-cols-2">
              <TechnologyStackLlm compact />
              <LlmFriendlyGlossary compact />
            </div>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center px-8 py-16 lg:px-16" aria-label="Account">
          <article className="ds-surface-glass w-full max-w-md rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
            <h2 className="sr-only">Account</h2>
            <div className="mb-8 flex gap-2 rounded-ds-sm bg-ds-bg/60 p-1">
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`ds-interactive flex-1 rounded-ds-sm py-2 text-sm font-bold capitalize ${
                    mode === m
                      ? 'bg-ds-primary text-ds-text-primary hover:brightness-110'
                      : 'text-ds-text-secondary hover:text-ds-text-primary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="mb-8 grid grid-cols-2 gap-4">
              <button
                type="button"
                className="ds-interactive flex items-center justify-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/60 py-3 text-xs font-bold uppercase tracking-wider text-ds-text-secondary hover:border-ds-secondary/50 hover:text-ds-text-primary"
              >
                <Chrome className="h-4 w-4" strokeWidth={1.5} />
                Google
              </button>
              <button
                type="button"
                className="ds-interactive flex items-center justify-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/60 py-3 text-xs font-bold uppercase tracking-wider text-ds-text-secondary hover:border-ds-secondary/50 hover:text-ds-text-primary"
              >
                <Github className="h-4 w-4" strokeWidth={1.5} />
                GitHub
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
              }}
            >
              {mode === 'signup' && (
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                    Display name
                  </label>
                  <input
                    className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                    placeholder="Ada Lovelace"
                  />
                </div>
              )}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                  Email
                </label>
                <input
                  type="email"
                  className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                  placeholder="you@university.edu"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                  Password
                </label>
                <input
                  type="password"
                  className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                className="ds-interactive w-full rounded-ds-sm bg-ds-primary py-4 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95"
              >
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm font-normal text-ds-text-secondary">
              <Link to="/dashboard" className="ds-interactive inline-block font-bold text-ds-secondary hover:underline">
                Skip auth (dev)
              </Link>
            </p>
          </article>
        </section>
      </div>
    </div>
  )
}
