import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { NeuralFlowGraphNode } from '../../lib/mindmapToReactFlow'

function NeuralNodeInner({ data }: NodeProps<NeuralFlowGraphNode>) {
  const { label, label_full, highlight, isRoot } = data

  return (
    <div
      lang="vi"
      className="ds-surface-glass relative max-w-[240px] min-w-[120px] rounded-ds-lg border border-ds-border px-3 py-2 shadow-ds-soft backdrop-blur-[10px]"
      title={[label_full, highlight].filter(Boolean).join('\n\n') || label}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-0 !bg-ds-primary/50 !opacity-0"
      />
      <p
        className={`line-clamp-4 text-left font-body text-[13px] leading-snug text-ds-text-primary break-words hyphens-none ${
          isRoot ? 'font-semibold' : 'font-medium'
        }`}
      >
        {label}
      </p>
      {highlight?.trim() ? (
        <p className="mt-1.5 line-clamp-4 border-t border-ds-border/50 pt-1.5 text-left text-[11px] leading-snug text-ds-text-secondary">
          {highlight}
        </p>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-ds-primary/50 !opacity-0"
      />
    </div>
  )
}

export const NeuralNode = memo(NeuralNodeInner)
