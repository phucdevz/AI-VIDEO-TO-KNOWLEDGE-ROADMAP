import mermaid from 'mermaid'

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'dark' })
const def = `mindmap
  root((Lecture core))
    Concepts
      Attention
      Transformers
    Skills
      Implementation
      Evaluation`
const { svg } = await mermaid.render('t1', def)
console.log(svg.slice(0, 6000))
