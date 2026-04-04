import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageMeta } from '../components/seo'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuthStore } from '../stores/useAuthStore'

const FALLBACK_RADAR = [
  { skill: 'Theory', value: 0 },
  { skill: 'Practice', value: 0 },
  { skill: 'Logic', value: 0 },
  { skill: 'Terms', value: 0 },
  { skill: 'Creativity', value: 0 },
]

/**
 * Skill radar + thống kê học tập theo dữ liệu của tài khoản.
 */
export function AnalyticsPage() {
  const user = useAuthStore((s) => s.user)
  const [totalLectures, setTotalLectures] = useState<number | null>(null)
  const [avgQuiz, setAvgQuiz] = useState<number | null>(null)
  const [learningHours, setLearningHours] = useState<number | null>(null)
  const [radarData, setRadarData] = useState(FALLBACK_RADAR)
  const [activityDays, setActivityDays] = useState<
    { day: string; lectures: number; quizzes: number }[]
  >([])
  const [recommended, setRecommended] = useState<
    { title: string; desc: string; ctaLabel: string; to: string }[]
  >([])

  useEffect(() => {
    const supabase = getSupabase()
    const uid = user?.id
    if (!supabase || !uid) {
      setTotalLectures(null)
      setAvgQuiz(null)
      setLearningHours(null)
      setActivityDays([])
      setRecommended([])
      return
    }
    ;(async () => {
      const lecQ = supabase
        .from('lectures')
        .select('id, title, created_at, transcript', { count: 'exact' })
        .or(`user_id.eq.${uid},user_id.is.null`)
      const quizQ = supabase
        .from('quiz_results')
        .select('lecture_id, score, total_questions, created_at')
        .eq('user_id', uid)

      const [{ count, data: lecRows, error: e1 }, { data: scores, error: e2 }] = await Promise.all([
        lecQ,
        quizQ,
      ])

      if (!e1) setTotalLectures(typeof count === 'number' ? count : lecRows?.length ?? 0)
      let hours = 0
      if (lecRows && Array.isArray(lecRows)) {
        for (const row of lecRows) {
          const t = row.transcript as { duration?: number } | undefined
          if (t && typeof t.duration === 'number' && Number.isFinite(t.duration)) {
            hours += t.duration / 3600
          }
        }
      }
      setLearningHours(Math.round(hours * 10) / 10)

      if (!e2 && scores && scores.length > 0) {
        let acc = 0
        let n = 0
        for (const s of scores as {
          score?: number
          total_questions?: number
          lecture_id?: string | null
          created_at?: string | null
        }[]) {
          const tot = s.total_questions
          if (typeof s.score === 'number' && typeof tot === 'number' && tot > 0) {
            acc += (s.score / tot) * 100
            n += 1
          }
        }
        const pct = n ? Math.round((acc / n) * 10) / 10 : 0
        setAvgQuiz(pct)
        const last = Math.min(100, pct)
        setRadarData([
          { skill: 'Theory', value: Math.round(last * 0.92) },
          { skill: 'Practice', value: Math.round(last * 0.78) },
          { skill: 'Logic', value: Math.round(last * 0.85) },
          { skill: 'Terms', value: Math.round(last * 0.7) },
          { skill: 'Creativity', value: Math.round(last * 0.88) },
        ])
      } else {
        setAvgQuiz(!e2 && scores?.length === 0 ? 0 : null)
        setRadarData(FALLBACK_RADAR)
      }

      // Learning activity (GitHub-like): last 365 days, bucket by day.
      const today = new Date()
      const dayKey = (d: Date) => d.toISOString().slice(0, 10)
      const toMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      const start = new Date(today)
      start.setDate(today.getDate() - 364)
      const startUtc = toMidnight(start)
      const todayUtc = toMidnight(today)

      // Align to Monday-start week like GitHub.
      // getUTCDay(): 0 Sun ... 6 Sat. We want Monday=0.
      const dow = (startUtc.getUTCDay() + 6) % 7
      startUtc.setUTCDate(startUtc.getUTCDate() - dow)

      const days: { day: string; lectures: number; quizzes: number }[] = []
      const bucket = new Map<string, { lectures: number; quizzes: number }>()
      for (let d = new Date(startUtc); d <= todayUtc; d.setUTCDate(d.getUTCDate() + 1)) {
        const k = dayKey(d)
        bucket.set(k, { lectures: 0, quizzes: 0 })
        days.push({ day: k, lectures: 0, quizzes: 0 })
      }

      if (Array.isArray(lecRows)) {
        for (const r of lecRows as { created_at?: string | null }[]) {
          const c = r.created_at
          if (!c) continue
          const k = String(c).slice(0, 10)
          const b = bucket.get(k)
          if (b) b.lectures += 1
        }
      }
      if (Array.isArray(scores)) {
        for (const r of scores as { created_at?: string | null }[]) {
          const c = r.created_at
          if (!c) continue
          const k = String(c).slice(0, 10)
          const b = bucket.get(k)
          if (b) b.quizzes += 1
        }
      }
      const nextDays = days.map((d) => ({ ...d, ...(bucket.get(d.day) ?? { lectures: 0, quizzes: 0 }) }))
      setActivityDays(nextDays)

      // AI recommended (simple rules based on coverage + quiz performance).
      const total = typeof count === 'number' ? count : lecRows?.length ?? 0
      const quizCount = Array.isArray(scores) ? scores.length : 0
      const pct = !e2 && scores && scores.length > 0 && typeof avgQuiz === 'number' ? avgQuiz : null
      const rec: { title: string; desc: string; ctaLabel: string; to: string }[] = []

      if (total === 0) {
        rec.push({
          title: 'Bắt đầu với một video',
          desc: 'Chạy pipeline cho một bài giảng để có mindmap, quiz và tutor.',
          ctaLabel: 'Về Dashboard',
          to: '/dashboard',
        })
      } else if (quizCount === 0) {
        rec.push({
          title: 'Làm quiz đầu tiên',
          desc: 'Quiz giúp hệ thống ước lượng mức độ nắm bài và gợi ý phần cần ôn.',
          ctaLabel: 'Mở Quiz center',
          to: '/quiz',
        })
      } else if (typeof pct === 'number' && pct < 60) {
        rec.push({
          title: 'Ôn lại các ý chính',
          desc: 'Điểm quiz đang thấp. Hãy mở Workspace và hỏi tutor theo từng đoạn transcript để củng cố.',
          ctaLabel: 'Mở Workspace',
          to: '/workspace',
        })
        rec.push({
          title: 'Tăng tần suất làm quiz',
          desc: 'Làm lại quiz ở mức Medium/Hard để rèn khả năng áp dụng và nhớ lâu hơn.',
          ctaLabel: 'Mở Quiz center',
          to: '/quiz',
        })
      } else {
        rec.push({
          title: 'Thử quiz khó hơn',
          desc: 'Bạn đang làm tốt. Thử tạo lại quiz mức Hard để kiểm tra hiểu sâu.',
          ctaLabel: 'Mở Quiz center',
          to: '/quiz',
        })
        rec.push({
          title: 'Học theo mốc thời gian',
          desc: 'Trong Workspace, click key points/citations để nhảy tới đúng đoạn và ghi nhớ nhanh hơn.',
          ctaLabel: 'Mở Workspace',
          to: '/workspace',
        })
      }

      setRecommended(rec.slice(0, 3))
    })()
  }, [user?.id])

  const statLabel = (v: number | null) => (v === null ? '—' : String(v))

  return (
    <div className="mx-auto max-w-ds min-w-0 space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/analytics"
        title="Analytics"
        description="View skill radar charts, AI-recommended next steps, and learning activity heatmaps in EtherAI."
      />
      <header>
        <p className="ds-text-label text-ds-secondary">Insights engine</p>
        <h2 className="text-3xl font-bold text-ds-text-primary">Learning analytics</h2>
        <p className="ds-text-body-secondary mt-2">
          {isSupabaseConfigured() && user ? 'Số liệu được cập nhật theo tài khoản của bạn.' : 'Đăng nhập để xem số liệu thống kê.'}
        </p>
      </header>

      {isSupabaseConfigured() && user && (
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { k: 'Total lectures', v: totalLectures },
            { k: 'Avg quiz score %', v: avgQuiz },
            { k: 'Learning hours (est.)', v: learningHours },
          ].map(({ k, v }) => (
            <div
              key={k}
              className="ds-surface-glass rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px]"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-ds-text-secondary">{k}</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-ds-secondary">{statLabel(v)}</p>
            </div>
          ))}
        </section>
      )}

      <div className="grid min-w-0 gap-8 lg:grid-cols-12">
        <section className="ds-surface-glass min-w-0 rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px] sm:p-8 lg:col-span-7">
          <h3 className="text-lg font-bold text-ds-text-primary">Skill coverage</h3>
          <p className="mt-2 text-sm text-ds-text-secondary">Radar scale theo điểm quiz trung bình (ước lượng)</p>
          <div className="mt-8 h-[min(360px,70vw)] w-full min-h-[240px] min-w-0 sm:h-[320px] md:h-[360px]">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <RadarChart cx="50%" cy="50%" outerRadius="78%" data={radarData}>
                <PolarGrid stroke="rgba(136, 146, 176, 0.25)" />
                <PolarAngleAxis dataKey="skill" tick={{ fill: '#8892b0', fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#8892b0', fontSize: 10 }} />
                <Radar
                  name="You"
                  dataKey="value"
                  stroke="#7c4dff"
                  fill="#7c4dff"
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(16, 30, 56, 0.95)',
                    border: '1px solid rgba(136, 146, 176, 0.2)',
                    borderRadius: 8,
                    color: '#e6f1ff',
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="ds-surface-glass min-w-0 rounded-ds-lg border border-ds-border p-6 shadow-ds-soft backdrop-blur-[10px] sm:p-8 lg:col-span-5">
          <h3 className="text-lg font-bold text-ds-text-primary">AI recommended</h3>
          <p className="mt-2 text-sm text-ds-text-secondary">Gợi ý dựa trên tiến độ và điểm quiz gần đây.</p>
          {recommended.length === 0 ? (
            <div className="mt-8 rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-5 text-sm text-ds-text-secondary">
              Chưa đủ dữ liệu để gợi ý. Hãy chạy pipeline và làm quiz để bắt đầu.
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {recommended.map((r) => (
                <li key={r.title} className="rounded-ds-sm border border-ds-border bg-ds-bg/40 p-4">
                  <p className="text-sm font-bold text-ds-text-primary">{r.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ds-text-secondary">{r.desc}</p>
                  <div className="mt-3">
                    <Link
                      to={r.to}
                      className="ds-interactive inline-flex items-center justify-center rounded-ds-sm border border-ds-border bg-ds-bg/60 px-3 py-2 text-xs font-bold uppercase tracking-wider text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary"
                    >
                      {r.ctaLabel}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ds-surface-glass w-full max-w-full min-w-0 rounded-ds-lg border border-ds-border p-4 shadow-ds-soft backdrop-blur-[10px] sm:p-6 lg:col-span-12 lg:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-ds-text-primary">Learning activity</h3>
              <p className="mt-2 text-sm text-ds-text-secondary">12 tháng gần nhất (bài giảng + quiz)</p>
            </div>
          </div>
          {activityDays.length === 0 ? (
            <div className="rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-5 text-sm text-ds-text-secondary">
              Chưa có dữ liệu hoạt động để hiển thị.
            </div>
          ) : (
            <div className="w-full max-w-full min-w-0">
              {(() => {
                const weeks = Array.from({ length: Math.ceil(activityDays.length / 7) }).map((_, weekIdx) =>
                  activityDays.slice(weekIdx * 7, weekIdx * 7 + 7),
                )
                const monthShort = (ymd: string) => {
                  const m = Number(ymd.slice(5, 7))
                  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] ?? ''
                }
                const monthAtWeek = (w: { day: string }[]) => (w[0]?.day ? monthShort(w[0].day) : '')
                const monthLabels = weeks.map((w, i) => {
                  const m = monthAtWeek(w)
                  const prev = i > 0 ? monthAtWeek(weeks[i - 1]!) : ''
                  return m !== prev ? m : ''
                })

                const levelClass = (v: number) => {
                  if (v <= 0) return 'bg-ds-border/15'
                  if (v === 1) return 'bg-emerald-500/25'
                  if (v <= 3) return 'bg-emerald-500/45'
                  return 'bg-emerald-500/70'
                }

                const gapWeek = 'gap-[2px] sm:gap-[3px] md:gap-1'
                const gapDay = 'gap-[2px] sm:gap-[3px] md:gap-1'

                return (
                  <div className="w-full max-w-full min-w-0">
                    <div className={`mb-1.5 flex w-full min-w-0 items-end ${gapWeek}`}>
                      <div className="w-7 shrink-0 sm:w-9" aria-hidden />
                      <div className={`flex min-w-0 flex-1 ${gapWeek}`}>
                        {monthLabels.map((m, i) => (
                          <div
                            key={`m-${i}`}
                            className="min-w-0 flex-1 text-center text-[8px] leading-none text-ds-text-secondary sm:text-[9px] md:text-[10px]"
                          >
                            <span className="block truncate">{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`flex w-full min-w-0 items-stretch ${gapWeek}`}>
                      <div className="w-7 shrink-0 text-[8px] leading-tight text-ds-text-secondary sm:w-9 sm:text-[9px] md:text-[10px]">
                        <div className={`grid h-full min-h-0 grid-rows-7 ${gapDay} pt-[1px]`}>
                          <div />
                          <div className="flex items-center">Mon</div>
                          <div />
                          <div className="flex items-center">Wed</div>
                          <div />
                          <div className="flex items-center">Fri</div>
                          <div />
                        </div>
                      </div>

                      <div className={`flex min-w-0 flex-1 ${gapWeek}`}>
                        {weeks.map((week, weekIdx) => (
                          <div key={`wk-${weekIdx}`} className={`flex min-w-0 flex-1 flex-col ${gapDay}`}>
                            {week.map((d) => {
                              const v = d.lectures + d.quizzes
                              return (
                                <div
                                  key={d.day}
                                  className={[
                                    'aspect-square w-full min-w-[2px] rounded-[2px] border border-ds-border/60 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset] sm:rounded-[3px]',
                                    levelClass(v),
                                    'transition-transform duration-150 ease-in-out hover:z-[1] hover:scale-125 hover:border-emerald-300/60',
                                  ].join(' ')}
                                  title={`${d.day}: ${d.lectures} bài giảng, ${d.quizzes} quiz`}
                                  aria-label={`${d.day}: ${d.lectures} bài giảng, ${d.quizzes} quiz`}
                                />
                              )
                            })}
                            {week.length < 7
                              ? Array.from({ length: 7 - week.length }).map((__, i) => (
                                  <div
                                    key={`pad-${weekIdx}-${i}`}
                                    className="aspect-square w-full min-w-[2px] border border-transparent bg-transparent"
                                    aria-hidden
                                  />
                                ))
                              : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 text-xs text-ds-text-secondary sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <button
                        type="button"
                        className="ds-interactive text-left underline decoration-ds-border/50 underline-offset-4 hover:text-ds-text-primary sm:text-right"
                        onClick={() => {
                          /* placeholder */
                        }}
                      >
                        Learn how we count contributions
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span>Less</span>
                        <span className="h-2.5 w-2.5 rounded-[3px] border border-ds-border bg-ds-border/15 sm:h-3 sm:w-3" aria-hidden />
                        <span className="h-2.5 w-2.5 rounded-[3px] border border-ds-border bg-emerald-500/25 sm:h-3 sm:w-3" aria-hidden />
                        <span className="h-2.5 w-2.5 rounded-[3px] border border-ds-border bg-emerald-500/45 sm:h-3 sm:w-3" aria-hidden />
                        <span className="h-2.5 w-2.5 rounded-[3px] border border-ds-border bg-emerald-500/70 sm:h-3 sm:w-3" aria-hidden />
                        <span>More</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
