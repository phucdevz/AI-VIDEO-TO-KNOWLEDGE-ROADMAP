/**
 * Chosen stack (see product README / pipeline):
 * - Video: react-player (YouTube + file URLs; seek API for Deep Time-Linking)
 * - Mindmap: @xyflow/react (infinite canvas); pipeline may still emit mindmap JSON → converter
 * - Charts: recharts (radar, bars; heatmaps as CSS grid + tokens)
 * - State: zustand (workspace seek + UI); Context only if tiny leaf scope
 */

export const STACK = {
  video: 'react-player',
  mindmap: 'react-flow',
  charts: 'recharts',
  state: 'zustand',
} as const
