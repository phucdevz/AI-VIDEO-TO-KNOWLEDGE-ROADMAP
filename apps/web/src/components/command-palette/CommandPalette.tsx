import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ListChecks, Search, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { LibraryLectureRow } from '../../stores/useAppStore'
import { useAppStore } from '../../stores/useAppStore'
import { useMediaCommandStore } from '../../stores/useMediaCommandStore'

type CommandDef = {
  id: string
  prefix: string
  label: string
  description: string
  keywords: string[]
  icon: typeof BookOpen | typeof VolumeX | typeof ListChecks
}

const COMMANDS: CommandDef[] = [
  {
    id: 'play',
    prefix: '/play',
    label: 'Tiếp tục video',
    description: 'Phát video trong Workspace (inline hoặc mini-player)',
    keywords: ['play', 'phát', 'tiếp tục', 'video'],
    icon: BookOpen,
  },
  {
    id: 'mute',
    prefix: '/mute',
    label: 'Tắt / bật tiếng',
    description: 'Mute / unmute audio video',
    keywords: ['mute', 'tiếng', 'âm thanh', 'im lặng'],
    icon: VolumeX,
  },
  {
    id: 'quiz',
    prefix: '/quiz',
    label: 'Mở Quiz Center',
    description: 'Đi tới trang câu hỏi',
    keywords: ['quiz', 'câu hỏi', 'kiểm tra'],
    icon: ListChecks,
  },
]

type Row =
  | { kind: 'lecture'; key: string; lecture: LibraryLectureRow }
  | { kind: 'command'; key: string; command: CommandDef }

function commandMatchesQuery(c: CommandDef, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  if (lower.startsWith('/')) {
    return (
      c.prefix.toLowerCase().startsWith(lower) ||
      c.prefix.toLowerCase().includes(lower.slice(1)) ||
      lower === '/'
    )
  }
  return (
    c.label.toLowerCase().includes(lower) ||
    c.description.toLowerCase().includes(lower) ||
    c.keywords.some((k) => lower.includes(k) || k.includes(lower))
  )
}

function lectureMatchesQuery(lecture: LibraryLectureRow, q: string): boolean {
  if (!q) return true
  const lower = q.trim().toLowerCase()
  if (lower.startsWith('/')) return false
  return (
    (lecture.title ?? '').toLowerCase().includes(lower) ||
    (lecture.source_url ?? '').toLowerCase().includes(lower) ||
    (lecture.course ?? '').toLowerCase().includes(lower) ||
    lecture.id.includes(lower)
  )
}

function buildRows(query: string, lectures: LibraryLectureRow[]): Row[] {
  const q = query.trim()
  const rows: Row[] = []

  if (!q.startsWith('/')) {
    const filtered = lectures.filter((l) => lectureMatchesQuery(l, q))
    const limit = q ? filtered.length : Math.min(filtered.length, 8)
    for (let i = 0; i < limit; i++) {
      const l = filtered[i]
      if (l) rows.push({ kind: 'lecture', key: `lecture-${l.id}`, lecture: l })
    }
  }

  const cmds = COMMANDS.filter((c) => commandMatchesQuery(c, q))
  for (const c of cmds) {
    rows.push({ kind: 'command', key: `command-${c.id}`, command: c })
  }

  return rows
}

/**
 * Ctrl/Cmd + K — tìm bài giảng (Library) + lệnh /play, /mute, /quiz.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const requestPlay = useMediaCommandStore((s) => s.requestPlay)
  const requestMuteToggle = useMediaCommandStore((s) => s.requestMuteToggle)

  const libraryLectures = useAppStore((s) => s.libraryLectures)
  const fetchLibraryLectures = useAppStore((s) => s.fetchLibraryLectures)

  const rows = useMemo(() => buildRows(query, libraryLectures), [query, libraryLectures])
  const activeIndex = rows.length === 0 ? 0 : Math.min(Math.max(0, selected), rows.length - 1)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelected(0)
  }, [])

  const runCommand = useCallback(
    (c: CommandDef) => {
      if (c.id === 'play') {
        if (pathname !== '/workspace') {
          navigate('/workspace')
          queueMicrotask(() => requestPlay())
        } else {
          requestPlay()
        }
        close()
        return
      }
      if (c.id === 'mute') {
        if (pathname !== '/workspace') {
          navigate('/workspace')
          queueMicrotask(() => requestMuteToggle())
        } else {
          requestMuteToggle()
        }
        close()
        return
      }
      if (c.id === 'quiz') {
        navigate('/quiz')
        close()
      }
    },
    [close, navigate, pathname, requestMuteToggle, requestPlay],
  )

  const runRow = useCallback(
    (row: Row) => {
      if (row.kind === 'lecture') {
        navigate(`/workspace?lecture=${encodeURIComponent(row.lecture.id)}`)
        close()
        return
      }
      runCommand(row.command)
    },
    [close, navigate, runCommand],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'
      if (isModK) {
        e.preventDefault()
        setOpen((o) => !o)
        return
      }
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, open])

  useEffect(() => {
    if (!open) return
    if (libraryLectures.length > 0) return
    // Khi user mở Ctrl+K lần đầu mà chưa vào Dashboard: chủ động fetch list lecture.
    void fetchLibraryLectures()
  }, [open, libraryLectures.length, fetchLibraryLectures])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => {
      document.body.style.overflow = prev
      cancelAnimationFrame(id)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((i) => (rows.length ? (i + 1) % rows.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
      } else if (e.key === 'Enter' && rows[activeIndex]) {
        e.preventDefault()
        runRow(rows[activeIndex])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, rows, activeIndex, runRow])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Đóng command palette"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[400] bg-ds-bg/55 backdrop-blur-sm"
            onClick={close}
          />
          <div className="scrollbar-hide fixed inset-0 z-[401] flex items-start justify-center overflow-y-auto px-4 pb-16 pt-[min(20vh,8rem)]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="command-palette-title"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="ds-surface-glass w-full max-w-xl rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px]"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="command-palette-title" className="sr-only">
                Command palette
              </h2>
              <div className="flex items-center gap-3 border-b border-ds-border px-4 py-3">
                <Search className="h-5 w-5 shrink-0 text-ds-secondary" strokeWidth={1.5} aria-hidden />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value)
                    setSelected(0)
                  }}
                  placeholder="Tìm bài giảng hoặc gõ /play, /mute, /quiz…"
                  className="ds-transition min-w-0 flex-1 border-0 bg-transparent text-base text-ds-text-primary placeholder:text-ds-text-secondary focus:outline-none focus:ring-0 md:text-sm"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <kbd className="hidden shrink-0 rounded-ds-sm border border-ds-border bg-ds-bg/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ds-text-secondary sm:inline">
                  Esc
                </kbd>
              </div>
              <ul
                className="scrollbar-hide max-h-[min(50vh,320px)] overflow-y-auto overscroll-y-contain p-2"
                role="listbox"
                aria-label="Kết quả"
              >
                {rows.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-ds-text-secondary">
                    Không có kết quả.
                  </li>
                ) : (
                  rows.map((row, index) => {
                    const isActive = index === activeIndex
                    if (row.kind === 'lecture') {
                      const { lecture } = row
                      return (
                        <li key={row.key} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() => setSelected(index)}
                            onClick={() => runRow(row)}
                            className={`flex w-full items-start gap-3 rounded-ds-sm px-3 py-2.5 text-left transition-colors ${
                              isActive
                                ? 'bg-ds-primary/25 text-ds-text-primary'
                                : 'text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-text-primary'
                            }`}
                          >
                            <BookOpen
                              className="mt-0.5 h-4 w-4 shrink-0 text-ds-secondary"
                              strokeWidth={1.5}
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-ds-text-primary line-clamp-2">
                                {lecture.title ?? 'Untitled lecture'}
                              </span>
                              <span className="mt-0.5 block text-xs text-ds-text-secondary line-clamp-1">
                                {(lecture.course ?? 'Library') + ' · Mở workspace'}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    }
                    const { command: c } = row
                    const Icon = c.icon
                    return (
                      <li key={row.key} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setSelected(index)}
                          onClick={() => runRow(row)}
                          className={`flex w-full items-start gap-3 rounded-ds-sm px-3 py-2.5 text-left transition-colors ${
                            isActive
                              ? 'bg-ds-primary/25 text-ds-text-primary'
                              : 'text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-text-primary'
                          }`}
                        >
                          <Icon
                            className="mt-0.5 h-4 w-4 shrink-0 text-ds-secondary"
                            strokeWidth={1.5}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-xs font-bold text-ds-secondary">
                              {c.prefix}
                            </span>
                            <span className="block text-sm font-bold text-ds-text-primary">{c.label}</span>
                            <span className="mt-0.5 block text-xs text-ds-text-secondary">{c.description}</span>
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
              <div className="border-t border-ds-border px-4 py-2 text-[11px] text-ds-text-secondary">
                <span className="opacity-90">
                  ↑↓ chọn · Enter chạy ·{' '}
                  <kbd className="rounded border border-ds-border bg-ds-bg/50 px-1">⌘K</kbd> /{' '}
                  <kbd className="rounded border border-ds-border bg-ds-bg/50 px-1">Ctrl K</kbd> đóng/mở
                </span>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
