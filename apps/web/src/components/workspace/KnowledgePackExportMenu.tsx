import { ChevronDown, FileDown, FileText, ImageDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  downloadKnowledgePackMarkdown,
  downloadKnowledgePackPdf,
  exportWorkspaceMindmapPng,
  type KnowledgePackExportContext,
} from '../../lib/exportKnowledgePack'

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
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'png' | 'md' | 'pdf' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
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
          onSuccess?.('Đã tải ảnh mindmap (PNG).')
        } else if (kind === 'md') {
          downloadKnowledgePackMarkdown(ctx)
          onSuccess?.('Đã tải Knowledge Pack (.md).')
        } else {
          await downloadKnowledgePackPdf(ctx)
          onSuccess?.('Đã tải Knowledge Pack (PDF).')
        }
        setOpen(false)
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Xuất thất bại.')
      } finally {
        setBusy(null)
      }
    },
    [ctx, mindmapFilenameBase, onError, onSuccess],
  )

  return (
    <div ref={wrapRef} className="relative inline-block text-left">
      <button
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
        Knowledge Pack
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Xuất Knowledge Pack"
          className="absolute right-0 z-[50] mt-1 min-w-[14.5rem] overflow-hidden rounded-ds-sm border border-ds-primary/50 bg-[rgba(10,25,47,0.96)] py-1 shadow-ds-soft backdrop-blur-md"
        >
          <button
            type="button"
            role="menuitem"
            disabled={busy != null}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/15 disabled:opacity-50"
            onClick={() => void run('png')}
          >
            <ImageDown className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={1.5} />
            {busy === 'png' ? 'Đang xuất PNG…' : 'Mindmap — PNG (HD)'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy != null}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/15 disabled:opacity-50"
            onClick={() => void run('md')}
          >
            <FileText className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={1.5} />
            {busy === 'md' ? 'Đang tải…' : 'Tóm tắt + Quiz — Markdown'}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy != null}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ds-text-primary hover:bg-ds-primary/15 disabled:opacity-50"
            onClick={() => void run('pdf')}
          >
            <FileDown className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={1.5} />
            {busy === 'pdf' ? 'Đang tạo PDF…' : 'Tóm tắt + Quiz — PDF'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
