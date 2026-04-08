import { Bookmark, BookmarkX, ChevronDown, ChevronUp, Loader2, Play, Send, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { postTutorAsk } from '../../lib/api'
import { useAppStore } from '../../stores/useAppStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useToastStore } from '../../stores/useToastStore'
import { useWorkspaceStore } from '../../stores/useWorkspaceStore'
import { useSearchParams } from 'react-router-dom'

type TutorTab = 'summary' | 'highlights'
type ChatRole = 'user' | 'assistant'
type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  citations?: { start: number; end: number; text: string }[]
}

const CHAT_STORAGE_PREFIX = 'etherai:tutor-chat-v1:'
const MAX_CHAT_MESSAGES = 40
const SUMMARY_COLLAPSED_KEY = 'etherai:tutor-autosummary-collapsed-v1'

function normalizeLectureKey(raw: string): string {
  return (raw ?? '').trim()
}

function storageKeyForLectureKey(lectureKey: string): string {
  const k = normalizeLectureKey(lectureKey)
  return k ? `${CHAT_STORAGE_PREFIX}${k}` : ''
}

function safeParseChat(raw: string | null): ChatMessage[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    const msgs = parsed
      .filter((m) => m && typeof m === 'object')
      .slice(0, MAX_CHAT_MESSAGES)
      .map((m) => {
        const mm = m as Partial<ChatMessage>
        const role = mm.role === 'assistant' ? 'assistant' : 'user'
        const text = typeof mm.text === 'string' ? mm.text : ''
        const id =
          typeof mm.id === 'string' && mm.id
            ? mm.id
            : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const citations = Array.isArray(mm.citations)
          ? mm.citations
              .filter((c) => c && typeof c === 'object')
              .slice(0, 3)
              .map((c) => {
                const cc = c as { start?: unknown; end?: unknown; text?: unknown }
                return {
                  start: Number(cc.start) || 0,
                  end: Number(cc.end) || 0,
                  text: typeof cc.text === 'string' ? cc.text : '',
                }
              })
              .filter((c) => c.text.trim().length > 0)
          : undefined
        return { id, role: role as ChatRole, text, citations }
      })
      .filter((m) => m.text.trim().length > 0)
    return msgs
  } catch {
    return null
  }
}

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
  const [searchParams] = useSearchParams()
  const [draft, setDraft] = useState('')
  const [tab, setTab] = useState<TutorTab>('summary')
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [asking, setAsking] = useState(false)
  const chatHydratedForKeyRef = useRef<string>('') // prevents overwriting storage with [] on first key switch
  const [summaryCollapsed, setSummaryCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(SUMMARY_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  const chatHolderRef = useRef<HTMLDivElement>(null)
  const mindmapHighlights = useWorkspaceStore((s) => s.mindmapHighlights)
  const transcriptSegments = useWorkspaceStore((s) => s.transcriptSegments)
  const knowledgeChunks = useWorkspaceStore((s) => s.knowledgeChunks)
  const tutor = useWorkspaceStore((s) => s.tutor as { summary?: string; key_points?: { text?: string; timestamp_seconds?: number }[] } | null)
  const removeMindmapHighlight = useWorkspaceStore((s) => s.removeMindmapHighlight)
  const startClipLoop = useWorkspaceStore((s) => s.startClipLoop)
  const stopClipLoop = useWorkspaceStore((s) => s.stopClipLoop)
  const requestSeek = useWorkspaceStore((s) => s.requestSeek)
  const clipLoop = useWorkspaceStore((s) => s.clipLoop)
  const pipelineLectureId = useWorkspaceStore((s) => s.pipelineLectureId)
  const pipelineVideoUrl = useWorkspaceStore((s) => s.pipelineVideoUrl ?? s.pipelineSourceUrl)
  const authUser = useAuthStore((s) => s.user)
  const language = useAppStore((s) => s.language)
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const pushToast = useToastStore((s) => s.pushToast)
  const tutorDisplayName = useMemo(() => {
    const md = (authUser?.user_metadata ?? {}) as Record<string, unknown>
    const fullName = typeof md.full_name === 'string' ? md.full_name.trim() : ''
    if (fullName) return fullName
    const displayName = typeof md.display_name === 'string' ? md.display_name.trim() : ''
    if (displayName) return displayName
    const email = (authUser?.email ?? '').trim()
    if (email.includes('@')) return email.split('@')[0] ?? 'ban'
    if (email) return email
    return 'ban'
  }, [authUser])

  /**
   * Primary key: stable lecture_id when present; fallback to explicit route param;
   * lastly fallback to video URL. When the key changes (e.g. video_url -> lecture_id),
   * we migrate chat forward so reload doesn't look like "lost history".
   */
  const primaryLectureKey = useMemo(() => {
    const paramLecture = normalizeLectureKey(searchParams.get('lecture') ?? '')
    const id = normalizeLectureKey(pipelineLectureId ?? '')
    const url = normalizeLectureKey(pipelineVideoUrl ?? '')
    return id || paramLecture || url
  }, [pipelineLectureId, pipelineVideoUrl, searchParams])

  const storageKey = useMemo(() => storageKeyForLectureKey(primaryLectureKey), [primaryLectureKey])

  const candidateStorageKeys = useMemo(() => {
    const paramLecture = normalizeLectureKey(searchParams.get('lecture') ?? '')
    const id = normalizeLectureKey(pipelineLectureId ?? '')
    const url = normalizeLectureKey(pipelineVideoUrl ?? '')
    const keys = [id, paramLecture, url].filter((k) => k.length > 0)
    const uniq: string[] = []
    for (const k of keys) if (!uniq.includes(k)) uniq.push(k)
    return uniq.map(storageKeyForLectureKey).filter((k) => k.length > 0)
  }, [pipelineLectureId, pipelineVideoUrl, searchParams])

  useEffect(() => {
    if (!storageKey) return
    try {
      // Load from any known key (lecture_id, route param, video_url).
      let found: ChatMessage[] | null = null
      let foundKey: string | null = null
      for (const k of candidateStorageKeys) {
        const msgs = safeParseChat(window.localStorage.getItem(k))
        if (msgs && msgs.length > 0) {
          found = msgs
          foundKey = k
          break
        }
      }
      setChat(found ?? [])

      // Migrate forward to the primary key so future loads are stable.
      if (found && found.length > 0 && foundKey && foundKey !== storageKey) {
        window.localStorage.setItem(storageKey, JSON.stringify(found.slice(-MAX_CHAT_MESSAGES)))
      }
      chatHydratedForKeyRef.current = storageKey
    } catch {
      setChat([])
      chatHydratedForKeyRef.current = storageKey
    }
  }, [candidateStorageKeys, storageKey])

  useEffect(() => {
    if (!storageKey) return
    // Avoid clobbering an existing chat history with [] during the initial key switch.
    if (chatHydratedForKeyRef.current !== storageKey) return
    try {
      if (chat.length === 0) {
        const existing = safeParseChat(window.localStorage.getItem(storageKey))
        if (existing && existing.length > 0) return
      }
      window.localStorage.setItem(storageKey, JSON.stringify(chat.slice(-MAX_CHAT_MESSAGES)))
    } catch {
      // ignore (private mode / blocked storage)
    }
  }, [chat, storageKey])

  useEffect(() => {
    try {
      window.localStorage.setItem(SUMMARY_COLLAPSED_KEY, summaryCollapsed ? '1' : '0')
    } catch {
      // ignore
    }
  }, [summaryCollapsed])

  const onPlayClip = (startSeconds: number, endSeconds: number) => {
    const r = startClipLoop(startSeconds, endSeconds)
    if (!r.ok) {
      pushToast(r.message, 'error')
      return
    }
  }

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const contextPool = useMemo(() => {
    const chunks =
      Array.isArray(knowledgeChunks) && knowledgeChunks.length > 0
        ? knowledgeChunks
            .slice(0, 260)
            .map((c) => ({
              start: c.start_seconds,
              end: c.end_seconds,
              text: c.text,
            }))
            .filter((c) => c.text.trim().length > 0 && Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start)
        : []
    if (chunks.length > 0) return chunks

    return transcriptSegments
      .filter((s) => s.text.trim().length > 0)
      .slice(0, 5000)
      .map((s) => ({ start: s.start, end: s.end, text: s.text }))
  }, [knowledgeChunks, transcriptSegments])

  const buildContextForQuestion = useCallback(
    (question: string) => {
      const q = normalize(question)
      const qTokens = new Set(q.split(' ').filter((t) => t.length >= 3).slice(0, 24))

      const sortedByTime = [...contextPool].sort((a, b) => a.start - b.start)
      const n = sortedByTime.length
      /** Time-stratified chunks so RAG is never only the first ~minutes when overlap scores cluster early. */
      const stratified: typeof contextPool = []
      if (n > 0) {
        for (const p of [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 0.96]) {
          const idx = Math.min(n - 1, Math.max(0, Math.round((n - 1) * p)))
          stratified.push(sortedByTime[idx]!)
        }
      }

      // Score by token overlap + length bonus.
      const scored = contextPool.map((s) => {
        const t = normalize(s.text)
        let hit = 0
        for (const tok of qTokens) if (t.includes(tok)) hit += 1
        const len = Math.min(1, t.length / 600)
        const score = hit * 1.2 + len * 0.35
        return { s, score }
      })
      scored.sort((a, b) => b.score - a.score)

      const top = scored.filter((x) => x.score > 0).slice(0, 16).map((x) => x.s)

      const segKey = (s: (typeof contextPool)[0]) => `${Math.round(s.start * 10) / 10}:${Math.round(s.end * 10) / 10}`
      const seen = new Set<string>()
      const merged: typeof contextPool = []
      for (const s of top) {
        const k = segKey(s)
        if (!seen.has(k)) {
          seen.add(k)
          merged.push(s)
        }
      }
      for (const s of stratified) {
        const k = segKey(s)
        if (!seen.has(k)) {
          seen.add(k)
          merged.push(s)
        }
      }

      merged.sort((a, b) => a.start - b.start)
      const out: typeof contextPool = []
      merged.forEach((s) => {
        const last = out[out.length - 1]
        if (last && Math.abs(last.start - s.start) < 8) return
        out.push(s)
      })

      return out.slice(0, 30)
    },
    [contextPool],
  )

  const canAsk = contextPool.length > 0 && !asking
  const isVi = language === 'vi'

  useEffect(() => {
    const el = chatHolderRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [chat, asking])

  const askTutor = async () => {
    const q = draft.trim()
    if (!q) return
    if (contextPool.length === 0) {
      pushToast('Chưa có nội dung từ video để hỏi tutor.', 'error')
      return
    }
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    setChat((m) => [...m.slice(-MAX_CHAT_MESSAGES + 1), { id, role: 'user', text: q }])
    setDraft('')
    setAsking(true)
    try {
      const segments = buildContextForQuestion(q)
      const r = await postTutorAsk({
        question: q,
        lecture_id: pipelineLectureId,
        video_url: pipelineVideoUrl,
        user_id: userId,
        segments,
        max_citations: 3,
      })
      const aid =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      setChat((m) => [
        ...m.slice(-MAX_CHAT_MESSAGES + 1),
        {
          id: aid,
          role: 'assistant',
          text:
            /^\s*(chao|chào|hello|hi)\b/i.test(r.answer)
              ? r.answer
              : `Chào ${tutorDisplayName}, ${r.answer}`,
          citations: r.citations ?? [],
        },
      ])
    } catch {
      // toast already handled by api interceptor
    } finally {
      setAsking(false)
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
          {isVi ? 'Tóm tắt' : 'Summary'}
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
          {isVi ? 'Điểm nhấn' : 'Highlights'}
        </button>
      </div>

      {tab === 'summary' ? (
        <>
          <div className="min-w-0 border-b border-ds-border p-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSummaryCollapsed((v) => !v)}
                aria-expanded={!summaryCollapsed}
                className="ds-interactive flex min-w-0 flex-1 items-center gap-2 text-left"
                title={summaryCollapsed ? 'Mở Auto-summary' : 'Gập Auto-summary'}
              >
                <Sparkles className="h-5 w-5 shrink-0 text-ds-secondary" strokeWidth={1.5} />
                <h2
                  id="workspace-tutor-title"
                  className="min-w-0 flex-1 truncate text-sm font-bold text-ds-text-primary"
                >
                  {isVi ? 'Tóm tắt tự động' : 'Auto-summary'}
                </h2>
                {summaryCollapsed ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-ds-text-secondary" strokeWidth={2} aria-hidden />
                ) : (
                  <ChevronUp className="h-4 w-4 shrink-0 text-ds-text-secondary" strokeWidth={2} aria-hidden />
                )}
              </button>
              {!summaryCollapsed ? (
                <button
                  type="button"
                  className="ds-interactive shrink-0 inline-flex items-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/40 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-text-primary"
                >
                  {isVi ? 'Xuất' : 'Export'}
                </button>
              ) : null}
            </div>
            {!summaryCollapsed ? (
              <>
                <div className="scrollbar-hide mt-4 max-h-40 min-w-0 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-2">
                  <p className="text-sm font-normal leading-relaxed text-ds-text-secondary whitespace-pre-wrap break-words">
                    {tutor?.summary?.trim()
                      ? tutor.summary
                      : 'Chưa có summary từ pipeline. Chạy phân tích từ Dashboard hoặc Admin để nạp dữ liệu.'}
                  </p>
                  {Array.isArray(tutor?.key_points) && tutor.key_points.length > 0 ? (
                    <ul className="min-w-0 space-y-2">
                      {tutor.key_points.slice(0, 12).map((kp, i) => (
                        <li
                          key={`kp-${i}`}
                          className="min-w-0 max-w-full rounded-ds-sm bg-ds-border/15 px-3 py-2 text-xs text-ds-text-primary"
                        >
                          <button
                            type="button"
                            className="ds-interactive flex w-full min-w-0 items-start gap-2 text-left"
                            onClick={() => {
                              const sec = Number(kp.timestamp_seconds)
                              if (!Number.isFinite(sec)) return
                              const r = requestSeek(sec, `kp-${i}`)
                              if (!r.ok) pushToast(r.message, 'error')
                            }}
                            title={kp.text || 'Key point'}
                          >
                            <span className="shrink-0 whitespace-nowrap font-mono text-ds-secondary tabular-nums">
                              {formatClipRange(Number(kp.timestamp_seconds) || 0, Number(kp.timestamp_seconds) || 0)
                                .split(' → ')[0]}
                            </span>
                            <span className="block min-w-0 flex-1 break-words leading-snug text-ds-text-primary line-clamp-4">
                              <span className="text-ds-text-secondary">· </span>
                              {kp.text || 'Key point'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <h3 className="ds-text-label text-ds-text-secondary">{isVi ? 'Trợ giảng AI' : 'AI tutor'}</h3>
            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-ds-sm bg-ds-bg/60">
              <div
                ref={chatHolderRef}
                className="scrollbar-hide min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-5"
              >
                {chat.length === 0 ? (
                  <div className="rounded-ds-sm bg-ds-border/20 p-3 text-sm text-ds-text-primary">
                    Hỏi bất kỳ điều gì dựa trên nội dung bài giảng. Tutor sẽ trả lời kèm mốc thời gian để bạn nhảy tới đoạn liên quan.
                  </div>
                ) : null}
                {chat.map((m) => (
                  <div
                    key={m.id}
                    className={`min-w-0 max-w-full rounded-ds-sm border p-3 ${
                      m.role === 'user'
                        ? 'border-ds-primary/30 bg-ds-primary/10 text-ds-text-primary'
                        : 'border-ds-border/70 bg-ds-bg/40 text-ds-text-primary'
                    }`}
                  >
                    <p className="break-words whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
                    {m.role === 'assistant' && m.citations && m.citations.length > 0 ? (
                      <div className="mt-3 flex w-full min-w-0 flex-col gap-2">
                        {m.citations.slice(0, 3).map((c, i) => (
                          <button
                            key={`${m.id}-c-${i}-${c.start}`}
                            type="button"
                            className="ds-interactive flex w-full min-w-0 max-w-full items-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/60 px-2.5 py-1.5 text-left text-[11px] font-bold text-ds-secondary hover:bg-ds-border/30"
                            onClick={() => {
                              const r = requestSeek(c.start, `${m.id}-cite-${i}`)
                              if (!r.ok) pushToast(r.message, 'error')
                            }}
                            title={c.text}
                          >
                            <span className="shrink-0 whitespace-nowrap font-mono text-ds-secondary tabular-nums">
                              {formatClipRange(c.start, c.end).split(' → ')[0]}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-ds-text-secondary">
                              {c.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
                {asking ? (
                  <div className="flex items-center gap-2 rounded-ds-sm border border-ds-border/70 bg-ds-bg/40 p-3 text-sm text-ds-text-secondary">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Đang suy nghĩ…
                  </div>
                ) : null}
              </div>
              <div className="border-t border-ds-border/70 p-3">
                {contextPool.length === 0 ? (
                  <p className="text-xs text-ds-text-secondary">
                    Chưa có dữ liệu từ video. Hãy chạy pipeline để tutor có nội dung trả lời.
                  </p>
                ) : null}
              </div>
            </div>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void askTutor()
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  contextPool.length === 0
                    ? isVi
                      ? 'Chưa có nội dung video…'
                      : 'No video content yet…'
                    : isVi
                      ? 'Hỏi tutor…'
                      : 'Ask tutor…'
                }
                className="ds-transition flex-1 rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-2 text-sm text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                disabled={contextPool.length === 0 || asking}
              />
              <button
                type="submit"
                disabled={!canAsk || draft.trim().length === 0}
                className="ds-interactive flex h-10 w-10 shrink-0 items-center justify-center rounded-ds-sm bg-ds-primary text-ds-text-primary hover:opacity-90 disabled:opacity-50"
                aria-label={isVi ? 'Gửi' : 'Send'}
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
              <h2 className="text-sm font-bold text-ds-text-primary">{isVi ? 'Điểm nhấn' : 'Highlights'}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ds-text-secondary">
                Chuột phải hoặc double-click nút trên Neural map → <strong>Lưu vào mục ưa thích</strong> (màn hình cảm
                ứng: double-tap).
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
          <div className="scrollbar-hide mt-4 flex-1 overflow-y-auto overscroll-y-contain">
            {mindmapHighlights.length === 0 ? (
              <div
                className="flex flex-col items-center gap-3 rounded-ds-lg border border-ds-border border-dashed bg-ds-border/10 px-4 py-8 text-center"
                role="status"
              >
                <BookmarkX className="h-10 w-10 text-ds-text-secondary" strokeWidth={1.5} aria-hidden />
                <p className="text-sm font-bold text-ds-text-primary">Chưa có bookmark nào</p>
                <p className="max-w-[18rem] text-xs leading-relaxed text-ds-text-secondary">
                  Lưu clip từ Neural map (chuột phải hoặc double-click nút → Lưu vào mục ưa thích) để ôn nhanh từng
                  khối kiến thức.
                </p>
              </div>
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
