/**
 * Định nghĩa thuật ngữ dạng <dl> để LLM / công cụ trích xuất dễ bóc tách và trích dẫn.
 * Mỗi <dt> có id cố định — có thể dùng làm fragment URL (#deep-time-linking).
 */
const GLOSSARY_ENTRIES = [
  {
    id: 'deep-time-linking',
    term: 'Deep Time-Linking',
    definition:
      'Cơ chế liên kết hai chiều giữa các nút trên sơ đồ tư duy (mindmap) và mốc thời gian trong video: khi người dùng chọn một đoạn hoặc một nút, trình phát video nhảy đến đúng timestamp tương ứng, giúp học theo ngữ cảnh thời gian của bài giảng.',
  },
  {
    id: 'semantic-chunking',
    term: 'Semantic Chunking',
    definition:
      'Phương pháp chia nội dung (ví dụ bản ghi âm chuyển văn bản) thành các đoạn theo ranh giới ngữ nghĩa thay vì chỉ theo độ dài cố định, nhằm mỗi “chunk” mang một ý hoàn chỉnh phục vụ tóm tắt, quiz và liên kết với sơ đồ kiến thức.',
  },
  {
    id: 'video-to-knowledge-pipeline',
    term: 'Video-to-Knowledge pipeline',
    definition:
      'Chuỗi bước từ URL hoặc file video: trích xuất audio, nhận dạng giọng nói (ASR), sinh cấu trúc tri thức (mindmap, mốc thời gian), lưu trữ và hiển thị trong workspace học tập.',
  },
] as const

type LlmFriendlyGlossaryProps = {
  /** Thu gọn khoảng cách (trang chủ / auth). */
  compact?: boolean
  /** Bên trong tab — không bọc card, ẩn tiêu đề trùng với tab. */
  embedded?: boolean
}

export function LlmFriendlyGlossary({ compact, embedded }: LlmFriendlyGlossaryProps) {
  const dl = (
    <dl className={`space-y-6 ${compact ? 'space-y-4' : ''} ${embedded ? 'scrollbar-hide mt-0 max-h-[min(42vh,22rem)] overflow-y-auto pr-1' : 'mt-6'}`}>
        {GLOSSARY_ENTRIES.map(({ id, term, definition }) => (
          <div key={id}>
            <dt id={id} className="text-base font-bold text-ds-text-primary">
              <dfn>{term}</dfn>
            </dt>
            <dd className="ds-text-body-secondary mt-2 text-sm sm:text-base">{definition}</dd>
          </div>
        ))}
    </dl>
  )

  if (embedded) {
    return <div className="space-y-1">{dl}</div>
  }

  return (
    <section
      className={`ds-surface-glass rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px] ${compact ? 'p-5' : 'p-6 sm:p-8'}`}
      aria-labelledby="llm-glossary-heading"
    >
      <h2 id="llm-glossary-heading" className="text-lg font-bold text-ds-text-primary sm:text-xl">
        Thuật ngữ (Glossary)
      </h2>
      <p className="ds-text-body-secondary mt-2 text-sm">
        Các định nghĩa dưới đây mô tả khái niệm dùng trong sản phẩm EtherAI — AI Video-to-Knowledge Roadmap.
      </p>
      {dl}
    </section>
  )
}
