import { CheckCircle2, ChevronLeft, ChevronRight, Circle, FileDown, RefreshCw, Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageMeta } from '../components/seo'
import { downloadQuizPdf, postAudioExtraction } from '../lib/api'
import { fetchLecturesRows, getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { friendlySupabaseError } from '../lib/userFacingErrors'
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
      pushToast(friendlySupabaseError(error), 'error')
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
      <div className="mx-auto w-full max-w-7xl px-4 py-16 text-center text-ds-text-secondary sm:px-6 lg:px-8">
        <PageMeta path="/quiz" title="Quiz Center" description="EtherAI quiz." />
        <p className="text-sm font-bold">Cần đăng nhập để làm quiz từ thư viện.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-5 sm:space-y-8 sm:px-6 sm:py-6 lg:max-w-7xl lg:px-8 lg:py-8">
      <PageMeta
        path="/quiz"
        title="Quiz Center"
        description="Quiz Center đang chờ nguồn dữ liệu thật."
      />
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="ds-text-label text-ds-secondary">Assessment</p>
          <h2 className="text-xl font-bold tracking-tight text-ds-text-primary sm:text-2xl">Quiz center</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ds-text-secondary">
            Chọn bài giảng đã có quiz và bắt đầu làm bài.
          </p>
        </div>
        <aside className="ds-surface-glass flex shrink-0 items-center gap-3 self-start rounded-ds-lg border border-ds-border/70 px-4 py-3 shadow-ds-soft backdrop-blur-[10px] sm:px-5">
          <Trophy className="h-7 w-7 shrink-0 text-ds-secondary sm:h-8 sm:w-8" strokeWidth={1.5} aria-hidden />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ds-text-secondary">Giai đoạn</p>
            <p className="text-lg font-bold capitalize leading-none text-ds-text-primary sm:text-xl">{phase}</p>
          </div>
        </aside>
      </header>

      {phase === 'pick' && (
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border/80 p-4 shadow-ds-soft backdrop-blur-[10px] sm:p-6 lg:p-8">
          <h3 className="text-base font-bold text-ds-text-primary sm:text-lg">Danh sách bài giảng</h3>
          <div className="mt-4 flex flex-col gap-3 sm:mt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ds-text-secondary">Độ khó quiz (tạo mới)</p>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              {(['easy', 'medium', 'hard'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setQuizDifficulty(v)
                    pushToast(
                      v === 'easy'
                        ? 'Đã chọn mức dễ. Các quiz tạo mới sẽ dùng mức này.'
                        : v === 'hard'
                          ? 'Đã chọn mức khó. Các quiz tạo mới sẽ dùng mức này.'
                          : 'Đã chọn mức trung bình. Các quiz tạo mới sẽ dùng mức này.',
                      'default',
                    )
                  }}
                  className={`ds-interactive min-h-[40px] rounded-ds-sm px-3 py-2 text-xs font-bold capitalize sm:min-h-0 sm:px-4 sm:text-sm ${
                    quizDifficulty === v
                      ? 'bg-ds-secondary/25 text-ds-text-primary ring-1 ring-ds-secondary/80'
                      : 'border border-ds-border/60 bg-ds-bg/30 text-ds-text-secondary hover:bg-ds-border/20'
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
            <ul className="mt-5 space-y-3 sm:mt-6">
              {lectureWithQuiz.map((l) => {
                const nQ = parseQuizFromLecture(l)?.questions.length ?? 0
                return (
                  <li key={l.id}>
                    <div className="overflow-hidden rounded-ds-lg border border-ds-border/50 bg-ds-bg/25 shadow-ds-soft transition-colors hover:border-ds-border hover:bg-ds-bg/35">
                      <button
                        type="button"
                        className="ds-interactive w-full px-4 pb-2 pt-4 text-left sm:px-5 sm:pb-2 sm:pt-5"
                        onClick={() => {
                          setActiveLecture(l)
                          setIndex(0)
                          setSelected(null)
                          setAnswers([])
                          setPhase('quiz')
                        }}
                      >
                        <p className="line-clamp-3 text-[15px] font-semibold leading-snug text-ds-text-primary sm:line-clamp-2 sm:text-base">
                          {l.title ?? 'Chưa có tiêu đề'}
                        </p>
                        <p className="mt-2 text-xs text-ds-text-secondary">{nQ} câu hỏi · chạm để làm bài</p>
                      </button>
                      <div className="grid grid-cols-2 gap-2 border-t border-ds-border/40 px-4 py-3 sm:flex sm:justify-end sm:gap-2 sm:px-5">
                        <button
                          type="button"
                          className="ds-interactive inline-flex min-h-[44px] items-center justify-center gap-2 rounded-ds-sm border border-ds-border/70 bg-ds-bg/40 px-3 text-xs font-bold uppercase tracking-wide text-ds-text-secondary hover:bg-ds-border/20 hover:text-ds-text-primary"
                          onClick={(e) => {
                            e.stopPropagation()
                            void exportQuizPdf(l)
                          }}
                        >
                          <FileDown className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
                          PDF
                        </button>
                        <button
                          type="button"
                          disabled={regenBusyId === l.id}
                          className="ds-interactive inline-flex min-h-[44px] items-center justify-center gap-2 rounded-ds-sm border border-ds-secondary/35 bg-ds-secondary/10 px-3 text-xs font-bold uppercase tracking-wide text-ds-secondary hover:bg-ds-secondary/18 disabled:opacity-50"
                          onClick={async (e) => {
                            e.stopPropagation()
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
                          <RefreshCw className={`h-4 w-4 shrink-0 ${regenBusyId === l.id ? 'animate-spin' : ''}`} strokeWidth={1.5} aria-hidden />
                          {regenBusyId === l.id ? 'Đang tạo…' : 'Tạo lại'}
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {phase === 'quiz' && quiz && current && (
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border/80 p-4 shadow-ds-soft backdrop-blur-[10px] sm:p-6 lg:p-8">
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
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border/80 p-4 shadow-ds-soft backdrop-blur-[10px] sm:p-6 lg:p-8">
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
                    pushToast(friendlySupabaseError(error), 'error')
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
