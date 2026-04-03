import { CheckCircle2, ChevronLeft, ChevronRight, Circle, FileDown, RefreshCw, Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageMeta } from '../components/seo'
import { downloadQuizPdf, postAudioExtraction } from '../lib/api'
import { fetchLecturesRows, getSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { LibraryLectureRow } from '../stores/useAppStore'
import { useAppStore } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'

type Phase = 'pick' | 'quiz' | 'result'

type QuizQuestion = {
  id: string
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
  evidence?: { start: number; end: number; text: string }[]
  timestamp_seconds?: number
}

function fmtTime(total: number) {
  const s = Number.isFinite(total) ? Math.max(0, total) : 0
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function parseQuizFromLecture(row: LibraryLectureRow): { title?: string; questions: QuizQuestion[] } | null {
  const raw = (row as any)?.quiz ?? (row as any)?.quiz_data
  if (!raw || typeof raw !== 'object') return null
  const questions = (raw as any).questions
  if (!Array.isArray(questions) || questions.length === 0) return null

  const q = questions
    .filter((x: any) => x && typeof x === 'object')
    .map((x: any, idx: number) => {
      const id = typeof x.id === 'string' && x.id.trim() ? x.id : `q-${idx + 1}`
      const question = typeof x.question === 'string' ? x.question.trim() : ''
      const choices = Array.isArray(x.choices) ? x.choices.map((c: any) => String(c ?? '').trim()).filter(Boolean) : []
      const correct_index = Number.isFinite(x.correct_index) ? Number(x.correct_index) : -1
      const explanation = typeof x.explanation === 'string' ? x.explanation.trim() : undefined
      const evidence = Array.isArray(x.evidence)
        ? x.evidence
            .filter((e: any) => e && typeof e === 'object')
            .slice(0, 2)
            .map((e: any) => ({
              start: Number(e.start) || 0,
              end: Number(e.end) || 0,
              text: String(e.text ?? '').trim(),
            }))
            .filter((e: any) => e.text.length > 0)
        : undefined
      const ts = x.timestamp_seconds
      const timestamp_seconds = typeof ts === 'number' && Number.isFinite(ts) ? ts : undefined
      return { id, question, choices, correct_index, explanation, evidence, timestamp_seconds } satisfies QuizQuestion
    })
    .filter((qq: QuizQuestion) => qq.question.length > 0 && qq.choices.length === 4 && qq.correct_index >= 0 && qq.correct_index <= 3)

  if (q.length === 0) return null
  const title = typeof (raw as any).title === 'string' ? (raw as any).title : undefined
  return { title, questions: q }
}

/**
 * Quiz from `lectures.quiz_data` — state: pick lecture → answer → score; results in `quiz_results`.
 */
export function QuizCenterPage() {
  const user = useAuthStore((s) => s.user)
  const pushToast = useToastStore((s) => s.pushToast)
  const quizDifficulty = useAppStore((s) => s.quizDifficulty)
  const setQuizDifficulty = useAppStore((s) => s.setQuizDifficulty)
  const language = useAppStore((s) => s.language)
  const [lectures, setLectures] = useState<LibraryLectureRow[]>([])
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>('pick')
  const [activeLecture, setActiveLecture] = useState<LibraryLectureRow | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [answers, setAnswers] = useState<{ questionId: string; selectedIndex: number; correct: boolean }[]>([])
  const [saving, setSaving] = useState(false)
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null)

  const refreshLectures = useCallback(async () => {
    const supabase = getSupabase()
    const uid = user?.id
    if (!supabase || !uid) {
      setLectures([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await fetchLecturesRows(supabase, uid)
    if (error) {
      pushToast(error.message, 'error')
      setLectures([])
    } else {
      setLectures((data as LibraryLectureRow[]) ?? [])
    }
    setLoading(false)
  }, [user?.id, pushToast])

  useEffect(() => {
    void refreshLectures()
  }, [refreshLectures])

  const lectureOptions = lectures.filter((l) => l.status !== 'processing')
  const lectureWithQuiz = useMemo(
    () => lectureOptions.filter((l) => parseQuizFromLecture(l)?.questions?.length),
    [lectureOptions],
  )

  const quiz = activeLecture ? parseQuizFromLecture(activeLecture) : null
  const questions = quiz?.questions ?? []
  const current = questions[index]
  const score = answers.reduce((acc, a) => acc + (a.correct ? 1 : 0), 0)
  const exportQuizPdf = useCallback(
    async (row: LibraryLectureRow) => {
      if (!row?.id) return
      try {
        const blob = await downloadQuizPdf(row.id)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(row.title ?? 'quiz').toString().slice(0, 80)}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      } catch {
        // toast from interceptor
      }
    },
    [],
  )

  if (!isSupabaseConfigured() || !user) {
    return (
      <div className="mx-auto max-w-ds px-4 py-16 text-center text-ds-text-secondary">
        <PageMeta path="/quiz" title="Quiz Center" description="EtherAI quiz." />
        <p className="text-sm font-bold">Cần đăng nhập để làm quiz từ thư viện.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-ds space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/quiz"
        title="Quiz Center"
        description="Quiz Center đang chờ nguồn dữ liệu thật."
      />
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="ds-text-label text-ds-secondary">Assessment</p>
          <h2 className="text-2xl font-bold text-ds-text-primary">Quiz center</h2>
          <p className="mt-2 text-base text-ds-text-secondary md:text-sm">
            Chọn một bài giảng đã có quiz và bắt đầu làm bài.
          </p>
        </div>
        <aside className="ds-surface-glass flex items-center gap-4 rounded-ds-lg border border-ds-border px-6 py-4 shadow-ds-soft backdrop-blur-[10px]">
          <Trophy className="h-8 w-8 text-ds-secondary" strokeWidth={1.5} />
          <div>
            <p className="text-[14px] font-bold uppercase text-ds-text-secondary md:text-xs">Phase</p>
            <p className="text-xl font-bold capitalize text-ds-text-primary">{phase}</p>
          </div>
        </aside>
      </header>

      {phase === 'pick' && (
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
          <h3 className="text-lg font-bold text-ds-text-primary">Danh sách bài giảng</h3>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-ds-text-secondary">Quiz difficulty</p>
            <div className="flex flex-wrap gap-2">
              {(['easy', 'medium', 'hard'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setQuizDifficulty(v)
                    pushToast(
                      v === 'easy'
                        ? 'Đã chọn Easy. Quiz mới tạo tiếp theo sẽ theo mức này.'
                        : v === 'hard'
                          ? 'Đã chọn Hard. Quiz mới tạo tiếp theo sẽ theo mức này.'
                          : 'Đã chọn Medium. Quiz mới tạo tiếp theo sẽ theo mức này.',
                      'default',
                    )
                  }}
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
          {loading ? (
            <p className="mt-4 text-sm text-ds-text-secondary">Đang tải…</p>
          ) : lectureWithQuiz.length === 0 ? (
            <div className="mt-4 space-y-3 text-sm text-ds-text-secondary">
              <p>Chưa có bài giảng có quiz.</p>
              <p className="text-xs text-ds-text-secondary">
                Hãy chạy pipeline cho video ở Dashboard/Workspace để hệ thống tạo quiz.
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {lectureWithQuiz.map((l) => (
                <li key={l.id}>
                  <div className="w-full rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-4 text-left">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        type="button"
                        className="ds-interactive min-w-0 flex-1 text-left"
                        onClick={() => {
                          setActiveLecture(l)
                          setIndex(0)
                          setSelected(null)
                          setAnswers([])
                          setPhase('quiz')
                        }}
                      >
                        <p className="font-bold text-ds-text-primary">{(l.title ?? 'Untitled').slice(0, 80)}</p>
                        <p className="mt-1 text-xs font-normal text-ds-text-secondary">
                          {parseQuizFromLecture(l)?.questions.length ?? 0} câu hỏi
                        </p>
                      </button>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm border border-ds-border px-3 py-2 text-xs font-bold uppercase tracking-wider text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary disabled:opacity-50"
                          onClick={() => exportQuizPdf(l)}
                        >
                          <FileDown className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                          PDF
                        </button>
                        <button
                          type="button"
                          disabled={regenBusyId === l.id}
                          className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm border border-ds-secondary/40 bg-ds-secondary/10 px-3 py-2 text-xs font-bold uppercase tracking-wider text-ds-secondary hover:bg-ds-secondary/20 disabled:opacity-50"
                          onClick={async () => {
                            const url = (l.video_url ?? l.source_url ?? '').trim()
                            if (!url) {
                              pushToast('Thiếu video URL để tạo lại quiz.', 'error')
                              return
                            }
                            if (regenBusyId) return
                            setRegenBusyId(l.id)
                            pushToast('Đang tạo lại quiz…', 'default')
                            try {
                              await postAudioExtraction(url, user?.id ?? null, language, quizDifficulty, true)
                              await refreshLectures()
                              pushToast('Đã cập nhật quiz. Tải lại danh sách để xem số câu mới.', 'success')
                            } finally {
                              setRegenBusyId(null)
                            }
                          }}
                        >
                          <RefreshCw className={`h-4 w-4 ${regenBusyId === l.id ? 'animate-spin' : ''}`} strokeWidth={1.5} aria-hidden />
                          {regenBusyId === l.id ? 'Đang tạo…' : 'Tạo lại'}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {phase === 'quiz' && quiz && current && (
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                {activeLecture?.title ?? quiz.title ?? 'Quiz'}
              </p>
              <p className="mt-2 text-lg font-bold text-ds-text-primary">
                Câu {index + 1}/{questions.length}
              </p>
            </div>
            <button
              type="button"
              className="ds-interactive rounded-ds-sm border border-ds-border px-3 py-2 text-xs font-bold uppercase tracking-wider text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary"
              onClick={() => {
                setPhase('pick')
                setActiveLecture(null)
              }}
            >
              Đổi bài
            </button>
          </div>

          <p className="mt-6 text-base font-semibold text-ds-text-primary">{current.question}</p>

          <div className="mt-5 grid gap-3">
            {current.choices.map((c, i) => {
              const picked = selected === i
              return (
                <button
                  key={`${current.id}-c-${i}`}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={`ds-interactive flex items-center gap-3 rounded-ds-sm border px-4 py-3 text-left text-sm ${
                    picked
                      ? 'border-ds-primary/60 bg-ds-primary/10 text-ds-text-primary'
                      : 'border-ds-border bg-ds-bg/40 text-ds-text-secondary hover:bg-ds-border/20 hover:text-ds-text-primary'
                  }`}
                >
                  {picked ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-ds-secondary" strokeWidth={1.5} aria-hidden />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-ds-text-secondary" strokeWidth={1.5} aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">{c}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm border border-ds-border px-3 py-2 text-sm font-bold text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary disabled:opacity-50"
              disabled={index === 0}
              onClick={() => {
                setIndex((v) => Math.max(0, v - 1))
                setSelected(null)
              }}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
              Back
            </button>
            <button
              type="button"
              className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm bg-ds-primary px-4 py-2 text-sm font-bold text-ds-text-primary hover:opacity-95 disabled:opacity-50"
              disabled={selected == null}
              onClick={() => {
                const sel = selected
                if (sel == null) return
                const correct = sel === current.correct_index
                setAnswers((a) => [
                  ...a,
                  { questionId: current.id, selectedIndex: sel, correct },
                ])
                setSelected(null)
                if (index + 1 >= questions.length) {
                  setPhase('result')
                } else {
                  setIndex((v) => v + 1)
                }
              }}
            >
              {index + 1 >= questions.length ? 'Xem kết quả' : 'Next'}
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </section>
      )}

      {phase === 'result' && activeLecture && quiz && (
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
          <h3 className="text-lg font-bold text-ds-text-primary">Kết quả</h3>
          <p className="mt-2 text-sm text-ds-text-secondary">
            Bạn đúng <span className="font-bold text-ds-secondary">{score}</span> / {questions.length} câu.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              className="ds-interactive rounded-ds-sm border border-ds-border px-4 py-2 text-sm font-bold text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary"
              onClick={() => {
                setIndex(0)
                setSelected(null)
                setAnswers([])
                setPhase('quiz')
              }}
            >
              Làm lại
            </button>
            <button
              type="button"
              disabled={saving}
              className="ds-interactive rounded-ds-sm bg-ds-primary px-4 py-2 text-sm font-bold text-ds-text-primary hover:opacity-95 disabled:opacity-50"
              onClick={async () => {
                const supabase = getSupabase()
                if (!supabase || !user?.id) return
                setSaving(true)
                try {
                  const { error } = await supabase.from('quiz_results').insert({
                    user_id: user.id,
                    lecture_id: activeLecture.id,
                    score,
                    total_questions: questions.length,
                    answers,
                  })
                  if (error) {
                    pushToast(`Lưu kết quả: ${error.message}`, 'error')
                  } else {
                    pushToast('Đã lưu kết quả quiz.', 'success')
                  }
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving ? 'Đang lưu…' : 'Lưu kết quả'}
            </button>
            <button
              type="button"
              className="ds-interactive rounded-ds-sm border border-ds-border px-4 py-2 text-sm font-bold text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary"
              onClick={() => {
                setPhase('pick')
                setActiveLecture(null)
              }}
            >
              Chọn bài khác
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
