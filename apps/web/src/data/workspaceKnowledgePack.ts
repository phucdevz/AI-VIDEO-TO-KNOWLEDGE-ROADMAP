import type { MindmapHighlightBookmark } from '../stores/useWorkspaceStore'

/** Câu hỏi trắc nghiệm xuất kèm Knowledge Pack (đáp án gợi ý khi in/ôn offline). */
export type WorkspaceQuizExportItem = {
  question: string
  options: string[]
  /** 0–3 */
  correctIndex: number
}

const DEFAULT_QUIZ_PACK: WorkspaceQuizExportItem[] = [
  {
    question: 'Self-attention kết hợp biểu diễn token như thế nào?',
    options: [
      'Chỉ softmax cố định trên từ vựng',
      'Trọng số liên quan theo cặp (Q·K) rồi nhân V',
      'Hàng đợi FIFO trên batch',
      'Chỉ dropout trên nhãn',
    ],
    correctIndex: 1,
  },
  {
    question: 'Ưu điểm chính của Transformer so với RNN tuần tự là gì?',
    options: [
      'Ít tham số hơn mọi kiến trúc',
      'Song song hóa theo chiều chuỗi và bắt xa phụ thuộc trực tiếp',
      'Không cần embedding',
      'Chỉ huấn luyện trên CPU',
    ],
    correctIndex: 1,
  },
  {
    question: 'Multi-head attention nhằm mục đích gì?',
    options: [
      'Giảm chiều ẩn xuống 1',
      'Học nhiều không gian con attention, bắt nhiều kiểu quan hệ',
      'Loại bỏ softmax',
      'Thay thế hoàn toàn lớp dense',
    ],
    correctIndex: 1,
  },
  {
    question: 'Độ phức tạp của self-attention theo độ dài chuỗi L (đơn giản hóa) thường là?',
    options: ['O(L)', 'O(L log L)', 'O(L²)', 'O(1)'],
    correctIndex: 2,
  },
]

const LECTURE_QUIZ_OVERRIDES: Record<string, WorkspaceQuizExportItem[]> = {
  /* Transformer Attention — NLP */
  '4': [
    ...DEFAULT_QUIZ_PACK.slice(0, 2),
    {
      question: 'Trong encoder-only (ví dụ BERT), mask nào thường được dùng?',
      options: [
        'Causal mask (chỉ nhìn quá khứ)',
        'Bi-directional mask đầy đủ (mọi token nhìn được nhau)',
        'Chỉ nhìn padding token',
        'Không dùng mask',
      ],
      correctIndex: 1,
    },
    {
      question: 'Positional encoding được thêm vào vì?',
      options: [
        'Giảm chiều embedding',
        'Self-attention hoán vị — cần tín hiệu vị trí',
        'Thay thế softmax',
        'Chỉ để giảm loss',
      ],
      correctIndex: 1,
    },
  ],
}

export function getWorkspaceQuizExportItems(lectureId: string): WorkspaceQuizExportItem[] {
  return LECTURE_QUIZ_OVERRIDES[lectureId] ?? DEFAULT_QUIZ_PACK
}

/** Gợi ý đề ôn (vault) — dùng chung cho Markdown/PDF. */
export function getWorkspacePredictedExamPrompt(): string {
  return 'Chứng minh độ phức tạp của multi-head attention theo độ dài chuỗi L và số đầu h; so sánh với một lớp conv 1D có cùng receptive field cục bộ.'
}

export type KnowledgePackSummarySection = { heading: string; body: string }

export function getKnowledgePackSummarySections(
  lectureTitle: string,
  course: string,
): KnowledgePackSummarySection[] {
  return [
    {
      heading: 'Tổng quan bài',
      body: `Bài «${lectureTitle}» (${course}) — bản tóm tắt dự kiến từ pipeline AI (Gemini + transcript). Khi backend kết nối, mỗi mục sẽ được cập nhật theo đúng nội dung phát biểu trong video.`,
    },
    {
      heading: 'Mục tiêu học tập',
      body: 'Nắm khái niệm cốt lõi, liên kết mốc thời gian (deep time-linking) với sơ đồ mindmap, và ôn qua bộ câu hỏi đính kèm.',
    },
    {
      heading: 'Ôn tập nhanh',
      body: 'Sử dụng mốc trên thanh tiến độ và Highlights (clip đã lưu) để lặp phần chưa chắc; xuất Knowledge Pack để học offline.',
    },
  ]
}

export function buildKnowledgePackMarkdown(opts: {
  lectureTitle: string
  course: string
  lectureId: string
  highlights: MindmapHighlightBookmark[]
  generatedAt: Date
}): string {
  const quiz = getWorkspaceQuizExportItems(opts.lectureId)
  const sections = getKnowledgePackSummarySections(opts.lectureTitle, opts.course)
  const exam = getWorkspacePredictedExamPrompt()
  const ts = opts.generatedAt.toISOString()

  const lines: string[] = []
  lines.push(`# Knowledge Pack — ${opts.lectureTitle}`)
  lines.push('')
  lines.push(`**Khóa học:** ${opts.course}  `)
  lines.push(`**ID bài:** ${opts.lectureId}  `)
  lines.push(`**Xuất lúc:** ${ts}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Tóm tắt (AI)')
  lines.push('')
  for (const s of sections) {
    lines.push(`### ${s.heading}`)
    lines.push('')
    lines.push(s.body)
    lines.push('')
  }
  lines.push('---')
  lines.push('')
  lines.push('## Highlights đã lưu (workspace)')
  lines.push('')
  if (opts.highlights.length === 0) {
    lines.push('*(Chưa có mục nào — lưu từ mindmap: chuột phải nút → Lưu vào mục ưa thích.)*')
  } else {
    for (const h of opts.highlights) {
      const mm = (sec: number) => {
        const m = Math.floor(sec / 60)
        const s = Math.floor(sec % 60)
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      }
      lines.push(`- **${h.nodeLabel}** — ${mm(h.startSeconds)}–${mm(h.endSeconds)}`)
    }
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('## Quiz (ôn tập)')
  lines.push('')
  quiz.forEach((q, i) => {
    lines.push(`### Câu ${i + 1}`)
    lines.push('')
    lines.push(q.question)
    lines.push('')
    q.options.forEach((opt, j) => {
      const letter = String.fromCharCode(65 + j)
      lines.push(`- **${letter}.** ${opt}`)
    })
    const ans = String.fromCharCode(65 + q.correctIndex)
    lines.push('')
    lines.push(`*Đáp án gợi ý: ${ans}*`)
    lines.push('')
  })
  lines.push('---')
  lines.push('')
  lines.push('## Đề dự đoán (instructor vault)')
  lines.push('')
  lines.push(exam)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('*EtherAI — AI Video-to-Knowledge Roadmap*')
  return lines.join('\n')
}
