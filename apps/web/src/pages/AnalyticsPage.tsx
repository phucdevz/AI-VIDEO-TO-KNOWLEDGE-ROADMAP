import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { PageMeta } from '../components/seo'

const RADAR_DATA = [
  { skill: 'Theory', value: 92 },
  { skill: 'Practice', value: 78 },
  { skill: 'Logic', value: 85 },
  { skill: 'Terms', value: 70 },
  { skill: 'Creativity', value: 88 },
]

const HEAT_WEEKS = 14
const HEAT_DAYS = 7
const HEAT_LEVELS = ['bg-ds-border/20', 'bg-ds-primary/20', 'bg-ds-primary/45', 'bg-ds-primary/70', 'bg-ds-primary'] as const

/** Pseudo-random but stable pattern for demo heatmap */
function heatCell(w: number, d: number) {
  const v = (w * 3 + d * 5) % 5
  return HEAT_LEVELS[v]
}

/**
 * Skill radar (Recharts) + learning heatmap (8px grid cells).
 */
export function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-ds space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/analytics"
        title="Analytics"
        description="View skill radar charts, AI-recommended next steps, and learning activity heatmaps in EtherAI."
      />
      <header>
        <p className="ds-text-label text-ds-secondary">Insights engine</p>
        <h2 className="text-3xl font-bold text-ds-text-primary">Learning analytics</h2>
        <p className="ds-text-body-secondary mt-2">
          Progress signals from quizzes, workspace time-on-task, and roadmap completion.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px] lg:col-span-7">
          <h3 className="text-lg font-bold text-ds-text-primary">Skill coverage</h3>
          <p className="mt-2 text-sm text-ds-text-secondary">Holistic proficiency (normalized 0–100)</p>
          <div className="mt-8 h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="78%" data={RADAR_DATA}>
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

        <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px] lg:col-span-5">
          <h3 className="text-lg font-bold text-ds-text-primary">AI recommended</h3>
          <p className="mt-2 text-sm text-ds-text-secondary">Next best actions from your graph</p>
          <ul className="mt-8 space-y-4">
            {['Recursive thinking lab', 'Systems architecture primer', 'Memory retention quiz'].map((t) => (
              <li
                key={t}
                className="ds-transition flex items-center justify-between rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-4 hover:border-ds-primary/40"
              >
                <span className="text-sm font-bold text-ds-text-primary">{t}</span>
                <button
                  type="button"
                  className="ds-interactive rounded-ds-sm bg-ds-primary/80 px-4 py-2 text-xs font-bold text-ds-text-primary hover:bg-ds-primary"
                >
                  Start
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px] lg:col-span-12">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-ds-text-primary">Learning activity</h3>
              <p className="mt-2 text-sm text-ds-text-secondary">Cognitive cycles · last ~3 months</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              <span>Less</span>
              <div className="flex gap-1">
                {HEAT_LEVELS.map((c) => (
                  <div key={c} className={`h-3 w-3 rounded-ds-sm ${c}`} />
                ))}
              </div>
              <span>More</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="inline-flex gap-2 pb-2">
              <div className="flex w-8 flex-col justify-end gap-1 pt-6 text-[10px] font-bold text-ds-text-secondary/70">
                <span>Mon</span>
                <span />
                <span>Wed</span>
                <span />
                <span>Fri</span>
                <span />
                <span>Sun</span>
              </div>
              {Array.from({ length: HEAT_WEEKS }, (_, w) => (
                <div key={w} className="flex flex-col gap-1">
                  {Array.from({ length: HEAT_DAYS }, (_, d) => (
                    <div
                      key={d}
                      className={`aspect-square w-3 rounded-ds-sm ${heatCell(w, d)}`}
                      title={`Week ${w + 1} · day ${d + 1}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
