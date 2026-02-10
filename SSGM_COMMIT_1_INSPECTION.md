# SSGM Commit 1: Repository Inspection Report

## Repository: openclaw
**URL:** https://github.com/jrennie99-glitch/openclaw
**Branch:** main
**Commit Date:** 2026-02-10

---

## Executive Summary

OpenClaw is a **WhatsApp gateway CLI** with Pi RPC agent capabilities. Built as a TypeScript monorepo with pnpm workspaces.

**Architecture:**
- **Backend**: Node.js/TypeScript HTTP/WebSocket server
- **Frontend**: Vite-based UI in `ui/` directory
- **Gateway**: Port 18789 (HTTP), 18790 (bridge)
- **Deployment**: Docker Compose with hot-reload

---

## Stack Analysis

### Core Technologies
| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.x |
| Package Manager | pnpm (monorepo workspaces) |
| UI Build | Vite |
| Testing | Vitest |
| Container | Docker/Docker Compose |
| Protocol | HTTP + WebSocket |

### Directory Structure
```
openclaw/
├── src/                    # Main source
│   ├── gateway/           # HTTP/WebSocket gateway (CRITICAL)
│   ├── agents/            # Agent management
│   ├── channels/          # Messaging channels (WA, Telegram, etc)
│   ├── config/            # Configuration system
│   ├── infra/             # Infrastructure utilities
│   ├── session/           # Session management
│   ├── web/               # Web/HTTP handlers
│   └── cli/               # CLI commands
├── ui/                    # Vite frontend
├── apps/                  # Mobile apps (Android)
├── skills/                # Agent skills
├── extensions/            # VS Code extensions
├── docs/                  # Documentation
└── docker-compose.yml     # Container orchestration
```

---

## Existing Routes & Endpoints

### Gateway HTTP Routes (src/gateway/server-http.ts)

| Route | Handler | Purpose |
|-------|---------|---------|
| `/` | handleControlUiHttpRequest | Control UI (web interface) |
| `/health` | handleHealthCheck | Health monitoring |
| `/a2ui/*` | handleA2uiHttpRequest | A2UI canvas interface |
| `/slack/*` | handleSlackHttpRequest | Slack integration |
| `/v1/*` | handleOpenAiHttpRequest | OpenAI-compatible API |
| `/openresponses/*` | handleOpenResponsesHttpRequest | OpenResponses protocol |
| `/tools/*` | handleToolsInvokeHttpRequest | Tool invocation |

### WebSocket Endpoints
| Path | Purpose |
|------|---------|
| `/` | Main gateway WebSocket |
| `/canvas-ws` | Canvas host WebSocket |

### Authentication Flow

**Gateway Auth (src/gateway/auth.ts):**
1. Bearer token from `Authorization: Bearer <token>` header
2. Gateway token from `X-OpenClaw-Gateway-Token` header
3. Session key resolution via cookie or header
4. Token validation against `process.env.OPENCLAW_GATEWAY_TOKEN`

**Auth Flow:**
```
Request → Bearer extraction → Token validation → Session resolution → Authorized
                                                 ↓
                                          Local bypass (if LAN request)
```

---

## Deployment Method

### Docker Compose (docker-compose.yml)
```yaml
services:
  openclaw-gateway:
    image: openclaw:local
    ports:
      - "${OPENCLAW_GATEWAY_PORT:-18789}:18789"  # Gateway
      - "${OPENCLAW_BRIDGE_PORT:-18790}:18790"  # Bridge
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
```

### Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `OPENCLAW_GATEWAY_PORT` | 18789 | Gateway HTTP port |
| `OPENCLAW_BRIDGE_PORT` | 18790 | Bridge port |
| `OPENCLAW_GATEWAY_TOKEN` | - | Auth token |
| `OPENCLAW_CONFIG_DIR` | - | Config volume |
| `OPENCLAW_WORKSPACE_DIR` | - | Workspace volume |

---

## Existing Features (Must Not Break)

### Critical Features
1. **WhatsApp Gateway**: Baileys Web integration for WA messaging
2. **Agent System**: Sub-agent spawning and management
3. **Tool Invocation**: HTTP-based tool calling
4. **Canvas/A2UI**: Visual agent interface
5. **Multi-channel**: WA, Telegram, Signal, Discord, Slack, iMessage
6. **Config Hot-reload**: Runtime config updates
7. **Health Checks**: `/health` endpoint

### Data Stores
1. **Config**: File-based (JSON/YAML)
2. **Sessions**: File-based JSONL in `~/.openclaw/sessions/`
3. **Memory**: `memory/` directory (markdown files)
4. **No PostgreSQL currently** (file-based fallback needed)

---

## SSGM Integration Points

### Where to Add New Routes

**New Routes (must not conflict):**
| Route | Purpose | Implementation |
|-------|---------|----------------|
| `/ssgm` | Mission Control UI | New handler: `handleSsgmUiHttpRequest` |
| `/api/ssgm/*` | SSGM API | New router: `ssgm-api.ts` |
| `/ssgm/ws` | Event stream | WebSocket handler in existing WS server |

### Feature Flag Integration

**Environment Variables to Add:**
```bash
# SSGM Core
SSGM_ENABLED=false                          # Master switch
SSGM_UI_ENABLED=false                       # UI toggle
TRACE_LOGGING_ENABLED=true                  # Safe default ON
EVENT_STREAM_ENABLED=false                  # WebSocket events

# Observability
WORKSPACE_TRACKING_ENABLED=false            # File tracking
CHECKPOINTS_ENABLED=false                   # File checkpoints

# Safety
HITL_APPROVAL_ENABLED=false                 # Human-in-the-loop
SAFE_MODE=false                             # Read-only mode
ADMIN_KILL_SWITCH=false                     # Emergency stop

# Multimodal
UPLOADS_ENABLED=false
VOICE_ENABLED=false
CAMERA_ENABLED=false
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Break existing routes | Add new routes, don't modify existing handlers |
| Memory bloat from events | Implement event rotation (keep last 10K events) |
| Auth bypass | Reuse existing `authorizeGatewayConnect` |
| DB dependency | Implement file-based event store fallback |
| Feature creep | Behind feature flags, default OFF |

---

## Implementation Plan

### Commit Order
1. ✅ **Commit 1**: Inspection report (this document)
2. **Commit 2**: Event schema + file-based event recorder
3. **Commit 3**: Event retrieval endpoints + redaction
4. **Commit 4**: Streaming endpoint (SSE)
5. **Commit 5**: Mission Control UI shell + timeline
6. **Commit 6**: Workspace tracking + diffs
7. **Commit 7**: Task graph generation + UI
8. **Commit 8**: HITL approvals + safe mode + kill switch
9. **Commit 9**: Upload endpoints + UI
10. **Commit 10**: Voice endpoints + UI
11. **Commit 11**: Vision endpoints + UI

---

## Agent Deployment Strategy

**10 Parallel Agents:**
| Agent | Task | Commit # |
|-------|------|----------|
| 1 | Event schema + recorder | 2 |
| 2 | Event retrieval API | 3 |
| 3 | Streaming endpoint | 4 |
| 4 | UI shell + timeline | 5 |
| 5 | Workspace tracking | 6 |
| 6 | Task graph | 7 |
| 7 | HITL + safety controls | 8 |
| 8 | Upload endpoints | 9 |
| 9 | Voice endpoints | 10 |
| 10 | Vision endpoints | 11 |

---

## Smoke Tests Required

After each commit, verify:

```bash
# Terminal 1: Start server
cd /data/.openclaw/workspace/openclaw
docker compose up openclaw-gateway

# Terminal 2: Verify existing functionality
curl http://localhost:18789/health  # Must return 200
curl http://localhost:18789/        # Must serve Control UI

# Terminal 3: Test new routes (when enabled)
curl http://localhost:18789/api/ssgm/health  # New route
```

---

## Signed
**Inspector:** Agent Main
**Date:** 2026-02-10
**Status:** APPROVED FOR SSGM IMPLEMENTATION
