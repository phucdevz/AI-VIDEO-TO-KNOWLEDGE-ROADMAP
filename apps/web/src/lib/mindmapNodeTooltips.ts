import tippy, { type Instance } from 'tippy.js'
import 'tippy.js/dist/tippy.css'

import { extractMindmapNodeLabel } from './mindmapLearning'
import { getMindmapNodeAiSummary } from './mindmapNodeAiSummaries'

/**
 * Smart tooltip (Tippy) trên từng `g.node` Mermaid — theme `ds-mindmap-tooltip` trong index.css.
 */
export function bindMindmapSmartTooltips(svgEl: SVGElement): () => void {
  const instances: Instance[] = []

  svgEl.querySelectorAll('g.node, g[class*="node"]').forEach((node) => {
    const label = extractMindmapNodeLabel(node)
    const summary = getMindmapNodeAiSummary(label)
    node.removeAttribute('title')
    if (label.length > 0) {
      node.setAttribute('aria-label', `${label}. ${summary}`)
    }

    const inst = tippy(node as Element, {
      content: summary,
      placement: 'top',
      animation: 'shift-away',
      duration: [200, 150],
      theme: 'ds-mindmap-tooltip',
      arrow: false,
      maxWidth: 300,
      appendTo: () => document.body,
      offset: [0, 10],
      interactive: false,
      zIndex: 360,
      delay: [100, 40],
      touch: ['hold', 450],
      moveTransition: 'transform 0.15s ease-out',
    })
    instances.push(inst)
  })

  return () => {
    for (const i of instances) {
      i.destroy()
    }
  }
}
