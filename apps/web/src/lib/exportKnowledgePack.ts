import {
  buildKnowledgePackMarkdown,
  getKnowledgePackSummarySections,
  getWorkspacePredictedExamPrompt,
  getWorkspaceQuizExportItems,
} from '../data/workspaceKnowledgePack'
import type { MindmapHighlightBookmark } from '../stores/useWorkspaceStore'

const MINDMAP_EXPORT_BG: Record<string, string> = {
  highContrast: '#0f172a',
  softPastel: '#faf5ff',
}

export type KnowledgePackExportContext = {
  lectureTitle: string
  course: string
  lectureId: string
  highlights: MindmapHighlightBookmark[]
}

function slugifyFilenamePart(title: string): string {
  const t = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
  return t.slice(0, 56) || 'bai-giang'
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatMmSs(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Xuất PNG mindmap từ `[data-knowledge-mindmap-export]` (html-to-image, pixelRatio cao).
 */
export async function exportWorkspaceMindmapPng(filenameBase = 'mindmap'): Promise<void> {
  const el = document.querySelector<HTMLElement>('[data-knowledge-mindmap-export]')
  if (!el?.querySelector('svg')) {
    throw new Error('Chưa có sơ đồ mindmap để xuất.')
  }
  const theme = el.getAttribute('data-mindmap-theme') === 'softPastel' ? 'softPastel' : 'highContrast'
  const backgroundColor = MINDMAP_EXPORT_BG[theme] ?? MINDMAP_EXPORT_BG.highContrast
  const { toPng } = await import('html-to-image')
  const dataUrl = await toPng(el, {
    pixelRatio: 3,
    cacheBust: true,
    backgroundColor,
  })
  const a = document.createElement('a')
  const safe = slugifyFilenamePart(filenameBase)
  a.download = `etherai-mindmap-${safe}-${Date.now()}.png`
  a.href = dataUrl
  a.click()
}

export function downloadKnowledgePackMarkdown(ctx: KnowledgePackExportContext): void {
  const md = buildKnowledgePackMarkdown({
    lectureTitle: ctx.lectureTitle,
    course: ctx.course,
    lectureId: ctx.lectureId,
    highlights: ctx.highlights,
    generatedAt: new Date(),
  })
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const slug = slugifyFilenamePart(ctx.lectureTitle)
  triggerBlobDownload(blob, `etherai-knowledge-pack-${slug}.md`)
}

function buildPrintableHtml(ctx: KnowledgePackExportContext, generatedAt: Date): string {
  const sections = getKnowledgePackSummarySections(ctx.lectureTitle, ctx.course)
  const quiz = getWorkspaceQuizExportItems(ctx.lectureId)
  const exam = getWorkspacePredictedExamPrompt()

  const parts: string[] = []
  parts.push(`<h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#e6f1ff">Knowledge Pack</h1>`)
  parts.push(
    `<p style="margin:0 0 20px;font-size:12px;color:#8892b0">${escapeHtml(ctx.lectureTitle)} · ${escapeHtml(ctx.course)} · ${escapeHtml(ctx.lectureId)}<br/>Xuất: ${escapeHtml(generatedAt.toLocaleString('vi-VN'))}</p>`,
  )
  parts.push('<hr style="border:none;border-top:1px solid rgba(124,77,255,0.35);margin:16px 0"/>')

  parts.push(`<h2 style="font-size:17px;color:#7c4dff;margin:20px 0 8px">Tóm tắt (AI)</h2>`)
  for (const s of sections) {
    parts.push(`<h3 style="font-size:15px;color:#e6f1ff;margin:14px 0 6px">${escapeHtml(s.heading)}</h3>`)
    parts.push(`<p style="margin:0 0 10px;color:#e6f1ff">${escapeHtml(s.body)}</p>`)
  }

  parts.push(`<h2 style="font-size:17px;color:#7c4dff;margin:20px 0 8px">Highlights đã lưu</h2>`)
  if (ctx.highlights.length === 0) {
    parts.push(`<p style="color:#8892b0;font-style:italic">Chưa có clip đã lưu.</p>`)
  } else {
    parts.push('<ul style="margin:0;padding-left:20px;color:#e6f1ff">')
    for (const h of ctx.highlights) {
      parts.push(
        `<li style="margin-bottom:6px"><strong>${escapeHtml(h.nodeLabel)}</strong> — ${formatMmSs(h.startSeconds)}–${formatMmSs(h.endSeconds)}</li>`,
      )
    }
    parts.push('</ul>')
  }

  parts.push(`<h2 style="font-size:17px;color:#7c4dff;margin:20px 0 8px">Quiz</h2>`)
  quiz.forEach((q, i) => {
    parts.push(`<p style="margin:12px 0 4px;font-weight:700;color:#e6f1ff">${i + 1}. ${escapeHtml(q.question)}</p>`)
    parts.push('<ul style="margin:0 0 8px;padding-left:20px;color:#e6f1ff">')
    q.options.forEach((opt, j) => {
      const L = String.fromCharCode(65 + j)
      parts.push(`<li style="margin-bottom:4px"><strong>${L}.</strong> ${escapeHtml(opt)}</li>`)
    })
    parts.push('</ul>')
    const ans = String.fromCharCode(65 + q.correctIndex)
    parts.push(`<p style="margin:0 0 10px;font-size:12px;color:#8892b0">Đáp án gợi ý: ${ans}</p>`)
  })

  parts.push(`<h2 style="font-size:17px;color:#7c4dff;margin:20px 0 8px">Đề dự đoán</h2>`)
  parts.push(`<p style="color:#e6f1ff;font-style:italic">${escapeHtml(exam)}</p>`)
  parts.push(
    '<p style="margin-top:28px;font-size:11px;color:#8892b0">EtherAI — AI Video-to-Knowledge Roadmap</p>',
  )

  return `<div style="max-width:720px">${parts.join('')}</div>`
}

/**
 * PDF: rasterize khối HTML (UTF-8 / tiếng Việt) qua html-to-image, chia trang A4 với jsPDF.
 */
export async function downloadKnowledgePackPdf(ctx: KnowledgePackExportContext): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const { toPng } = await import('html-to-image')

  const generatedAt = new Date()
  const host = document.createElement('div')
  host.setAttribute('lang', 'vi')
  host.innerHTML = buildPrintableHtml(ctx, generatedAt)
  host.style.cssText =
    'position:fixed;left:-24000px;top:0;width:720px;padding:32px 36px;background:#0a192f;color:#e6f1ff;font-family:system-ui,Segoe UI,Roboto,sans-serif'
  document.body.appendChild(host)

  try {
    const dataUrl = await toPng(host, {
      pixelRatio: 2,
      backgroundColor: '#0a192f',
      cacheBust: true,
    })
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()

    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Không tải được ảnh nội dung PDF.'))
      img.src = dataUrl
    })

    const imgW = pageW
    const imgH = (img.height * imgW) / img.width
    let heightLeft = imgH
    let position = 0

    pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH)
    heightLeft -= pageH

    while (heightLeft > 0) {
      position = heightLeft - imgH
      pdf.addPage()
      pdf.addImage(dataUrl, 'PNG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }

    const slug = slugifyFilenamePart(ctx.lectureTitle)
    pdf.save(`etherai-knowledge-pack-${slug}.pdf`)
  } finally {
    document.body.removeChild(host)
  }
}
