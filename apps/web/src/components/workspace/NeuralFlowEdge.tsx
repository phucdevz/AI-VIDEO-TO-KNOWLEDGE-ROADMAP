import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react'
import type { NeuralFlowGraphEdge } from '../../lib/mindmapToReactFlow'

/**
 * Bezier edge: static ds-text-secondary base + ds-secondary LED dash (only when `data.active`).
 */
export function NeuralFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<NeuralFlowGraphEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const active = Boolean(data?.active)
  return (
    <>
      <BaseEdge id={id} path={path} className="neural-edge-base" />
      {active ? (
        <BaseEdge id={`${id}-led`} path={path} className="neural-edge-led" />
      ) : null}
    </>
  )
}
