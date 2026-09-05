import React, { useEffect, useRef, useCallback, useState, useImperativeHandle, forwardRef } from 'react'
import type { ElementDefinition, Core } from 'cytoscape'
import cytoscape from 'cytoscape'

// Imperative API exposed to the parent so it can restore the graph to its
// original (first-render) layout without touching filters or data.
export interface RelationsGraphViewportHandle {
  // Animate every node back to the position it had right after the last layout
  // ran, undoing any manual drag. Also refits the viewport.
  revertPositions: () => void
}

// ── Cytoscape Styles ────────────────────────────────────────────────

const getNodeColor = (type: string, status?: string): string => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark-theme')
  const map: Record<string, string> = isDark
    ? { user: '#2e1065', group: '#064e3b', project: '#164e63', branch: '#78350f', pipeline: '#713f12', job: '#1e3a8a' }
    : { user: '#ede9fe', group: '#ccfbf1', project: '#cffafe', branch: '#ffedd5', pipeline: '#fef3c7', job: '#dbeafe' }
  const base = map[type] || '#f8f9fa'
  if (type === 'pipeline' && status) {
    const statusMap: Record<string, string> = isDark
      ? { success: '#4ade80', failed: '#f87171', running: '#60a5fa', default: '#241f0a' }
      : { success: '#18d99a', failed: '#ff5267', running: '#39a0ff', default: '#fef7f0' }
    return statusMap[status.toLowerCase()] || statusMap.default
  }
  return base
}

const getEdgeColor = (type: string): string => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark-theme')
  const map: Record<string, string> = {
    'user-group': isDark ? '#a970ff' : '#7c3aed',
    'user-project': isDark ? '#f0abfc' : '#ec4899',
    'group-project': isDark ? '#2dd4bf' : '#14b8a6',
    'project-branch': isDark ? '#c47a54' : '#a0522d',
    'branch-pipeline': isDark ? '#22d3ee' : '#0891b2',
    'pipeline-job': isDark ? '#60a5fa' : '#2563eb',
  }
  return map[type] || (isDark ? '#bd93f9' : '#7c3aed')
}

// ── Organic force-directed Layout (COSE) ────────────────────────────
// Both relation graphs are drawn as a neuron-like network, not a tree:
// hub nodes (project / user) sit near the center of their connected
// cluster, children radiate outward, and separate connected components
// settle into distinct clusters. COSE keeps that organic shape while the
// post-settle passes (fanLeavesAroundHubs + reduceEdgeCrossings) arrange
// leaf fans and remove avoidable edge crossings / node overlaps.

type MapType = 'user-group-project' | 'project-branch-pipeline-jobs'

export const createLayoutConfig = (
  mapType: MapType = 'user-group-project',
  nodeCount = 0,
  edgeCount = 0,
): Record<string, any> => ({
  name: 'cose',                        // force-directed: organic, cluster-shaped
  // Denser subgraphs need a larger repulsion well (O(sqrt(N))) so nodes
  // spread out instead of piling toward the center.
  nodeRepulsion: (_n: any) => 200000 + 1200 * Math.sqrt(nodeCount),
  nodeOverlap: 40,                     // strong penalty pushes overlapping nodes apart
  idealEdgeLength: 90,                 // moderately long edges → breathing room
  edgeElasticity: 32,                  // spring stiffness (cytoscape default)
  // Low gravity lets hubs sit where net edge force is ~0 (cluster center);
  // loose leaves drift outward organically.
  gravity: 0.03,
  gravityRange: 3.8,
  // Cap iterations for medium-large graphs: force-directed O(N·E·iter) becomes
  // unusable on the main thread above ~200 edges. 600 iterations still yields a
  // usable, cluster-shaped result; the excess was mostly sub-pixel fine-tuning.
  numIter: edgeCount > 200 ? Math.min(600, 300 + edgeCount) : Math.min(1400, 600 + edgeCount * 6),
  initialTemp: 800,
  coolingFactor: 0.985,                // slower cooling → finer final settle
  minTemp: 0.4,
  componentSpacing: 160,               // distinct, neuron-like cluster separation
  randomize: false,                    // reuse our deterministic seed, no Math.random
  fit: true,                           // scale to fill the viewport
  padding: 60,
  animate: false,
  nodeDimensionsIncludeLabels: false,
})

// ── Deterministic initial seed ──────────────────────────────────────
// COSE with `randomize:false` starts from each node's current position.
// A fresh `cy.add()` parks every node at (0,0), and COSE's node-repulsion
// applies a Math.random() force whenever two nodes share an exact center —
// the source of layout non-determinism. Seeding a golden-angle spiral gives
// every node a unique, spread-out starting point, so the simulation is fully
// deterministic (fixed seed + fixed params → identical output every run)
// while still converging to the organic, cluster-shaped COSE layout.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

export const seedPositions = (cy: Core): void => {
  const nodes = Array.from(cy.nodes())
  const n = nodes.length
  if (n === 0) return
  const w = cy.width() > 0 ? cy.width() : 900
  const h = cy.height() > 0 ? cy.height() : 650
  const cx = w / 2
  const cy0 = h / 2
  const maxR = Math.max(1, Math.min(w, h) / 2 - 40)
  for (let i = 0; i < n; i++) {
    const r = maxR * Math.sqrt((i + 0.5) / n)
    const a = i * GOLDEN_ANGLE
    nodes[i].position({ x: cx + r * Math.cos(a), y: cy0 + r * Math.sin(a) })
  }
}

type Pt = { x: number; y: number }

const orient = (a: Pt, b: Pt, c: Pt) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

export const segmentsCross = (p1: Pt, p2: Pt, p3: Pt, p4: Pt) => {
  const d1 = orient(p3, p4, p1)
  const d2 = orient(p3, p4, p2)
  const d3 = orient(p1, p2, p3)
  const d4 = orient(p1, p2, p4)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// Matches the CSS node sizes (pipeline/job 34px, all others 46px).
export const nodeSize = (type?: string): { w: number; h: number } =>
  type === 'pipeline' || type === 'job' ? { w: 34, h: 34 } : { w: 46, h: 46 }

// True when the segment passes within `margin` (fraction of the radius)
// of the ellipse, using the closest point on the segment in ellipse space.
export const segmentHitsEllipse = (p1: Pt, p2: Pt, c: Pt, size: { w: number; h: number }, margin = 0.75) => {
  const rx = size.w / 2
  const ry = size.h / 2
  const u1 = (p1.x - c.x) / rx
  const v1 = (p1.y - c.y) / ry
  const u2 = (p2.x - c.x) / rx
  const v2 = (p2.y - c.y) / ry
  const du = u2 - u1
  const dv = v2 - v1
  const len2 = du * du + dv * dv
  let t = len2 === 0 ? 0 : -(u1 * du + v1 * dv) / len2
  t = Math.max(0, Math.min(1, t))
  const u = u1 + t * du
  const v = v1 + t * dv
  return u * u + v * v <= margin * margin
}

const bboxesOverlap = (a: Pt, as: { w: number; h: number }, b: Pt, bs: { w: number; h: number }, gap = 1) =>
  Math.abs(a.x - b.x) < (as.w + bs.w) / 2 - gap &&
  Math.abs(a.y - b.y) < (as.h + bs.h) / 2 - gap

// ── Layout cost (exported for tests) ────────────────────────────────
// Total "ugliness": edge↔edge crossings + edge-through-node hits + node
// bbox overlaps. Lower is better.
const sharesEndpoint = (ea: [string, string], eb: [string, string]) =>
  ea[0] === eb[0] || ea[0] === eb[1] || ea[1] === eb[0] || ea[1] === eb[1]

export const layoutCost = (
  nodes: { id: string; x: number; y: number; type?: string }[],
  edges: [string, string][],
): number => {
  const pos = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }] as [string, Pt]))
  const size = new Map(nodes.map((n) => [n.id, nodeSize(n.type)] as [string, { w: number; h: number }]))
  let c = 0
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      if (sharesEndpoint(edges[i], edges[j])) continue
      const [a, b] = edges[i]; const [c2, d] = edges[j]
      if (segmentsCross(pos.get(a)!, pos.get(b)!, pos.get(c2)!, pos.get(d)!)) c++
    }
  for (const [a, b] of edges)
    for (const n of nodes) {
      if (n.id === a || n.id === b) continue
      if (segmentHitsEllipse(pos.get(a)!, pos.get(b)!, pos.get(n.id)!, size.get(n.id)!)) c++
    }
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      if (bboxesOverlap(pos.get(nodes[i].id)!, size.get(nodes[i].id)!,
                        pos.get(nodes[j].id)!, size.get(nodes[j].id)!)) c++
    }
  return c
}

export const reduceEdgeCrossings = (cy: Core, budgetMs = 150) => {
  const nodeList = Array.from(cy.nodes())
  const edgeList = Array.from(cy.edges())
  // Hard thresholds keep this responsive on dense graphs.
  if (nodeList.length < 3 || edgeList.length < 2) return
  if (nodeList.length > 400 || edgeList.length > 800) return

  const t0 = Date.now()
  const pos = new Map<string, Pt>()
  const sizeOf = new Map<string, { w: number; h: number }>()
  nodeList.forEach((n: any) => {
    const p = n.position()
    pos.set(n.id(), { x: p.x, y: p.y })
    sizeOf.set(n.id(), nodeSize(n.data('type')))
  })

  const endpoints = edgeList.map((e: any) => [e.data('source'), e.data('target')] as [string, string])

  // Edges sharing an endpoint meet at the node, never count as crossing.
  const shares: boolean[][] = new Array(edgeList.length)
  for (let i = 0; i < edgeList.length; i++) {
    shares[i] = new Array<boolean>(edgeList.length)
    shares[i][i] = true
  }
  for (let i = 0; i < edgeList.length; i++)
    for (let j = i + 1; j < edgeList.length; j++) {
      const shared = endpoints[i].some((id) => endpoints[j].includes(id))
      shares[i][j] = shared
      shares[j][i] = shared
    }

  // Total cost under the given position function: edge↔edge crossings +
  // edges clipping an unrelated node's ellipse + overlapping node pairs.
  const nodeIds = nodeList.map((n: any) => n.id())
  const costOf = () => {
    let cost = 0
    for (let i = 0; i < edgeList.length; i++) {
      const [si, ti] = endpoints[i]
      const ai = pos.get(si)!
      const bi = pos.get(ti)!
      for (let j = i + 1; j < edgeList.length; j++) {
        if (shares[i][j]) continue
        if (segmentsCross(ai, bi, pos.get(endpoints[j][0])!, pos.get(endpoints[j][1])!)) cost++
      }
      for (const n of nodeList) {
        const id = n.id()
        if (id === si || id === ti) continue
        if (segmentHitsEllipse(ai, bi, pos.get(id)!, sizeOf.get(id)!)) cost++
      }
    }
    for (let i = 0; i < nodeIds.length; i++)
      for (let j = i + 1; j < nodeIds.length; j++) {
        if (bboxesOverlap(pos.get(nodeIds[i])!, sizeOf.get(nodeIds[i])!,
                          pos.get(nodeIds[j])!, sizeOf.get(nodeIds[j])!)) cost++
      }
    return cost
  }

  if (costOf() === 0) return

  // nodeEdges: nodeId → indices of edges incident to it.
  const nodeEdges = new Map<string, number[]>()
  const edgeOfNode = (id: string) => nodeEdges.get(id) || []
  endpoints.forEach((ep, idx) => {
    ep.forEach((id) => {
      const list = nodeEdges.get(id) || []
      list.push(idx)
      nodeEdges.set(id, list)
    })
  })

  const applyPositions = () => {
    nodeList.forEach((n: any) => {
      const p = pos.get(n.id())!
      n.position({ x: p.x, y: p.y })
    })
  }

  // Deterministic type-grouped node order (by type, then id) — used only to
  // enumerate candidate swap pairs in a stable order.
  const typeOf = new Map<string, string>()
  nodeList.forEach((n: any) => typeOf.set(n.id(), n.data('type')))
  const byTypeThenId = (a: string, b: string) =>
    typeOf.get(a)! < typeOf.get(b)! ? -1 : typeOf.get(a)! > typeOf.get(b)! ? 1 :
      a < b ? -1 : a > b ? 1 : 0

  const ids = nodeList.map((n: any) => n.id()).sort(byTypeThenId)
  let currentCost = costOf()

  // Bounded swap search. A hard eval cap keeps this O-bounded even on dense
  // graphs; a periodic time check catches slow machines.
  const MAX_EVALS = 4000
  let evals = 0
  let improved = true
  for (let sweep = 0; improved && sweep < 12 && evals < MAX_EVALS; sweep++) {
    improved = false
    outer_i:
    for (let i = 0; i < ids.length - 1; i++) {
      const idA = ids[i]
      for (let j = i + 1; j < ids.length; j++) {
        const idB = ids[j]
        // Same-type swaps only — different-type nodes have different
        // footprints, so their bboxes don't fit into each other's slots.
        if (typeOf.get(idA) !== typeOf.get(idB)) continue

        const savedA = { ...pos.get(idA)! }
        const savedB = { ...pos.get(idB)! }
        pos.set(idA, savedB)
        pos.set(idB, savedA)
        const newCost = costOf()
        pos.set(idA, savedA)
        pos.set(idB, savedB)
        evals++

        // Overlap is already in the cost, so a strict improvement guarantees
        // the swap never makes things worse on any penalty term.
        if (newCost < currentCost) {
          pos.set(idA, savedB)
          pos.set(idB, savedA)
          currentCost = newCost
          applyPositions()
          improved = true
        }
        // Periodic budget check (every 50 evals).
        if (evals % 50 === 0 && Date.now() - t0 > budgetMs) break outer_i
      }
    }
    if (Date.now() - t0 > budgetMs) return
  }
}

// ── Leaf-fan refinement ──────────────────────────────────────────────
// After COSE settles, each hub's true leaf children (degree 1, sharing one
// parent — primarily pipeline → job) are rearranged into a clean, symmetric
// arc that faces away from the hub's upstream (non-leaf) neighbour, like a
// neuron's branches growing outward.
//
// Determinism + clean fans:
//  * every sibling gets the SAME radius  → equal edge lengths
//  * siblings are spaced at even angles  → monotonic, balanced ordering
//  * the arc radius/span grow with child count and label footprint
//  * a leaf is only moved when the local fan score actually improves, so
//    already-clean (red-check) fans stay put
//  * a small bounded collision relaxation clears residual overlaps while
//    preserving ordering, radius and the fan's outward facing direction.

type Pt2 = Pt
const _hashId = (s: string): number => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Estimated label bounding width (labels are ellipsised to ~90px in CSS).
export const labelW = (id: string, type?: string): number => Math.min(90, Math.max(type ? nodeSize(type).w : 46, String(id).length * 7))

// BFS from `rootId` over parent→child edges (source = parent). Returns a map
// of every reachable descendant node (including the root) → its position.
// Cycle-safe via a `seen` set. Pure: positions come from `getPos`.
export const collectDescendants = (
  rootId: string,
  edges: [string, string][],
  getPos: (id: string) => { x: number; y: number },
): Map<string, { x: number; y: number }> => {
  const children = new Map<string, string[]>()
  edges.forEach(([s, t]) => {
    const list = children.get(s)
    if (list) list.push(t)
    else children.set(s, [t])
  })
  const origins = new Map<string, { x: number; y: number }>()
  const seen = new Set<string>([rootId])
  origins.set(rootId, { ...getPos(rootId) })
  let frontier: string[] = [rootId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      for (const child of children.get(id) ?? []) {
        if (seen.has(child)) continue
        seen.add(child)
        origins.set(child, { ...getPos(child) })
        next.push(child)
      }
    }
    frontier = next
  }
  return origins
}

// Given the captured subtree origins and where the dragged root now sits,
// compute every descendant's new position so it keeps its original offset
// from the root. Pure: returns a new map, does not mutate origins.
export const subtreeTargets = (
  origins: Map<string, { x: number; y: number }>,
  rootId: string,
  rootNow: { x: number; y: number },
): Map<string, { x: number; y: number }> => {
  const root0 = origins.get(rootId)!
  const dx = rootNow.x - root0.x
  const dy = rootNow.y - root0.y
  const targets = new Map<string, { x: number; y: number }>()
  origins.forEach((origin, id) => {
    if (id === rootId) return
    targets.set(id, { x: origin.x + dx, y: origin.y + dy })
  })
  return targets
}

// Standard deviation of a set of sibling edge lengths → 0 means even radii.
export const edgeLengthVariance = (lens: number[]): number => {
  if (lens.length < 2) return 0
  const m = lens.reduce((a, b) => a + b, 0) / lens.length
  return Math.sqrt(lens.reduce((a, b) => a + (b - m) ** 2, 0) / lens.length)
}

// Label anchors sit centred just below each node (~11px font, 4px margin).
type Rect = { x: number; y: number; w: number; h: number }
const labelAnchor = (p: Pt2, w: number): Rect => ({ x: p.x, y: p.y + 28, w, h: 14 })
const b2Overlap = (a: Rect, b: Rect, gap = 2) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 - gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 - gap

// Approximate label width from node id length; capped at the 90px CSS max.
const meanLabelW = (ids: string[]): number => {
  const w = ids.map((id) => labelW(id))
  return w.reduce((a, b) => a + b, 0) / Math.max(1, w.length)
}

// Number of label-anchor pairs that collide (label crowding metric).
const labelCrowding = (ids: string[], getPos: (id: string) => Pt2): number => {
  let c = 0
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      if (b2Overlap(labelAnchor(getPos(ids[i]), labelW(ids[i])), labelAnchor(getPos(ids[j]), labelW(ids[j])))) c++
  return c
}

// Minimal local graph model used to score a single hub's fan.
type FanCtx = {
  pos: Map<string, Pt2>
  size: Map<string, { w: number; h: number }>
  type: Map<string, string>
  edges: [string, string][]
  adj: Map<string, string[]>
  deg: Map<string, number>
  leafOf: Map<string, string>   // leaf id → its hub id
}
export const buildFanCtx = (nodeList: any[], edgeList: any[]): FanCtx => {
  const pos = new Map<string, Pt2>()
  const size = new Map<string, { w: number; h: number }>()
  const type = new Map<string, string>()
  const deg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  nodeList.forEach((n: any) => {
    const id = n.id() as string
    const p = n.position()
    pos.set(id, { x: p.x, y: p.y })
    size.set(id, nodeSize(n.data('type')))
    type.set(id, n.data('type'))
    deg.set(id, 0)
    adj.set(id, [])
  })
  const edges: [string, string][] = []
  edgeList.forEach((e: any) => {
    const s = e.data('source') as string
    const t = e.data('target') as string
    edges.push([s, t])
    deg.set(s, (deg.get(s) || 0) + 1)
    deg.set(t, (deg.get(t) || 0) + 1)
    adj.get(s)?.push(t)
    adj.get(t)?.push(s)
  })
  const leafOf = new Map<string, string>()
  nodeList.forEach((n: any) => {
    const id = n.id() as string
    if ((deg.get(id) || 0) === 1) {
      const hub = (adj.get(id) || [])[0]
      if (hub) leafOf.set(id, hub)
    }
  })
  return { pos, size, type, edges, adj, deg, leafOf }
}

// Ugliness of a hub's fan under `getPos`, scored against the WHOLE graph
// (so a repositioned leaf can never commit by clipping an unrelated cluster):
// edge↔edge crossings + edges through unrelated nodes + node overlap + label
// crowding + sibling edge-length variance. The constant (fan-independent)
// terms are pre-computed once per graph via `prepareFanBaseline` and only the
// terms that change when the leaves move are scored per candidate.
const sharesAny = (x: string, y: string, u: string, v: string) => x === u || x === v || y === u || y === v

type FanBaseline = {
  hub: string
  leaves: string[]
  inc: [string, string][]
  foreign: [string, string][]
  allIds: string[]
  baseTotal: number
}

// Score everything that does NOT depend on where `leaves` sit: all
// foreign↔foreign crossings, all foreign node overlap, all foreign label
// crowding, and the portion of each foreign edge / pair that ignores leaves.
export const prepareFanBaseline = (ctx: FanCtx, hubId: string, leaves: string[]): FanBaseline => {
  const leafSet = new Set(leaves)
  const inc = ctx.edges.filter(([a, b]) => a === hubId || b === hubId)
  const foreign = ctx.edges.filter(([a, b]) => a !== hubId && b !== hubId)
  const allIds = Array.from(ctx.pos.keys())
  let base = 0
  // Foreign ↔ foreign crossings.
  for (let i = 0; i < foreign.length; i++)
    for (let j = i + 1; j < foreign.length; j++)
      if (!sharesAny(...foreign[i], ...foreign[j]) &&
          segmentsCross(ctx.pos.get(foreign[i][0])!, ctx.pos.get(foreign[i][1])!,
            ctx.pos.get(foreign[j][0])!, ctx.pos.get(foreign[j][1])!)) base++
  // Node overlap between any two NON-LEAF nodes.
  const nonLeaf = allIds.filter((id) => !leafSet.has(id) && id !== hubId)
  for (let i = 0; i < nonLeaf.length; i++)
    for (let j = i + 1; j < nonLeaf.length; j++)
      if (bboxesOverlap(ctx.pos.get(nonLeaf[i])!, ctx.size.get(nonLeaf[i])!,
        ctx.pos.get(nonLeaf[j])!, ctx.size.get(nonLeaf[j])!)) base++
  // Label crowding between any two NON-LEAF nodes.
  base += 0.5 * labelCrowding(nonLeaf, (id) => ctx.pos.get(id)!)
  // Foreign edges through any NON-LEAF node.
  for (const [a, b] of foreign)
    for (const id of nonLeaf) {
      if (id === a || id === b) continue
      if (segmentHitsEllipse(ctx.pos.get(a)!, ctx.pos.get(b)!, ctx.pos.get(id)!, ctx.size.get(id)!)) base++
    }
  return { hub: hubId, leaves, inc, foreign, allIds, baseTotal: base }
}

export const fanScore = (base: FanBaseline, getPos: (id: string) => Pt2, ctx: FanCtx): number => {
  const leaves = base.leaves
  const hubId = base.hub
  let c = base.baseTotal
  // Fan incident edges: crossings with foreign edges + through any non-endpoint node.
  for (const [a, b] of base.inc) {
    for (const [u, v] of base.foreign) {
      if (sharesAny(a, b, u, v)) continue
      if (segmentsCross(getPos(a), getPos(b), getPos(u), getPos(v))) c++
    }
    for (const id of base.allIds) {
      if (id === a || id === b) continue
      if (segmentHitsEllipse(getPos(a), getPos(b), getPos(id), ctx.size.get(id)!)) c++
    }
  }
  // Node overlap: leaf↔leaf + leaf↔non-leaf (non-leaf↔non-leaf is in base).
  const rest = base.allIds.filter((id) => !leaves.includes(id))
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++)
      if (bboxesOverlap(getPos(leaves[i]), ctx.size.get(leaves[i])!, getPos(leaves[j]), ctx.size.get(leaves[j])!)) c++
    for (const id of rest)
      if (id !== hubId && bboxesOverlap(getPos(leaves[i]), ctx.size.get(leaves[i])!, getPos(id), ctx.size.get(id)!)) c++
  }
  // Label crowding: leaf↔leaf + leaf↔non-leaf (non-leaf↔non-leaf is in base).
  const anchorOf = (id: string) => labelAnchor(getPos(id), labelW(id, ctx.type.get(id)))
  let labelHits = 0
  for (let i = 0; i < leaves.length; i++)
    for (let j = i + 1; j < leaves.length; j++)
      if (b2Overlap(anchorOf(leaves[i]), anchorOf(leaves[j]))) labelHits++
  for (const l of leaves)
    for (const id of rest)
      if (b2Overlap(anchorOf(l), anchorOf(id))) labelHits++
  c += 0.5 * labelHits
  // Sibling edge-length variance (even radii → 0).
  const lens = leaves.map((id) => Math.hypot(getPos(id).x - getPos(hubId).x, getPos(id).y - getPos(hubId).y))
  c += 0.15 * edgeLengthVariance(lens)
  return c
}

export type LeafPlacement = { id: string; x: number; y: number; angle: number; dist: number }
export type FanResult = { hubId: string; upstreamId: string | null; centerAngle: number; radius: number; span: number; leaves: LeafPlacement[] }

// Plan the placement for one hub's leaves around its COSE position (pure —
// does not write to the graph, so it can be scored + asserted directly).
export const planLeafFan = (hubId: string, ctx: FanCtx): FanResult => {
  const ph = ctx.pos.get(hubId)!
  const hubSize = ctx.size.get(hubId)!

  // Upstream = the most-connected non-leaf neighbour (the hub's "parent" in
  // the project/branch/pipeline/job chain); the fan faces away from it.
  const neighbors = (ctx.adj.get(hubId) || []).filter((id) => id !== hubId && !ctx.leafOf.has(id) && ctx.pos.has(id))
  let upstreamId: string | null = null
  if (neighbors.length > 0) {
    neighbors.sort((a, b) => (ctx.deg.get(b) || 0) - (ctx.deg.get(a) || 0) || (a < b ? -1 : a > b ? 1 : 0))
    upstreamId = neighbors[0]
  }
  let centerAngle: number
  if (upstreamId) {
    const up = ctx.pos.get(upstreamId)!
    centerAngle = Math.atan2(up.y - ph.y, up.x - ph.x) + Math.PI
  } else {
    centerAngle = (_hashId(hubId) % 360) * (Math.PI / 180)
  }

  const leaves = (ctx.adj.get(hubId) || []).filter((id) => ctx.leafOf.get(id) === hubId).slice()

  // Stable ordering: each leaf's existing angle around the hub keeps the fan
  // close to where COSE put it (low crossings, already-clean fans stay put).
  const angOf = (id: string) => { const p = ctx.pos.get(id)!; return Math.atan2(p.y - ph.y, p.x - ph.x) }
  leaves.sort((a, b) => angOf(a) - angOf(b) || (a < b ? -1 : a > b ? 1 : 0))

  const n = leaves.length
  if (n === 0) return { hubId, upstreamId, centerAngle, radius: 0, span: 0, leaves: [] }

  // Shared radius from node + label footprints: grows with count & size.
  const meanLeaf = leaves.reduce((s, id) => s + ctx.size.get(id)!.w, 0) / n
  let R = hubSize.w / 2 + 12 + meanLeaf / 2 + 34 + (n - 1) * 7
  R = Math.max(hubSize.w / 2 + 44, Math.min(R, hubSize.w / 2 + 150))
  // Even angular spacing large enough that labels don't crowd; bounded arc
  // (≤170°) keeps the fan a neat bounded sweep, rarely a full circle.
  const minArc = Math.max(0.55, Math.min(1.6, 2 * Math.atan2(meanLabelW(leaves) / 2 + 9, R)))
  const span = Math.min((170 * Math.PI) / 180, n === 1 ? 0 : (n - 1) * minArc)
  const start = centerAngle - span / 2
  const leafPlacements: LeafPlacement[] = leaves.map((id, i) => {
    const angle = n === 1 ? centerAngle : start + (span * i) / (n - 1)
    return { id, x: ph.x + R * Math.cos(angle), y: ph.y + R * Math.sin(angle), angle, dist: R }
  })
  return { hubId, upstreamId, centerAngle, radius: R, span, leaves: leafPlacements }
}

// Bounded collision relaxation: clear node/label overlap between siblings by
// spreading the angular span slightly and pushing the radius out, so no two
// leaves sit at (near) the same spot without breaking even radii / ordering.
// Mutates the placement list in place; reads the live mutated positions.
const relaxFan = (ctx: FanCtx, hubId: string, fp: LeafPlacement[]): void => {
  if (fp.length < 2) return
  const ph = ctx.pos.get(hubId)!
  const centerAngle = (fp[fp.length - 1].angle + fp[0].angle) / 2
  const posOf = new Map<string, Pt2>()
  const sync = () => fp.forEach((l) => posOf.set(l.id, { x: l.x, y: l.y }))
  const hit = (a: LeafPlacement, b: LeafPlacement) =>
    bboxesOverlap(posOf.get(a.id)!, ctx.size.get(a.id)!, posOf.get(b.id)!, ctx.size.get(b.id)!) ||
    b2Overlap(labelAnchor(posOf.get(a.id)!, labelW(a.id, ctx.type.get(a.id))), labelAnchor(posOf.get(b.id)!, labelW(b.id, ctx.type.get(b.id))))
  sync()
  for (let it = 0; it < 8; it++) {
    let bad = false
    outer:
    for (let i = 0; i < fp.length; i++)
      for (let j = i + 1; j < fp.length; j++)
        if (hit(fp[i], fp[j])) { bad = true; break outer }
    if (!bad) return
    // Widen the arc (keeps order + symmetry) and nudge the radius out.
    const span = Math.min((200 * Math.PI) / 180, (fp[fp.length - 1].angle - fp[0].angle) * 1.15 + 0.05)
    const r = fp[0].dist + 5
    fp.forEach((leaf, i) => {
      const angle = centerAngle - span / 2 + (span * i) / (fp.length - 1)
      leaf.x = ph.x + r * Math.cos(angle)
      leaf.y = ph.y + r * Math.sin(angle)
      leaf.angle = angle
      leaf.dist = r
    })
    sync()
  }
}

// Beyond this the per-hub scoring (O(edges²) across all hubs) would block the
// main thread on a large filter result (e.g. a scope with >500 relations).
// COSE still produces a valid organic layout; the leaf-fan polish is an
// optional aesthetic pass we skip on large graphs.
const FAN_REFINE_MAX_NODES = 400
const FAN_REFINE_MAX_EDGES = 400

export const fanLeavesAroundHubs = (cy: Core): void => {
  const nodeList = Array.from(cy.nodes())
  const edgeList = Array.from(cy.edges())
  if (nodeList.length < 3) return
  if (nodeList.length > FAN_REFINE_MAX_NODES || edgeList.length > FAN_REFINE_MAX_EDGES) return

  const ctx = buildFanCtx(nodeList, edgeList)
  const pos = ctx.pos
  const leafOf = ctx.leafOf

  // hubToLeaves: hub id → list of its degree-1 leaf ids.
  const hubToLeaves = new Map<string, string[]>()
  leafOf.forEach((hub, leaf) => { const list = hubToLeaves.get(hub) || []; list.push(leaf); hubToLeaves.set(hub, list) })

  for (const [hubId, leaves] of hubToLeaves) {
    if (leaves.length < 1) continue

    const fp = planLeafFan(hubId, ctx)
    const base = (id: string) => pos.get(id)!
    const ids = fp.leaves.map((l) => l.id)
    // Whole-graph total score under the current (COSE) positions; the constant
    // part is pre-computed once here, only the fan-movable terms are re-scored.
    const baseline = prepareFanBaseline(ctx, hubId, ids)
    relaxFan(ctx, hubId, fp.leaves)
    const candidate = new Map<string, Pt2>()
    fp.leaves.forEach((lp) => candidate.set(lp.id, { x: lp.x, y: lp.y }))
    const candPos = (id: string) => candidate.get(id) || base(id)
    // Commit only when the whole-graph total score improves (never adds
    // crossing / overlap / label crowding elsewhere in the graph).
    if (fanScore(baseline, candPos, ctx) < fanScore(baseline, base, ctx)) {
      fp.leaves.forEach((lp) => {
        pos.set(lp.id, { x: lp.x, y: lp.y })
        cy.getElementById(lp.id).position({ x: lp.x, y: lp.y })
      })
    }
  }
}

// ── Detail-panel viewport pan ────────────────────────────────────────
// When the right-hand Node Info panel opens, the graph's own viewport narrows
// (CSS transition), so the canvas gets clipped on the right. We do NOT touch
// node coordinates or re-run the layout — we only pan (and, only if needed,
// zoom out) the Cytoscape viewport so the complete graph, and the selected
// node, stay visible and centred in the freed space. All node/edge positions
// are preserved; every element moves together inside the single viewport.

const MIN_ZOOM = 0.1
const MAX_ZOOM = 3
const VIEW_PAD = 40        // breathing room when fitting the graph
const PANEL_ANIM_MS = 300  // ≈ the panel's CSS transition (0.25s) + settle

export type DetailPanInput = {
  viewW: number
  viewH: number
  currentX: number
  currentY: number
  currentZoom: number
  bbox: { x1: number; y1: number; x2: number; y2: number } | null
  selectedX: number | null
  selectedY: number | null
  panelOpen: boolean
  minZoom?: number
  maxZoom?: number
  reducedMotion?: boolean
}

export type DetailPanTarget = { x: number; y: number; zoom: number; duration: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

// Pure, deterministic viewport target for the detail-panel transition.
// Keeps the user's zoom unless the graph would not fit (then reduces only as
// much as needed), and on open centres the selected node in the remaining
// area (biased left of the full page, keeping it clear of the panel).
export function computeDetailPan(input: DetailPanInput): DetailPanTarget {
  const { viewW, viewH, currentX, currentY, currentZoom, bbox, panelOpen } = input
  const minZoom = input.minZoom ?? MIN_ZOOM
  const maxZoom = input.maxZoom ?? MAX_ZOOM
  const duration = input.reducedMotion ? 0 : PANEL_ANIM_MS

  if (!bbox || viewW <= 0 || viewH <= 0) {
    return { x: currentX, y: currentY, zoom: currentZoom, duration }
  }

  const bw = Math.max(1, bbox.x2 - bbox.x1)
  const bh = Math.max(1, bbox.y2 - bbox.y1)
  const cX = (bbox.x1 + bbox.x2) / 2
  const cY = (bbox.y1 + bbox.y2) / 2

  const fitsAt = (z: number) => bw * z <= viewW + 1e-6 && bh * z <= viewH + 1e-6
  const zoomToFit = clamp(Math.min(viewW / (bw + 2 * VIEW_PAD), viewH / (bh + 2 * VIEW_PAD)), minZoom, maxZoom)

  // Preserve the user's zoom; reduce only if the graph would not fit.
  let zoom = clamp(currentZoom, minZoom, maxZoom)
  if (!fitsAt(zoom)) zoom = Math.min(zoom, zoomToFit)
  zoom = clamp(zoom, minZoom, maxZoom)

  let targetX: number
  let targetY: number
  if (panelOpen && input.selectedX != null && input.selectedY != null) {
    // Centre the selected node in the (narrower) remaining area.
    targetX = (viewW * 0.5) - input.selectedX * zoom
    targetY = (viewH * 0.5) - input.selectedY * zoom
  } else {
    // No open selection (or closing): re-centre the whole graph.
    targetX = (viewW * 0.5) - cX * zoom
    targetY = (viewH * 0.5) - cY * zoom
  }
  return { x: targetX, y: targetY, zoom, duration }
}

// Imperative: resize + cancel any in-flight pan + animate to the computed
// target. Returns the target. `cy` is the live Core (a fake in tests); the
// previous animation handle is cancelled when a newer transition starts.
export function applyDetailPan(cy: Core, opts: {
  panelOpen: boolean
  bbox: { x1: number; y1: number; x2: number; y2: number } | null
  selectedX: number | null
  selectedY: number | null
  reducedMotion?: boolean
}, getAnimRef: () => { stop: () => void } | null, setAnimRef: (v: { stop: () => void } | null) => void): DetailPanTarget {
  cy.resize()
  const pan = cy.pan()
  const target = computeDetailPan({
    viewW: cy.width(),
    viewH: cy.height(),
    currentX: pan.x,
    currentY: pan.y,
    currentZoom: cy.zoom(),
    bbox: opts.bbox,
    selectedX: opts.selectedX,
    selectedY: opts.selectedY,
    panelOpen: opts.panelOpen,
    reducedMotion: opts.reducedMotion,
  })
  getAnimRef()?.stop()
  const anim = cy.animate({
    pan: { x: target.x, y: target.y },
    zoom: target.zoom,
    duration: target.duration,
    easing: 'ease-out-cubic',
  })
  setAnimRef(anim && typeof (anim as any).stop === 'function' ? { stop: () => (anim as any).stop() } : null)
  return target
}

const prefersReducedMotion = (): boolean => {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false } catch { return false }
}

interface RelationsGraphViewportProps {
  elements?: ElementDefinition[]
  mapType: 'user-group-project' | 'project-branch-pipeline-jobs'
  onNodeSelect: (node: any) => void
  onNodeHover: (node: any | null) => void
  onCollapseToggle?: () => void
  detailOpen?: boolean
}

const RelationsGraphViewport = forwardRef<RelationsGraphViewportHandle, RelationsGraphViewportProps>(({
  elements = [],
  mapType,
  onNodeSelect,
  onNodeHover,
  onCollapseToggle,
  detailOpen = false,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const hoveredRef = useRef<any | null>(null)
  const selectedRef = useRef<string | null>(null)
  const settleRef = useRef<{ t: number | null; r: number | null }>({ t: null, r: null })
  // Original layout positions, captured after each layout runs so "revert"
  // can restore them regardless of how nodes were dragged since.
  const layoutPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())
  const [isReady, setIsReady] = useState(false)
  const detailAnimRef = useRef<{ stop: () => void } | null>(null)

  // Latest callbacks, so the (rare) re-init can read fresh handlers without
  // forcing a full Cytoscape rebuild on every parent render.
  const callbacksRef = useRef({ onNodeSelect, onNodeHover, onCollapseToggle })
  callbacksRef.current = { onNodeSelect, onNodeHover, onCollapseToggle }

  // Revert every node to the position it had right after the last layout
  // (first render / data load), undoing manual moves. Re-fits the viewport.
  useImperativeHandle(ref, () => ({
    revertPositions: () => {
      const cy = cyRef.current
      if (!cy || layoutPositionsRef.current.size === 0) return
      cy.batch(() => {
        layoutPositionsRef.current.forEach((pos, id) => {
          const n = cy.getElementById(id)
          if (n && n.length !== 0) n.position({ x: pos.x, y: pos.y })
        })
      })
      cy.fit(undefined, 40)
    },
  }))

  // Schedule one viewport pan at the END of the panel's CSS transition (the
  // size is then stable); rapid open/close only keeps the most recent settle.
  const scheduleSettlePan = useCallback(() => {
    const s = settleRef.current
    if (s.t) window.clearTimeout(s.t)
    if (s.r) window.cancelAnimationFrame(s.r)
    s.t = window.setTimeout(() => {
      s.t = null
      s.r = window.requestAnimationFrame(() => {
        s.r = null
        const cy = cyRef.current
        if (!cy) return
        const sel = selectedRef.current ? cy.getElementById(selectedRef.current) : null
        const bbox = cy.elements().boundingBox()
        applyDetailPan(
          cy,
          {
            panelOpen: detailOpen,
            bbox,
            selectedX: sel ? sel.position('x') : null,
            selectedY: sel ? sel.position('y') : null,
            reducedMotion: prefersReducedMotion(),
          },
          () => detailAnimRef.current,
          (v) => { detailAnimRef.current = v },
        )
      })
    }, PANEL_ANIM_MS)
  }, [detailOpen])

  // When the Node Info panel opens/closes, slide the whole graph with the freed
  // space. Runs on the state change (not per ResizeObserver tick), settles once
  // at the final size, cancels any in-flight stale pan, and never re-runs the
  // layout or touches node coordinates.
  useEffect(() => {
    if (!cyRef.current || !detailOpen) return
    scheduleSettlePan()
    const s = settleRef.current
    return () => {
      if (s.t) window.clearTimeout(s.t)
      if (s.r) window.cancelAnimationFrame(s.r)
    }
  }, [detailOpen, scheduleSettlePan])

  // ── Defensive fit fallback. COSE `run()` fits to the viewport; this
  //     guards the rare case where node positions leave the graph
  //     off-screen after the layout settles. ──

  const safeFitViewport = useCallback((cy: Core) => {
    if (cy.nodes().length === 0) return
    cy.fit(undefined, 40)
  }, [])

  // ── Highlight: the hovered node and all selected nodes are "focused".
  //    Focus nodes + their connected edges + direct neighbours are lit up;
  //    everything else dims, so focus is instantly visible. ──

  const applyHighlight = useCallback((cy: Core) => {
    const selected = cy.nodes(':selected')
    const focus: any[] = [hoveredRef.current, ...Array.from(selected)].filter(Boolean)
    cy.batch(() => {
      cy.elements().removeClass('hl-node hl-edge dimmed')
      if (focus.length === 0) return
      const nodeSet = new Set<string>()
      const edgeSet = new Set<string>()
      focus.forEach((n) => {
        nodeSet.add(n.id())
        n.connectedEdges().forEach((e: any) => {
          edgeSet.add(e.id())
          nodeSet.add(e.source().id())
          nodeSet.add(e.target().id())
        })
      })
      cy.nodes().forEach((n: any) => n.addClass(nodeSet.has(n.id()) ? 'hl-node' : 'dimmed'))
      cy.edges().forEach((e: any) => e.addClass(edgeSet.has(e.id()) ? 'hl-edge' : 'dimmed'))
    })
  }, [])

  // ── Initial mount: create Cytoscape. Re-init on mapType change for a clean
  //    canvas; the data effect below (re)lays out elements each load. ──

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy()
      cyRef.current = null
    }

    let cy: Core
    try {
      cy = cytoscape(
        {
          container: canvasRef.current,
        elements: [],
        style: [
        {
          selector: 'node',
          style: {
            'shape': 'ellipse',
            'background-color': (ele: any) => getNodeColor(ele.data('type'), ele.data('status')),
            'border-width': 2,
            'border-color': (ele: any) => {
              const t = ele.data('type')
              const isDrag = typeof document !== 'undefined' && document.documentElement.classList.contains('dark-theme')
              const m: Record<string, string> = isDrag
                ? { user: '#a970ff', group: '#2dd4bf', project: '#22d3ee', branch: '#c47a54', pipeline: '#f3a047', job: '#60a5fa' }
                : { user: '#7c3aed', group: '#0d9488', project: '#0891b2', branch: '#a0522d', pipeline: '#d97706', job: '#2563eb' }
              return m[t] || '#888'
            },
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-wrap': 'ellipsis',
            'text-max-width': '90px',
            'text-margin-y': 4,
            'color': (ele: any) => (typeof document !== 'undefined' && document.documentElement.classList.contains('dark-theme')) ? '#f4f4f5' : '#1e1b4b',
            'font-size': '11px',
            'width': (ele: any) => (ele.data('type') === 'pipeline' || ele.data('type') === 'job') ? '34px' : '46px',
            'height': (ele: any) => (ele.data('type') === 'pipeline' || ele.data('type') === 'job') ? '34px' : '46px',
          },
        },
        {
          selector: ':selected',
          style: {
            'border-width': 3,
            'border-color': (typeof document !== 'undefined' && document.documentElement.classList.contains('dark-theme')) ? '#f0abfc' : '#6d28d9',
          },
        },
        {
          // ── Focus/neighbor highlight ──
          selector: '.hl-node',
          style: {
            'z-index': 10,
            'font-weight': 600,
          },
        },
        {
          selector: '.dimmed',
          style: {
            'opacity': 0.55,
            'text-opacity': 0.3,
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': (ele: any) => getEdgeColor(ele.data('type')),
            'target-arrow-color': (ele: any) => getEdgeColor(ele.data('type')),
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2,
            'opacity': 0.6,
          },
        },
        {
          selector: ':selected.edge',
          style: { 'opacity': 1, 'width': 3 },
        },
        {
          selector: '.hl-edge',
          style: {
            'z-index': 5,
            'opacity': 1,
            'width': 3,
            'arrow-scale': 1.5,
          },
        },
      ],
      // ── Interaction config ──────────────────────────────────────
      panningEnabled: true,
      userPanningEnabled: true,
      zoomingEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: true,
      autounselectify: false,
      grabifyNodeDrag: false,
      grabifyUngrabSelected: false,
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      } as any,
    )
    } catch {
      // Cytoscape needs a 2D canvas context (unavailable in jsdom).
      // Degrade gracefully: keep "Loading graph..." overlay, skip init.
      return
    }

    // ── Double-click detection state ─────────────────────────────────────
    const doubleClickState = {
      lastTap: null as { nodeId: string; time: number } | null,
      pendingSingle: null as ReturnType<typeof setTimeout> | null,
    }

    const cancelPendingSingle = () => {
      if (doubleClickState.pendingSingle) {
        clearTimeout(doubleClickState.pendingSingle)
        doubleClickState.pendingSingle = null
      }
    }

    const handleNodeDrag = (nodeId: string, origX: number, origY: number) => {
      const cy = cyRef.current
      if (!cy) return
      const node = cy.getElementById(nodeId)
      if (!node) return
      node.position({ x: origX, y: origY })
    }

    // ── Event handlers ──────────────────────────────────────────

    // Subtree dragging: when a node is grabbed, all downstream descendants
    // (children, grandchildren…) follow it, preserving their original
    // offsets from the root.  Uses the existing collectDescendants +
    // subtreeTargets utilities.
    let draggedNode: any = null
    let subtreeOrigins: Map<string, { x: number; y: number }> | null = null
    let applyingSubtreeDelta = false

    cy.on('grab', 'node', (evt: any) => {
      const node = evt.target.first ? evt.target.first() : evt.target
      if (!node || typeof node.id !== 'function') return
      draggedNode = node
      subtreeOrigins = collectDescendants(
        node.id(),
        cy.edges().map((e: any) => [e.data('source'), e.data('target')] as [string, string]),
        (id) => { const p = cy.getElementById(id).position(); return { x: p.x, y: p.y } },
      )
    })
    cy.on('free', 'node', () => { draggedNode = null; subtreeOrigins = null })
    cy.on('position', 'node', (evt: any) => {
      if (applyingSubtreeDelta) return
      if (!draggedNode) return
      const nodeId = evt.target.id ? evt.target.id() : undefined
      if (!nodeId || nodeId !== draggedNode.id() || !subtreeOrigins) return
      applyingSubtreeDelta = true
      try {
        const rootPos = draggedNode.position()
        subtreeTargets(subtreeOrigins, draggedNode.id(), rootPos).forEach((p, id) => {
          const t = cy.getElementById(id)
          if (t) t.position(p)
        })
      } finally { applyingSubtreeDelta = false }
    })

    cy.on('mouseover', 'node', (evt: any) => {
      hoveredRef.current = evt.target
      applyHighlight(cy)
      callbacksRef.current.onNodeHover(evt.target)
    })
    cy.on('mouseout', 'node', () => {
      hoveredRef.current = null
      applyHighlight(cy)
      callbacksRef.current.onNodeHover(null)
    })
    cy.on('tap', 'node', (evt: any) => {
      const node = evt.target.first ? evt.target.first() : evt.target
      if (!node || typeof node.id !== 'function') return
      const nodeId = node.id()
      const now = Date.now()
      const last = doubleClickState.lastTap
      if (last && last.nodeId === nodeId && now - last.time < 300) {
        // ── Double-click: cancel any pending single-tap reset ──
        cancelPendingSingle()
        doubleClickState.lastTap = null
        return
      }
      doubleClickState.lastTap = { nodeId, time: now }
      // Single-tap: select the node and open detail panel
      node.select()
      selectedRef.current = nodeId
      callbacksRef.current.onNodeSelect(node)
      applyHighlight(cy)
    })
    // Selection changes (tap, box-select, unselect) should re-apply highlight
    cy.on('select unselect', () => applyHighlight(cy))
    cy.on('tap', (evt: any) => {
      if (evt.target === cy) {
        cy.elements().unselect()
        callbacksRef.current.onNodeSelect(null as any)
      }
    })

    cyRef.current = cy
    setIsReady(true)

    // The detail panel's width transitions via CSS; Cytoscape only resizes on
    // its own container's changes, so follow the outer sizing div and resize
    // the canvas on every tick. This is what makes all nodes glide with the
    // panel instead of the canvas snapping.
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        const target = cyRef.current
        const el = containerRef.current
        if (!target || !el) return
        if (target.width() !== el.clientWidth || target.height() !== el.clientHeight) {
          target.resize()
        }
      })
      ro.observe(containerRef.current)
    }

    return () => {
      ro?.disconnect()
      if (settleRef.current.t) window.clearTimeout(settleRef.current.t)
      if (settleRef.current.r) window.cancelAnimationFrame(settleRef.current.r)
      detailAnimRef.current?.stop()
      detailAnimRef.current = null
      cy.destroy()
      cyRef.current = null
    }
  }, [mapType])

  // ── Replace elements + run the organic COSE layout whenever the data
  //     changes. COSE is deterministic (randomize:false). Then leaf fans
  //     are arranged around their hubs, and a bounded deterministic polish
  //     pass removes avoidable edge crossings / node overlaps. ──

  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !isReady) return

    hoveredRef.current = null
    selectedRef.current = null

    cy.batch(() => {
      cy.elements().remove()
      cy.add(elements)
    })
    if (elements.length === 0) return

    const nodeCount = elements.filter((e: any) => !e.data.source).length
    const edgeCount = elements.length - nodeCount

    // Deterministic seed: unique spread-out starting points so the COSE
    // simulation is reproducible (avoids the zero-distance random-force branch).
    seedPositions(cy)
    const layout = cy.layout(createLayoutConfig(mapType, nodeCount, edgeCount) as any)
    layout.run()
    fanLeavesAroundHubs(cy)
    reduceEdgeCrossings(cy)
    // Capture the settled layout as the "revert" baseline so the Reset button
    // can restore this exact arrangement (first-render / post-load) later.
    const baseline = new Map<string, { x: number; y: number }>()
    cy.nodes().forEach((n: any) => {
      const p = n.position()
      baseline.set(n.id(), { x: p.x, y: p.y })
    })
    layoutPositionsRef.current = baseline
    safeFitViewport(cy)
    applyHighlight(cy)
  }, [elements, isReady, mapType, safeFitViewport, applyHighlight])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {!isReady && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          color: 'var(--dashboard-muted)',
        }}>
          Loading graph...
        </div>
      )}
    </div>
  )
})

RelationsGraphViewport.displayName = 'RelationsGraphViewport'

// ── Export for testing ──────────────────────────────────────────────

export const createCytoscapeDefaultConfig = () => ({
  panningEnabled: true,
  userPanningEnabled: true,
  zoomingEnabled: true,
  userZoomingEnabled: true,
  boxSelectionEnabled: true,
  autounselectify: false,
  minZoom: 0.1,
  maxZoom: 3,
  wheelSensitivity: 0.3,
})

export default RelationsGraphViewport
