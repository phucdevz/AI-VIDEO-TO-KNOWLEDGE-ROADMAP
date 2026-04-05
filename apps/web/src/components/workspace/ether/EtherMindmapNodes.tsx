import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { EtherMindmapNode } from '../../../lib/etherMindmapTypes'
import { ETHER_QUADRANT_FILL } from '../../../lib/etherMindmapTypes'

const HID = '!h-2 !w-2 !min-h-0 !min-w-0 !border-0 !bg-transparent !opacity-0'

function EtherCentralInner({ data }: NodeProps<EtherMindmapNode>) {
  const tip = [data.label_full, data.highlight].filter(Boolean).join('\n\n') || data.label
  return (
    <div
      className="flex min-w-[160px] max-w-[320px] flex-col items-center justify-center rounded-[28px] border border-slate-700/80 bg-gradient-to-b from-slate-900 to-slate-950 px-8 py-3.5 text-center shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      title={tip}
    >
      <Handle id="t" type="target" position={Position.Top} className={HID} />
      <Handle id="b" type="source" position={Position.Bottom} className={HID} />
      <Handle id="l" type="source" position={Position.Left} className={HID} />
      <Handle id="r" type="source" position={Position.Right} className={HID} />
      <span className="text-[15px] font-semibold tracking-tight text-white">{data.label}</span>
      {data.highlight?.trim() ? (
        <p className="mt-2 max-w-[300px] text-left text-[11px] font-normal leading-snug text-slate-300 line-clamp-4">
          {data.highlight}
        </p>
      ) : null}
      {data.label_full && data.label_full !== data.label ? (
        <span className="mt-1 line-clamp-2 max-w-[280px] text-[11px] font-normal leading-snug text-slate-400">
          {data.label_full}
        </span>
      ) : null}
    </div>
  )
}

function EtherPillInner({ data }: NodeProps<EtherMindmapNode>) {
  const raw = data.branchKey ?? data.quadrant
  const q = raw === 'center' ? 'tl' : raw
  const fill = ETHER_QUADRANT_FILL[q] ?? 'bg-slate-600 text-white'
  const isDetail = data.role === 'detail'

  const tip = [data.label_full, data.highlight].filter(Boolean).join('\n\n') || data.label
  return (
    <div
      className={`flex flex-col items-stretch border border-black/10 text-left shadow-md ${
        isDetail
          ? `max-w-[200px] min-w-[80px] rounded-xl px-2.5 py-1.5 ${fill}`
          : `max-w-[280px] min-w-[100px] rounded-2xl px-3.5 py-2 ${fill}`
      }`}
      title={tip}
    >
      <Handle id="lt" type="target" position={Position.Left} className={HID} />
      <Handle id="ls" type="source" position={Position.Left} className={HID} style={{ top: '62%' }} />
      <Handle id="rt" type="target" position={Position.Right} className={HID} />
      <Handle id="rs" type="source" position={Position.Right} className={HID} style={{ top: '62%' }} />
      <Handle id="tt" type="target" position={Position.Top} className={HID} />
      <Handle id="bs" type="source" position={Position.Bottom} className={HID} />
      <span
        className={`text-center font-semibold leading-snug ${isDetail ? 'text-[10px]' : 'text-[12px] leading-tight'}`}
      >
        {data.label}
      </span>
      {!isDetail && data.highlight?.trim() ? (
        <p className="mt-1.5 border-t border-black/15 pt-1.5 text-[10px] font-normal leading-snug line-clamp-4 opacity-95">
          {data.highlight}
        </p>
      ) : null}
      {isDetail && data.highlight?.trim() ? (
        <p className="mt-1 border-t border-black/20 pt-1 text-[9px] font-normal leading-snug line-clamp-2 opacity-90">
          {data.highlight}
        </p>
      ) : null}
    </div>
  )
}

export const EtherCentralNode = memo(EtherCentralInner)
export const EtherPillNode = memo(EtherPillInner)
