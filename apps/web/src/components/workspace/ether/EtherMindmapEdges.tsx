import { getBezierPath, type EdgeProps } from '@xyflow/react'
import type { EtherMindmapEdge } from '../../../lib/etherMindmapTypes'

/**
 * Smooth Bézier stems (reference mind maps); stroke from branch quadrant.
 * Stroke width can come from `data.strokeWidth` (thinner toward leaves).
 */
export function EtherBezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<EtherMindmapEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.28,
  })
  const stroke = data?.stroke ?? '#94a3b8'
  const active = Boolean(data?.active)
  const w = data?.strokeWidth ?? (active ? 3 : 2.6)
  return (
    <>
      <path
        id={id}
        d={path}
        fill="none"
        className="ether-bezier-edge"
        stroke={stroke}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {active ? (
        <path
          id={`${id}-glow`}
          d={path}
          fill="none"
          stroke="rgba(0,229,255,0.5)"
          strokeWidth={w + 2}
          strokeLinecap="round"
          strokeDasharray="10 24"
          className="ether-bezier-edge-led"
        />
      ) : null}
    </>
  )
}

export function EtherCrossLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<EtherMindmapEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.32,
  })
  return (
    <path
      id={id}
      d={path}
      fill="none"
      stroke="#64748b"
      strokeWidth={1.75}
      strokeDasharray="8 10"
      strokeLinecap="round"
      className="opacity-90"
    />
  )
}
