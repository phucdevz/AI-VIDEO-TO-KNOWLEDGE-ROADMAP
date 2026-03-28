/**
 * Chosen stack (see product README / pipeline):
 * - Video: react-player (YouTube + file URLs; seek API for Deep Time-Linking)
 * - Mindmap: mermaid (diagram-as-code from Gemini); react-flow optional for freeform editing later
 * - Charts: recharts (radar, bars; heatmaps as CSS grid + tokens)
 * - State: zustand (workspace seek + UI); Context only if tiny leaf scope
 */

export const STACK = {
  video: 'react-player',
  mindmap: 'mermaid',
  charts: 'recharts',
  state: 'zustand',
} as const
