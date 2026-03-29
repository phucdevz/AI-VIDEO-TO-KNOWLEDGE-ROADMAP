import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { NeuralFlowGraphNode } from '../../lib/mindmapToReactFlow'

function NeuralNodeInner({ data }: NodeProps<NeuralFlowGraphNode>) {
  const { label, isRoot } = data

  return (
    <div
      className="ds-surface-glass relative max-w-[220px] min-w-[140px] rounded-ds-lg border border-ds-border px-4 py-2.5 shadow-ds-soft backdrop-blur-[10px]"
      title={label}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !border-0 !bg-ds-primary/50 !opacity-0"
      />
      <p
        className={`line-clamp-3 text-center font-body text-[14px] leading-snug text-ds-text-primary ${
          isRoot ? 'font-semibold' : 'font-medium'
        }`}
      >
        {label}
      </p>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !border-0 !bg-ds-primary/50 !opacity-0"
      />
    </div>
  )
}

export const NeuralNode = memo(NeuralNodeInner)
