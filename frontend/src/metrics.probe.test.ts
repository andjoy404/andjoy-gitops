import { describe, it } from 'vitest'
import cytoscape from 'cytoscape'
import { stubMatchMedia, stubGetComputedStyle } from './test-utils/test-helpers'
import {
  createLayoutConfig, seedPositions, fanLeavesAroundHubs, reduceEdgeCrossings,
  layoutCost, segmentsCross, nodeSize,
} from './components/graph/RelationsGraphViewport'

const makeCore = (elements: any[]) =>
  cytoscape({ renderer: { name: 'null' }, elements, style: [{ selector: 'node', style: { width: 46, height: 46 } }] })

const straightCrossings = (cy: any) => {
  const edges = cy.edges()
  const ep = edges.map((e: any) => [e.data('source'), e.data('target')] as [string, string])
  let count = 0
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      if ([ep[i][0], ep[i][1]].includes(ep[j][0]) || [ep[i][0], ep[i][1]].includes(ep[j][1])) continue
      count += segmentsCross(cy.getElementById(ep[i][0]).position(), cy.getElementById(ep[i][1]).position(),
        cy.getElementById(ep[j][0]).position(), cy.getElementById(ep[j][1]).position()) ? 1 : 0
    }
  return count
}

const overlaps = (cy: any) => {
  const ns = cy.nodes().map((n: any) => ({ id: n.id(), x: n.position('x'), y: n.position('y'), type: n.data('type') }))
  const sizes = ns.map((n: any) => nodeSize(n.type))
  let c = 0
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const gap = 1
      if (Math.abs(ns[i].x - ns[j].x) < (sizes[i].w + sizes[j].w) / 2 - gap &&
          Math.abs(ns[i].y - ns[j].y) < (sizes[i].h + sizes[j].h) / 2 - gap) c++
    }
  return c
}

describe('metrics probe', () => {
  it('dense 61n: before vs after polish', () => {
    stubMatchMedia(); stubGetComputedStyle()
    const els: any[] = [{ data: { id: 'project:1', type: 'project' } }]
    for (let i = 0; i < 6; i++) {
      els.push({ data: { id: `branch:1:${i}`, type: 'branch' } })
      els.push({ data: { id: `pb${i}`, source: 'project:1', target: `branch:1:${i}`, type: 'project-branch' } })
      for (let k = 0; k < 3; k++) {
        els.push({ data: { id: `pipel:1:${i}:${k}`, type: 'pipeline' } })
        els.push({ data: { id: `bpl${i}_${k}`, source: `branch:1:${i}`, target: `pipel:1:${i}:${k}`, type: 'branch-pipeline' } })
        for (let j = 0; j < 2; j++) {
          els.push({ data: { id: `job:1:${i}:${k}:${j}`, type: 'job' } })
          els.push({ data: { id: `plj${i}_${k}_${j}`, source: `pipel:1:${i}:${k}`, target: `job:1:${i}:${k}:${j}`, type: 'pipeline-job' } })
        }
      }
    }
    const n = 61, e = 60
    const cy = makeCore(els.map((el: any) => ({ ...el })))
    seedPositions(cy)
    const t0 = Date.now()
    cy.layout(createLayoutConfig('project-branch-pipeline-jobs', n, e) as any).run()
    const layoutMs = Date.now() - t0
    const beforeCross = straightCrossings(cy)
    const beforeOv = overlaps(cy)
    const beforeTotal = layoutCost(
      cy.nodes().map((nd: any) => ({ id: nd.id(), x: nd.position('x'), y: nd.position('y'), type: nd.data('type') })),
      cy.edges().map((ed: any) => [ed.data('source'), ed.data('target')] as [string, string]),
    )
    const t1 = Date.now()
    fanLeavesAroundHubs(cy)
    const t2 = Date.now()
    reduceEdgeCrossings(cy, 200)
    const t3 = Date.now()
    const afterCross = straightCrossings(cy)
    const afterOv = overlaps(cy)
    const afterTotal = layoutCost(
      cy.nodes().map((nd: any) => ({ id: nd.id(), x: nd.position('x'), y: nd.position('y'), type: nd.data('type') })),
      cy.edges().map((ed: any) => [ed.data('source'), ed.data('target')] as [string, string]),
    )
    console.log(`cose=${layoutMs}ms fan=${t2 - t1}ms polish=${t3 - t2}ms | crosses ${beforeCross}→${afterCross} | overlaps ${beforeOv}→${afterOv} | total ${beforeTotal}→${afterTotal}`)
    cy.destroy()
  })
})
