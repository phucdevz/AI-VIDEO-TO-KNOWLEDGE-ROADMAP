import { ChevronDown, FileDown, FileText, ImageDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  downloadKnowledgePackMarkdown,
  downloadKnowledgePackPdf,
  exportWorkspaceMindmapPng,
  type KnowledgePackExportContext,
} from '../../lib/exportKnowledgePack'
import { friendlyAxiosErrorMessage } from '../../lib/userFacingErrors'
import { useAppStore } from '../../stores/useAppStore'

type KnowledgePackExportMenuProps = {
  ctx: KnowledgePackExportContext
  mindmapFilenameBase: string
  onError: (message: string) => void
  onSuccess?: (message: string) => void
}

/**
 * Xuất Knowledge Pack: PNG mindmap (html-to-image), Markdown, PDF (jsPDF + raster).
 */
export function KnowledgePackExportMenu({
  ctx,
  mindmapFilenameBase,
  onError,
  onSuccess,
}: KnowledgePackExportMenuProps) {
  const language = useAppStore((s) => s.language)
  const isVi = language === 'vi'
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'png' | 'md' | 'pdf' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)
  /** fixed — tránh bị cắt bởi overflow-hidden / overflow-y-auto trên toolbar & workspace */
  const [menuFixed, setMenuFixed] = useState<{ top: number; right: number } | null>(null)

  const syncMenuPosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuFixed({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuFixed(null)
      return
    }
    syncMenuPosition()
    const onScrollOrResize = () => syncMenuPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, syncMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuPanelRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const run = useCallback(
    async (kind: 'png' | 'md' | 'pdf') => {
      setBusy(kind)
      try {
        if (kind === 'png') {
          await exportWorkspaceMindmapPng(mindmapFilenameBase)
          onSuccess?.(isVi ? 'Đã tải ảnh mindmap (PNG).' : 'Mindmap image downloaded (PNG).')
        } else if (kind === 'md') {
          downloadKnowledgePackMarkdown(ctx)
          onSuccess?.(isVi ? 'Đã tải Knowledge Pack (.md).' : 'Knowledge Pack downloaded (.md).')
        } else {
          await downloadKnowledgePackPdf(ctx)
          onSuccess?.(isVi ? 'Đã tải Knowledge Pack (PDF).' : 'Knowledge Pack downloaded (PDF).')
        }
        setOpen(false)
      } catch (e) {
        onError(friendlyAxiosErrorMessage(e))
      } finally {
        setBusy(null)
      }
    },
    [ctx, mindmapFilenameBase, onError, onSuccess],
  )

  const menuPanel =
    open && menuFixed && typeof document !== 'undefined' ? (
      <div
        ref={menuPanelRef}
        role="menu"
        aria-label={isVi ? 'Xuất Knowledge Pack' : 'Export Knowledge Pack'}
        style={{
          position: 'fixed',
          top: menuFixed.top,
          right: menuFixed.right,
          zIndex: 10050,
        }}
        className="min-w-[14.5rem] overflow-hidden rounded-ds-sm border border-ds-primary/50 bg-[rgba(10,25,47,0.96)] py-1 shadow-ds-soft backdrop-blur-md"
      >
        <button
          type="button"
          role="menuitem"
          disabled={busy != null}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/15 disabled:opacity-50"
          onClick={() => void run('png')}
        >
          <ImageDown className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={1.5} />
          {busy === 'png' ? (isVi ? 'Đang xuất PNG…' : 'Exporting PNG…') : isVi ? 'Mindmap — PNG (HD)' : 'Mindmap — PNG (HD)'}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={busy != null}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/15 disabled:opacity-50"
          onClick={() => void run('md')}
        >
          <FileText className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={1.5} />
          {busy === 'md' ? (isVi ? 'Đang tải…' : 'Downloading…') : isVi ? 'Tóm tắt + Quiz — Markdown' : 'Summary + Quiz — Markdown'}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={busy != null}
          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/15 disabled:opacity-50"
          onClick={() => void run('pdf')}
        >
          <FileDown className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={1.5} />
          {busy === 'pdf' ? (isVi ? 'Đang tạo PDF…' : 'Generating PDF…') : isVi ? 'Tóm tắt + Quiz — PDF' : 'Summary + Quiz — PDF'}
        </button>
      </div>
    ) : null

  return (
    <div ref={wrapRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        disabled={busy != null}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`ds-interactive inline-flex items-center gap-2 rounded-ds-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60 ${
          open
            ? 'border-ds-primary bg-ds-primary/15 text-ds-text-primary'
            : 'border-ds-border text-ds-text-secondary hover:border-ds-primary/40 hover:text-ds-text-primary'
        }`}
      >
        <FileDown className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        {isVi ? 'Gói kiến thức' : 'Knowledge Pack'}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {menuPanel && createPortal(menuPanel, document.body)}
    </div>
  )
}
