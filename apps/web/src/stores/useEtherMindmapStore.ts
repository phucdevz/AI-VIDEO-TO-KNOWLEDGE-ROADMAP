import { create } from 'zustand'
import type { EtherMindmapEdge, EtherMindmapNode } from '../lib/etherMindmapTypes'

/**
 * Canonical mindmap graph for EtherAI (positions update when user drags nodes on canvas).
 * Pipeline hydrates from backend; demo fills when workspace has no react_flow yet.
 */
type EtherMindmapState = {
  nodes: EtherMindmapNode[]
  edges: EtherMindmapEdge[]
  setMindmapGraph: (nodes: EtherMindmapNode[], edges: EtherMindmapEdge[]) => void
}

export const useEtherMindmapStore = create<EtherMindmapState>((set) => ({
  nodes: [],
  edges: [],
  setMindmapGraph: (nodes, edges) => set({ nodes, edges }),
}))
