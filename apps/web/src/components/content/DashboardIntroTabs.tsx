import { useState } from 'react'
import { LlmFriendlyGlossary } from './LlmFriendlyGlossary'
import { SemanticIntroBlocks } from './SemanticIntroBlocks'
import { TechnologyStackLlm } from './TechnologyStackLlm'

const TABS = [
  { id: 'overview' as const, label: 'Tổng quan' },
  { id: 'how' as const, label: 'Cách hoạt động' },
  { id: 'glossary' as const, label: 'Thuật ngữ' },
]

type TabId = (typeof TABS)[number]['id']

type DashboardIntroTabsProps = {
  /** Bỏ khung glass (khi bọc trong `details` đã có viền). */
  noCard?: boolean
}

/**
 * Giới thiệu EtherAI dạng tab — gọn hơn so với xếp nhiều khối văn bản dọc trang.
 */
export function DashboardIntroTabs({ noCard }: DashboardIntroTabsProps) {
  const [tab, setTab] = useState<TabId>('overview')

  const inner = (
    <>
      <p className="ds-text-label mb-4 text-ds-secondary !leading-normal">Về sản phẩm</p>
      <div
        role="tablist"
        aria-label="Chọn phần giới thiệu"
        className="flex flex-wrap gap-2 border-b border-ds-border/50 pb-3.5 pt-1"
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            id={`dash-tab-${id}`}
            aria-controls={`dash-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            className={`ds-interactive rounded-ds-sm px-3 py-2 text-xs font-bold uppercase tracking-wider sm:px-4 sm:text-sm ${
              tab === id
                ? 'bg-ds-primary/15 text-ds-secondary ring-1 ring-ds-primary/35'
                : 'text-ds-text-secondary hover:bg-ds-border/25'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="scrollbar-hide mt-4 max-h-[min(52vh,28rem)] overflow-y-auto pr-1 sm:max-h-none sm:overflow-visible">
        {tab === 'overview' && (
          <div
            role="tabpanel"
            id="dash-panel-overview"
            aria-labelledby="dash-tab-overview"
            className="space-y-5"
          >
            <SemanticIntroBlocks condensed />
          </div>
        )}
        {tab === 'how' && (
          <div role="tabpanel" id="dash-panel-how" aria-labelledby="dash-tab-how">
            <TechnologyStackLlm compact embedded />
          </div>
        )}
        {tab === 'glossary' && (
          <div role="tabpanel" id="dash-panel-glossary" aria-labelledby="dash-tab-glossary">
            <LlmFriendlyGlossary compact embedded />
          </div>
        )}
      </div>
    </>
  )

  if (noCard) {
    return (
      <div className="space-y-0" aria-label="Giới thiệu EtherAI">
        {inner}
      </div>
    )
  }

  return (
    <section
      className="ds-surface-glass rounded-ds-lg border border-ds-border p-4 shadow-ds-soft backdrop-blur-[10px] sm:p-5"
      aria-label="Giới thiệu EtherAI"
    >
      {inner}
    </section>
  )
}
