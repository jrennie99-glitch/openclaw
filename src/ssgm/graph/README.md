# SSGM Task Graph Module

Visual task dependency graph generation and management.

## Features

- Parse events into hierarchical task graphs
- Store graphs in `~/.openclaw/ssgm/graphs/`
- UI panel for graph visualization (HTML/SVG)
- API endpoint: `GET /api/ssgm/runs/:run_id/graph`

## Graph Structure

```
Goal (root)
  └── Task
        └── Step
              └── Tool Call
```

## Usage

```typescript
import { TaskGraphBuilder } from './builder.js';
import { GraphStore } from './store.js';

// Build graph from events
const builder = new TaskGraphBuilder();
const graph = builder.buildFromEvents(events);

// Store graph
const store = new GraphStore();
await store.save(runId, graph);

// Load graph
const loaded = await store.load(runId);
```

## Configuration

Feature flags (in `~/.openclaw/openclaw.json`):

```json
{
  "ssgm": {
    "enabled": true,
    "graphEnabled": true,
    "uiEnabled": true
  }
}
```
