import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import cytoscape from 'cytoscape'
import { stubMatchMedia, stubGetComputedStyle } from '../../test-utils/test-helpers'
import RelationsGraphViewport, {
  createLayoutConfig,
  createCytoscapeDefaultConfig,
  segmentsCross,
  nodeSize,
  layoutCost,
  seedPositions,
  fanLeavesAroundHubs,
  reduceEdgeCrossings,
  buildFanCtx,
  planLeafFan,
  fanScore,
  edgeLengthVariance,
  collectDescendants,
  subtreeTargets,
} from './RelationsGraphViewport'

const mockFetch = vi.fn()
global.fetch = mockFetch as any

// Real (headless) Cytoscape core — the "null" renderer needs no canvas, so
// layout code runs deterministically under jsdom.
const makeCore = (elements: any[], style: any[] = []) =>
  cytoscape({ renderer: { name: 'null' }, elements, style })

// Total ugliness score (crossings + edge-through-node + node overlap) for a
// live core, using each node's CSS size so overlaps match the rendered graph.
const scoreOf = (cy: any) =>
  layoutCost(
    cy.nodes().map((nd: any) => ({ id: nd.id(), x: nd.position('x'), y: nd.position('y'), type: nd.data('type') })),
    cy.edges().map((e: any) => [e.data('source'), e.data('target')] as [string, string]),
  )

// Rounded, id-sorted position snapshot for stability comparisons.
const snapshotOf = (cy: any) =>
  JSON.stringify(
    cy.nodes()
      .map((nd: any) => [nd.id(), Math.round(nd.position('x')), Math.round(nd.position('y'))])
      .sort((a: any, b: any) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  )

const straightCrossings = (cy: any) => {
  const edges = cy.edges()
  const ep = edges.map((e: any) => [e.data('source'), e.data('target')] as [string, string])
  let count = 0
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [a1, a2] = ep[i]
      const [b1, b2] = ep[j]
      // Edges that share a node meet there, never "cross".
      if ([a1, a2].includes(b1) || [a1, a2].includes(b2)) continue
      count += segmentsCross(
        cy.getElementById(a1).position(), cy.getElementById(a2).position(),
        cy.getElementById(b1).position(), cy.getElementById(b2).position(),
      ) ? 1 : 0
    }
  return count
}

describe('RelationsGraphViewport', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    vi.clearAllMocks()
    localStorage.clear()
  })

  // ── Organic (COSE) Layout Config Tests ──────────────────
  describe('Organic (COSE) layout config', () => {
    it('uses the force-directed `cose` layout, not a hierarchical one', () => {
      expect(createLayoutConfig().name).toBe('cose')
      // No dagre / hierarchical knobs remain.
      expect(createLayoutConfig().rankDir).toBeUndefined()
      expect(createLayoutConfig().rankSep).toBeUndefined()
      expect(createLayoutConfig().nodeSep).toBeUndefined()
    })

    it('accepts both map types', () => {
      expect(createLayoutConfig('user-group-project').name).toBe('cose')
      expect(createLayoutConfig('project-branch-pipeline-jobs').name).toBe('cose')
    })

    it('scales repulsion and iteration count with graph density', () => {
      const small = createLayoutConfig('project-branch-pipeline-jobs', 10, 10)
      const dense = createLayoutConfig('project-branch-pipeline-jobs', 200, 180)
      expect(small.nodeRepulsion).toBeTypeOf('function')
      expect(small.nodeRepulsion()).toBeGreaterThan(0)
      // Stronger repulsion + more settling for the denser graph.
      expect(dense.nodeRepulsion()).toBeGreaterThan(small.nodeRepulsion())
      expect(dense.numIter).toBeGreaterThan(small.numIter)
    })

    it('low gravity + component spacing → neuron-like clusters', () => {
      const config = createLayoutConfig('user-group-project', 10, 10)
      expect(config.gravity).toBeGreaterThan(0)
      expect(config.gravity).toBeLessThan(0.2) // low gravity → radial, not centered grid
      expect(config.componentSpacing).toBeGreaterThan(0)
      expect(config.idealEdgeLength).toBeGreaterThan(0)
      expect(config.nodeOverlap).toBeGreaterThan(0)
    })

    it('is deterministic (no random init) and fits without animation', () => {
      const config = createLayoutConfig()
      expect(config.randomize).toBe(false)
      expect(config.fit).toBe(true)
      expect(config.animate).toBe(false)
      expect(config.padding).toBeGreaterThan(0)
    })
  })

  // ── Dense organic layout (the original 61-node fixture) ──────
  // project → 6 branches → 3 pipelines → 2 jobs each = 61 nodes / 60 edges.
  describe('Dense organic neuron layout', () => {
    const denseEls = (() => {
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
      return els
    })()
    const n = denseEls.filter((e: any) => !e.data.source).length
    const e = denseEls.length - n

    const runLayout = () => {
      const cy = makeCore(denseEls.map((el: any) => ({ ...el })), [
        { selector: 'node', style: { width: 46, height: 46 } },
      ])
      const t0 = Date.now()
      seedPositions(cy)
      cy.layout(createLayoutConfig('project-branch-pipeline-jobs', n, e) as any).run()
      const layoutMs = Date.now() - t0
      const cose = scoreOf(cy)
      fanLeavesAroundHubs(cy)
      const t1 = Date.now()
      reduceEdgeCrossings(cy)
      const polishMs = Date.now() - t1
      const after = scoreOf(cy)
      const snapStr = snapshotOf(cy)
      cy.destroy()
      return { layoutMs, polishMs, cose, after, snapStr }
    }

    it('optimized score is lower than the raw COSE result', () => {
      const r = runLayout()
      expect(r.after).toBeLessThanOrEqual(r.cose + 2)
    })

    it('repeated runs produce an identical (stable) layout', () => {
      const r1 = runLayout()
      const r2 = runLayout()
      expect(r2.snapStr).toBe(r1.snapStr)
    })

    it('is not rank-aligned like a dagre hierarchy', () => {
      const cy = makeCore(denseEls.map((el: any) => ({ ...el })), [
        { selector: 'node', style: { width: 46, height: 46 } },
      ])
      seedPositions(cy)
      cy.layout(createLayoutConfig('project-branch-pipeline-jobs', n, e) as any).run()
      fanLeavesAroundHubs(cy)
      reduceEdgeCrossings(cy)
      // A dagre TB layout packs 4 depth levels into ~4 distinct y-bands. The
      // organic COSE layout spreads nodes across many y-buckets.
      const ys = cy.nodes().map((nd: any) => nd.position('y'))
      const distinctYBuckets = new Set(ys.map((y: number) => Math.round(y / 45))).size
      expect(distinctYBuckets).toBeGreaterThan(8)
      cy.destroy()
    })

    it('settles within a bounded time for the dense graph', () => {
      const r = runLayout()
      expect(r.layoutMs).toBeLessThan(500)
      expect(r.polishMs).toBeLessThan(300)
    })
  })

  // ── Cytoscape Config Tests ──────────────────────────────
  describe('Cytoscape configuration', () => {
    it('panning enabled', () => {
      const config = createCytoscapeDefaultConfig()
      expect(config.userPanningEnabled).toBe(true)
      expect(config.panningEnabled).toBe(true)
    })

    it('zooming enabled with bounds', () => {
      const config = createCytoscapeDefaultConfig()
      expect(config.userZoomingEnabled).toBe(true)
      expect(config.minZoom).toBe(0.1)
      expect(config.maxZoom).toBe(3)
    })

    it('box selection enabled', () => {
      const config = createCytoscapeDefaultConfig()
      expect(config.boxSelectionEnabled).toBe(true)
    })

    it('wheel sensitivity configured', () => {
      const config = createCytoscapeDefaultConfig()
      expect(config.wheelSensitivity).toBe(0.3)
    })
  })

  // ── Rendering Tests ─────────────────────────────────────
  describe('rendering', () => {
    it('shows loading text when mounting', () => {
      const onNodeSelect = vi.fn()
      const onNodeHover = vi.fn()
      render(
        <RelationsGraphViewport
          elements={[]}
          mapType="user-group-project"
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
        />,
      )
      expect(screen.getByText(/Loading graph/i)).toBeInTheDocument()
    })
  })

  // ── Element Types ───────────────────────────────────────
  describe('graph element types', () => {
    it('accepts user-group-project map type', () => {
      const onNodeSelect = vi.fn()
      const onNodeHover = vi.fn()
      const elements = [
        { data: { id: 'user:1', type: 'user', label: 'test' } },
        { data: { id: 'group:1', type: 'group', label: 'test' } },
        { data: { id: 'project:1', type: 'project', label: 'test' } },
        { data: { id: 'user:1->group:1', source: 'user:1', target: 'group:1', type: 'user-group' } },
      ]
      render(
        <RelationsGraphViewport
          elements={elements as any}
          mapType="user-group-project"
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
        />,
      )
    })

    it('accepts project-branch-pipeline-jobs map type', () => {
      const onNodeSelect = vi.fn()
      const onNodeHover = vi.fn()
      const elements = [
        { data: { id: 'project:1', type: 'project', label: 'test' } },
        { data: { id: 'branch:1:main', type: 'branch', label: 'main' } },
        { data: { id: 'pipeline:1', type: 'pipeline', label: 'test' } },
        { data: { id: 'job:1', type: 'job', label: 'test' } },
      ]
      render(
        <RelationsGraphViewport
          elements={elements as any}
          mapType="project-branch-pipeline-jobs"
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
        />,
      )
    })
  })

  // ── Node/Edge Count ─────────────────────────────────────
  describe('node and edge count', () => {
    it('accepts correct number of nodes for user map', () => {
      const onNodeSelect = vi.fn()
      const onNodeHover = vi.fn()
      const elements = [
        { data: { id: 'user:11', type: 'user', label: 'Alice' } },
        { data: { id: 'user:12', type: 'user', label: 'Bob' } },
        { data: { id: 'group:1', type: 'group', label: 'Team A' } },
        { data: { id: 'project:1', type: 'project', label: 'app' } },
      ]
      render(
        <RelationsGraphViewport
          elements={elements as any}
          mapType="user-group-project"
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
        />,
      )
    })
  })

  // ── Edge-crossing reduction ──────────────────────────────
  describe('edge-crossing reduction', () => {
    type NodeCfg = { id: string; type: string; x: number; y: number }

    // Minimal fake core: node.position(obj) writes into a shared posMap so
    // test code can re-count crossings after the optimizer runs.
    const makeFakeCore = (
      nodeCfgs: NodeCfg[],
      edgeCfgs: [string, string][],
    ) => {
      const posMap = new Map<string, { x: number; y: number }>()
      nodeCfgs.forEach((c) => posMap.set(c.id, { x: c.x, y: c.y }))
      const nodes = nodeCfgs.map((c) => ({
        id: () => c.id,
        data: (k: string) => (k === 'type' ? c.type : undefined),
        position: (newPos?: { x: number; y: number }) => {
          if (newPos) {
            posMap.set(c.id, newPos)
            return newPos
          }
          return posMap.get(c.id)!
        },
      }))
      const edges = edgeCfgs.map(([s, t]) => ({
        data: (k: string) => (k === 'source' ? s : k === 'target' ? t : undefined),
      }))
      return { core: { nodes: () => nodes, edges: () => edges } as any, posMap }
    }

    const countCrossings = (
      posMap: Map<string, { x: number; y: number }>,
      edgeCfgs: [string, string][],
    ) => {
      let count = 0
      for (let i = 0; i < edgeCfgs.length; i++) {
        for (let j = i + 1; j < edgeCfgs.length; j++) {
          if (edgeCfgs[i].some((id) => edgeCfgs[j].includes(id))) continue
          const a = posMap.get(edgeCfgs[i][0])!
          const b = posMap.get(edgeCfgs[i][1])!
          const c = posMap.get(edgeCfgs[j][0])!
          const d = posMap.get(edgeCfgs[j][1])!
          if (segmentsCross(a, b, c, d)) count++
        }
      }
      return count
    }

    it('segmentsCross detects intersecting segments', () => {
      expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true)
    })

    it('segmentsCross is false for disjoint and shared-endpoint segments', () => {
      expect(segmentsCross({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 })).toBe(false)
      expect(segmentsCross({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 })).toBe(false)
    })

    it('removes crossings from a crossed 2-edge layout', () => {
      const nodeCfgs: NodeCfg[] = [
        { id: 'A', type: 'x', x: 0, y: 0 },
        { id: 'B', type: 'x', x: 10, y: 10 },
        { id: 'C', type: 'x', x: 0, y: 10 },
        { id: 'D', type: 'x', x: 10, y: 0 },
      ]
      const edgeCfgs: [string, string][] = [['A', 'B'], ['C', 'D']]
      const { core, posMap } = makeFakeCore(nodeCfgs, edgeCfgs)
      expect(countCrossings(posMap, edgeCfgs)).toBe(1)

      reduceEdgeCrossings(core, 200)
      expect(countCrossings(posMap, edgeCfgs)).toBe(0)
    })

    it('does not change an already crossing-free layout', () => {
      const nodeCfgs: NodeCfg[] = [
        { id: 'A', type: 'x', x: 0, y: 0 },
        { id: 'B', type: 'x', x: 10, y: 0 },
        { id: 'C', type: 'x', x: 0, y: 10 },
        { id: 'D', type: 'x', x: 10, y: 10 },
      ]
      const edgeCfgs: [string, string][] = [['A', 'B'], ['C', 'D']]
      const { core, posMap } = makeFakeCore(nodeCfgs, edgeCfgs)
      expect(countCrossings(posMap, edgeCfgs)).toBe(0)

      reduceEdgeCrossings(core, 200)
      expect(countCrossings(posMap, edgeCfgs)).toBe(0)
    })

    it('removes an edge passing through an unrelated node', () => {
      // A(left) — B(right) with C sitting on the segment A→B. C hangs off A,
      // so moving C clears the A→B edge while keeping the graph connected.
      const nodeCfgs: NodeCfg[] = [
        { id: 'A', type: 'x', x: 0, y: 100 },
        { id: 'B', type: 'x', x: 300, y: 100 },
        { id: 'C', type: 'x', x: 150, y: 100 },
      ]
      const edgeCfgs: [string, string][] = [['A', 'B'], ['A', 'C']]
      const { core } = makeFakeCore(nodeCfgs, edgeCfgs)
      const before = layoutCost(nodeCfgs, edgeCfgs)
      expect(before).toBeGreaterThan(0)

      reduceEdgeCrossings(core, 200)
      const after = layoutCost(
        Array.from(core.nodes() as any[]).map((nd: any) => ({
          id: nd.id(),
          x: nd.position().x,
          y: nd.position().y,
          type: nd.data('type'),
        })),
        edgeCfgs,
      )
      expect(after).toBeLessThan(before)
    })
  })

  // ── Leaf-fan refinement ──────────────────────────────────
  describe('leaf-fan refinement', () => {
    // Helpers to build a pure FanCtx without a live cytoscape core.
    const fakeNode = (id: string, x: number, y: number, type: string) => ({
      id: () => id, position: () => ({ x, y }),
      data: (k: string) => (k === 'type' ? type : undefined),
    })
    const fakeEdge = (s: string, t: string) => ({
      data: (k: string) => (k === 'source' ? s : k === 'target' ? t : undefined),
    })

    // Fixture: project → branch (upstream) → pipeline (hub) → 3 job leaves.
    // project keeps the branch at degree 2 (a real non-leaf upstream); the
    // branch sits to the RIGHT of the hub, so the fan faces LEFT.
    const proj = 'proj:p'
    const upstream = 'branch:u'
    const hub = 'pipeline:h'
    const jobs = ['job:a', 'job:b', 'job:c']
    const makeCtx = () => buildFanCtx(
      [
        fakeNode(proj, 380, 0, 'project'),
        fakeNode(upstream, 200, 0, 'branch'),
        fakeNode(hub, 0, 0, 'pipeline'),
        fakeNode(jobs[0], -50, 60, 'job'),
        fakeNode(jobs[1], -80, 0, 'job'),
        fakeNode(jobs[2], -50, -60, 'job'),
      ],
      [
        fakeEdge(proj, upstream),
        fakeEdge(upstream, hub),
        fakeEdge(hub, jobs[0]),
        fakeEdge(hub, jobs[1]),
        fakeEdge(hub, jobs[2]),
      ],
    )

    it('sibling leaves have monotonically ordered angles', () => {
      const ctx = makeCtx()
      const fp = planLeafFan(hub, ctx)
      expect(fp.leaves.length).toBe(3)
      const angles = fp.leaves.map((l) => l.angle)
      for (let i = 1; i < angles.length; i++) {
        expect(angles[i]).toBeGreaterThan(angles[i - 1])
      }
    })

    it('sibling edge lengths stay within a small tolerance (≈0 variance)', () => {
      const ctx = makeCtx()
      const fp = planLeafFan(hub, ctx)
      const lens = fp.leaves.map((l) => l.dist)
      expect(edgeLengthVariance(lens)).toBeLessThan(0.001)
    })

    it('no two leaves share (near) the same position', () => {
      const ctx = makeCtx()
      const fp = planLeafFan(hub, ctx)
      const positions = fp.leaves.map((l) => [l.x, l.y] as const)
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i][0] - positions[j][0]
          const dy = positions[i][1] - positions[j][1]
          expect(Math.hypot(dx, dy)).toBeGreaterThan(10)
        }
      }
    })

    it('fan faces away from the upstream node (all leaves on the opposite side)', () => {
      const ctx = makeCtx()
      const fp = planLeafFan(hub, ctx)
      // Upstream is to the right (x=200), so the fan must face left.
      // The hub is at x=0; every leaf should be to the LEFT of the hub.
      for (const leaf of fp.leaves) {
        expect(leaf.x).toBeLessThan(0)
      }
      // The arc center should be close to π (pointing left).
      const center = (fp.leaves[0].angle + fp.leaves[fp.leaves.length - 1].angle) / 2
      const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
      expect(angDiff(center, Math.PI)).toBeLessThan(0.01)
    })

    it('avoidable crossings decrease after leaf-fan refinement on a live core', () => {
      // Dense 61-node fixture from the organic layout describe block:
      // fanLeavesAroundHubs must not increase the straight-edge crossing count.
      const els: any[] = [{ data: { id: 'project:1', type: 'project' } }]
      for (let i = 0; i < 4; i++) {
        els.push({ data: { id: `branch:${i}`, type: 'branch' } })
        els.push({ data: { id: `pb${i}`, source: 'project:1', target: `branch:${i}`, type: 'project-branch' } })
        for (let k = 0; k < 3; k++) {
          els.push({ data: { id: `pip:${i}:${k}`, type: 'pipeline' } })
          els.push({ data: { id: `bp${i}_${k}`, source: `branch:${i}`, target: `pip:${i}:${k}`, type: 'branch-pipeline' } })
          for (let j = 0; j < 2; j++) {
            els.push({ data: { id: `job:${i}:${k}:${j}`, type: 'job' } })
            els.push({ data: { id: `pj${i}_${k}_${j}`, source: `pip:${i}:${k}`, target: `job:${i}:${k}:${j}`, type: 'pipeline-job' } })
          }
        }
      }
      const n = els.filter((e: any) => !e.data.source).length
      const e = els.length - n
      const runCore = () => {
        const cy = makeCore(els.map((el: any) => ({ ...el })), [{ selector: 'node', style: { width: 46, height: 46 } }])
        seedPositions(cy)
        cy.layout(createLayoutConfig('project-branch-pipeline-jobs', n, e) as any).run()
        const before = straightCrossings(cy)
        fanLeavesAroundHubs(cy)
        const after = straightCrossings(cy)
        cy.destroy()
        return { before, after }
      }
      const r = runCore()
      expect(r.after).toBeLessThanOrEqual(r.before)
    })

    it('repeated runs are deterministic (identical planLeafFan output)', () => {
      const r1 = planLeafFan(hub, makeCtx())
      const r2 = planLeafFan(hub, makeCtx())
      expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
    })

    it('does not reposition hubs or destroy cluster separation', () => {
      const els: any[] = [
        { data: { id: 'proj:A', type: 'project' } },
        { data: { id: 'proj:B', type: 'project' } },
        { data: { id: 'br:A', type: 'branch' } },
        { data: { id: 'br:B', type: 'branch' } },
        { data: { id: 'pa', source: 'proj:A', target: 'br:A', type: 'project-branch' } },
        { data: { id: 'pb', source: 'proj:B', target: 'br:B', type: 'project-branch' } },
        { data: { id: 'pipA', type: 'pipeline' } },
        { data: { id: 'pipB', type: 'pipeline' } },
        { data: { id: 'bpa', source: 'br:A', target: 'pipA', type: 'branch-pipeline' } },
        { data: { id: 'bpb', source: 'br:B', target: 'pipB', type: 'branch-pipeline' } },
        { data: { id: 'jA1', type: 'job' } },
        { data: { id: 'jA2', type: 'job' } },
        { data: { id: 'jB1', type: 'job' } },
        { data: { id: 'jB2', type: 'job' } },
        { data: { id: 'jA1e', source: 'pipA', target: 'jA1', type: 'pipeline-job' } },
        { data: { id: 'jA2e', source: 'pipA', target: 'jA2', type: 'pipeline-job' } },
        { data: { id: 'jB1e', source: 'pipB', target: 'jB1', type: 'pipeline-job' } },
        { data: { id: 'jB2e', source: 'pipB', target: 'jB2', type: 'pipeline-job' } },
      ]
      const n = els.filter((e: any) => !e.data.source).length
      const e = els.length - n
      const cy = makeCore(els.map((el: any) => ({ ...el })), [{ selector: 'node', style: { width: 46, height: 46 } }])
      seedPositions(cy)
      cy.layout(createLayoutConfig('project-branch-pipeline-jobs', n, e) as any).run()
      const px = (id: string, k: 'x' | 'y') => cy.getElementById(id).position(k)
      const ax = px('proj:A', 'x'), ay = px('proj:A', 'y')
      const bx = px('proj:B', 'x'), by = px('proj:B', 'y')
      const distBefore = Math.hypot(ax - bx, ay - by)
      fanLeavesAroundHubs(cy)
      const axA = px('proj:A', 'x'), ayA = px('proj:A', 'y')
      const bxA = px('proj:B', 'x'), byA = px('proj:B', 'y')
      const distAfter = Math.hypot(axA - bxA, ayA - byA)
      // Hubs (project / branch) do not move; inter-cluster separation is preserved.
      expect(axA).toBe(ax)
      expect(ayA).toBe(ay)
      expect(bxA).toBe(bx)
      expect(byA).toBe(by)
      expect(Math.abs(distAfter - distBefore)).toBeLessThan(0.01)
      cy.destroy()
    })
  })

  // ── Theme Tests ─────────────────────────────────────────
  describe('theme configuration', () => {
    it('node colors exist for light theme', () => {
      const onNodeSelect = vi.fn()
      const onNodeHover = vi.fn()
      render(
        <RelationsGraphViewport
          elements={[]}
          mapType="user-group-project"
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
        />,
      )
    })

    it('supports dark theme via class', () => {
      document.documentElement.classList.add('dark-theme')
      const onNodeSelect = vi.fn()
      const onNodeHover = vi.fn()
      render(
        <RelationsGraphViewport
          elements={[]}
          mapType="user-group-project"
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
        />,
      )
      document.documentElement.classList.remove('dark-theme')
    })
  })

  // ── Parent-Drags-Subtree ─────────────────────────────────
  // Dragging a node makes its whole descendant subtree (parent→child edges)
  // follow, each node preserving its original offset from the dragged root.
  describe('parent drags subtree', () => {
    // Small directed tree: root → a, b ; a → c, d ; b → e
    const tree = [
      ['root', 'a'],
      ['root', 'b'],
      ['a', 'c'],
      ['a', 'd'],
      ['b', 'e'],
    ] as [string, string][]
    const pos = (id: string) => {
      const seed: Record<string, { x: number; y: number }> = {
        root: { x: 0, y: 0 },
        a: { x: 100, y: 0 },
        b: { x: -100, y: 0 },
        c: { x: 150, y: 100 },
        d: { x: 50, y: 100 },
        e: { x: -150, y: 100 },
      }
      return { ...seed[id] }
    }

    it('collectDescendants walks the full subtree from the parent', () => {
      const origins = collectDescendants('root', tree, pos)
      // Root + every descendant, nothing more.
      expect([...origins.keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'root'])
    })

    it('collectDescendants isolates to a subtree rooted at an intermediate node', () => {
      const origins = collectDescendants('a', tree, pos)
      expect([...origins.keys()].sort()).toEqual(['a', 'c', 'd'])
    })

    it('collectDescendants is cycle-safe (back-edge to an ancestor ignored)', () => {
      // c→d→b→root would loop back into the tree; the seen-set must cut it off.
      const withCycle = [...tree, ['c', 'd'], ['d', 'b'], ['b', 'root']] as [string, string][]
      const origins = collectDescendants('root', withCycle, pos)
      // Every node is still captured exactly once.
      expect([...origins.keys()].sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'root'])
      expect(origins.get('root')).toStrictEqual(pos('root'))
    })

    it('subtreeTargets translates every descendant by the root delta', () => {
      const origins = collectDescendants('root', tree, pos)
      // Move the root +30x, -20y. Every child keeps its original offset.
      const targets = subtreeTargets(origins, 'root', { x: 30, y: -20 })
      expect(targets.get('a')).toEqual({ x: 130, y: -20 })
      expect(targets.get('b')).toEqual({ x: -70, y: -20 })
      expect(targets.get('c')).toEqual({ x: 180, y: 80 })
      expect(targets.get('d')).toEqual({ x: 80, y: 80 })
      expect(targets.get('e')).toEqual({ x: -120, y: 80 })
      // The dragged root itself is not repositioned by the helper.
      expect(targets.has('root')).toBe(false)
    })

    it('subtreeTargets preserves sibling-relative distances when dragged far', () => {
      const origins = collectDescendants('root', tree, pos)
      const far = { x: 5000, y: -9000 }
      const t = subtreeTargets(origins, 'root', far)
      const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)
      // c–d separation and a–b separation are unchanged by the drag.
      expect(Math.abs(dist(t.get('c')!, t.get('d')!) - dist(pos('c'), pos('d')))).toBeLessThan(0.01)
      expect(Math.abs(dist(t.get('a')!, t.get('b')!) - dist(pos('a'), pos('b')))).toBeLessThan(0.01)
    })

    // End-to-end regression: drives a live headless core with EXACTLY the event
    // sequence the Cytoscape canvas renderer emits on a drag (grab on the
    // node, position via the dragged element collection, free). This guards
    // against the handler listening for a non-existent event name.
    it('live core: dragging the parent moves every descendant once (no compound drift)', () => {
      const els = [
        { data: { id: 'root' } }, { data: { id: 'a' } }, { data: { id: 'b' } },
        { data: { id: 'c' } }, { data: { id: 'd' } }, { data: { id: 'e' } },
        { data: { id: 'e1', source: 'root', target: 'a' } },
        { data: { id: 'e2', source: 'root', target: 'b' } },
        { data: { id: 'e3', source: 'a', target: 'c' } },
        { data: { id: 'e4', source: 'a', target: 'd' } },
        { data: { id: 'e5', source: 'b', target: 'e' } },
      ]
      const cy = makeCore(els)
      cy.getElementById('root').position({ x: 0, y: 0 })
      cy.getElementById('a').position({ x: 100, y: 0 })
      cy.getElementById('b').position({ x: -100, y: 0 })
      cy.getElementById('c').position({ x: 150, y: 100 })
      cy.getElementById('d').position({ x: 50, y: 100 })
      cy.getElementById('e').position({ x: -150, y: 100 })

      let draggedId: string | null = null
      let origins: Map<string, { x: number; y: number }> | null = null
      let applyingDelta = false

      const collect = (rootId: string) =>
        collectDescendants(rootId,
          cy.edges().map((e: any) => [e.data('source'), e.data('target')] as [string, string]),
          (id) => { const p = cy.getElementById(id).position(); return { x: p.x, y: p.y } })

      cy.on('grab', (evt: any) => {
        const node = evt.target.first ? evt.target.first() : evt.target
        if (!node || typeof node.id !== 'function') return
        draggedId = node.id()
        origins = collect(node.id())
      })
      cy.on('free', () => { draggedId = null; origins = null })
      cy.on('position', (evt: any) => {
        const nodeId: string | undefined = evt.target.length === 1 ? evt.target.id() : undefined
        if (applyingDelta) return
        if (draggedId && nodeId === draggedId && origins) {
          applyingDelta = true
          try {
            const rootPos = cy.getElementById(draggedId).position()
            subtreeTargets(origins, draggedId, rootPos).forEach((p, id) => {
              const t = cy.getElementById(id)
              if (t && t.id() !== draggedId) t.position(p)
            })
          } finally { applyingDelta = false }
        }
      })

      // Emulate the renderer: grab → series of position deltas on the dragged
      // element collection (evt.target is the collection, not the node).
      const root = cy.getElementById('root')
      root.emit({ type: 'grab', target: root, currentTarget: root, localPosition: { x: 0, y: 0 } })
      for (const [dx, dy] of [[50, 0], [10, 5], [60, 25]] as const) {
        root.silentPosition({ x: root.position('x') + dx, y: root.position('y') + dy })
        cy.collection([root]).emit({ type: 'position', target: cy.collection([root]), currentTarget: root })
      }
      cy.collection([root]).emit({ type: 'free', target: cy.collection([root]), currentTarget: root })

      // Root moved by (120, 30); every descendant keeps its original offset.
      expect(root.position()).toEqual({ x: 120, y: 30 })
      expect(cy.getElementById('a').position()).toEqual({ x: 220, y: 30 })
      expect(cy.getElementById('b').position()).toEqual({ x: 20, y: 30 })
      expect(cy.getElementById('c').position()).toEqual({ x: 270, y: 130 })
      expect(cy.getElementById('d').position()).toEqual({ x: 170, y: 130 })
      expect(cy.getElementById('e').position()).toEqual({ x: -30, y: 130 })
      cy.destroy()
    })
  })
})
