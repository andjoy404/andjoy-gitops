# Relations Map — Architecture

## Technology

- **Cytoscape.js** with force-directed `cose` organic layout
- Deterministic initial coordinate seeding (`seedPositions`)
- Post-layout polishing:
  - **Leaf-fan refinement** (`fanLeavesAroundHubs`): arranges terminal nodes (such as jobs) in radial arcs facing away from parent nodes
  - **Edge-crossing reduction** (`reduceEdgeCrossings`): pairwise segment swap optimization with collision avoidance

## Layout Modes

- **Mode 1: Users Map** (`user-group-project`): User → Group → Project relationships, showing contributor access, roles, and project ownership.
- **Mode 2: CI/CD Map** (`project-branch-pipeline-jobs`): Project → Branch → Pipeline → Job execution tree, showing real-time pipeline run statuses and job dependency hierarchies.

## Components & Code Structure

- **Page Container**: `src/pages/RelationsMapPage.tsx`
- **Graph Viewport**: `src/components/graph/RelationsGraphViewport.tsx` (Cytoscape canvas instance, pan/zoom bounds, wheel sensitivity, theme colors)
- **Styles**: `src/styles/relations.css`

## Backend API

- `GET /api/graph` — User-group-project relationship graph for the selected group filter
- `GET /api/graph/cicd` — Project-branch-pipeline-job CI/CD execution graph
- `GET /api/graph/options` — Filter options for groups, projects, and users

## Node Types & Visual Encoding

- **User**: Lavender / purple ellipse
- **Group**: Teal ellipse
- **Project**: Cyan ellipse
- **Branch**: Warm bronze / amber ellipse
- **Pipeline**: Orange ellipse (badged by status: success, failed, running, canceled)
- **Job**: Blue ellipse (badged by status)

## UX & Interaction Features

- Force-directed layout with deterministic positioning
- Mouse wheel zooming with configured sensitivity (`0.3`) and bounded zoom levels (`0.1` to `3.0`)
- Subtree dragging (dragging a parent node moves its dependent child nodes consistently)
- Interactive hover and click selection with detail side-panel
- Theme-aware palette with full dark/light theme support
- Export / fit-to-screen controls and interactive legend overlay

