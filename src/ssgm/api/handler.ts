/**
 * SSGM API HTTP Handler
 * 
 * REST API endpoints for querying events and runs.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { SsgmEventStore } from "../store.js";
import type { SsgmEventFilter, SsgmEventType } from "../types.js";
import { createRedactor, type SsgmRedactionConfig } from "../redaction.js";
import { getBearerToken } from "../../gateway/http-utils.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "../../gateway/auth.js";
import { sendJson, sendMethodNotAllowed, sendUnauthorized, sendNotFound } from "../../gateway/http-common.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

interface ApiContext {
  store: SsgmEventStore;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  redactionConfig?: SsgmRedactionConfig;
}

function parseQueryParams(url: URL): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const existing = params[key];
    if (existing) {
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        params[key] = [existing, value];
      }
    } else {
      params[key] = value;
    }
  }
  return params;
}

function getStringParam(params: Record<string, string | string[]>, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function getStringArrayParam(params: Record<string, string | string[]>, key: string): string[] | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  return value.split(",").map(s => s.trim());
}

function parseIntParam(params: Record<string, string | string[]>, key: string, defaultValue: number): number {
  const value = getStringParam(params, key);
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

function buildEventFilter(params: Record<string, string | string[]>): SsgmEventFilter {
  const filter: SsgmEventFilter = {};
  
  const eventTypes = getStringArrayParam(params, "event_type");
  if (eventTypes) {
    filter.eventTypes = eventTypes as SsgmEventType[];
  }
  
  const agentId = getStringParam(params, "agent_id");
  if (agentId) {
    filter.agentId = agentId;
  }
  
  const startDate = getStringParam(params, "start_date");
  if (startDate) {
    filter.startDate = startDate;
  }
  
  const endDate = getStringParam(params, "end_date");
  if (endDate) {
    filter.endDate = endDate;
  }
  
  const parentId = getStringParam(params, "parent_id");
  if (parentId) {
    filter.parentId = parentId;
  }
  
  return filter;
}

// GET /api/ssgm/health
async function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  const health = ctx.store.getHealth();
  sendJson(res, 200, {
    ok: true,
    status: health.status,
    events: health.eventCount,
    runs: health.runCount,
    ssgm: {
      enabled: true,
      version: "0.1.0",
    },
  });
}

// GET /api/ssgm/runs
async function handleListRuns(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  params: Record<string, string | string[]>,
): Promise<void> {
  const limit = Math.min(parseIntParam(params, "limit", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const offset = parseIntParam(params, "offset", 0);
  
  const { runs, total } = await ctx.store.listRuns({ limit, offset });
  
  sendJson(res, 200, {
    ok: true,
    runs,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + runs.length < total,
    },
  });
}

// GET /api/ssgm/runs/:run_id/events
async function handleGetEvents(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  runId: string,
  params: Record<string, string | string[]>,
): Promise<void> {
  const run = await ctx.store.getRun(runId);
  if (!run) {
    sendNotFound(res, `Run not found: ${runId}`);
    return;
  }
  
  const filter = buildEventFilter(params);
  const redact = getStringParam(params, "redact") === "true";
  
  let events = await ctx.store.getEvents(runId, filter);
  
  // Apply redaction if requested
  if (redact && ctx.redactionConfig) {
    const redactor = createRedactor(ctx.redactionConfig);
    events = redactor.redactEvents(events);
  }
  
  sendJson(res, 200, {
    ok: true,
    runId,
    events,
    count: events.length,
  });
}

// GET /api/ssgm/runs/:run_id/graph
async function handleGetGraph(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  runId: string,
): Promise<void> {
  const run = await ctx.store.getRun(runId);
  if (!run) {
    sendNotFound(res, `Run not found: ${runId}`);
    return;
  }
  
  const graph = await ctx.store.getTaskGraph(runId);
  if (!graph) {
    sendJson(res, 200, {
      ok: true,
      runId,
      nodes: [],
      edges: [],
    });
    return;
  }
  
  sendJson(res, 200, {
    ok: true,
    ...graph,
  });
}

// GET /api/ssgm/runs/:run_id/workspace
async function handleGetWorkspace(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
  runId: string,
  params: Record<string, string | string[]>,
): Promise<void> {
  const run = await ctx.store.getRun(runId);
  if (!run) {
    sendNotFound(res, `Run not found: ${runId}`);
    return;
  }
  
  const snapshot = await ctx.store.getWorkspaceSnapshot(runId);
  if (!snapshot) {
    sendJson(res, 200, {
      ok: true,
      runId,
      snapshot: null,
    });
    return;
  }
  
  const redact = getStringParam(params, "redact") === "true";
  
  if (redact && ctx.redactionConfig) {
    const redactor = createRedactor(ctx.redactionConfig);
    const redactedSnapshot = redactor.redactWorkspaceSnapshot(snapshot, true);
    sendJson(res, 200, {
      ok: true,
      runId,
      snapshot: redactedSnapshot,
    });
    return;
  }
  
  sendJson(res, 200, {
    ok: true,
    runId,
    snapshot,
  });
}

export async function handleSsgmApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = url.pathname;
  
  // Check if this is an SSGM API request
  if (!pathname.startsWith("/api/ssgm")) {
    return false;
  }
  
  // Only allow GET requests
  if (req.method !== "GET") {
    sendMethodNotAllowed(res, "GET");
    return true;
  }
  
  // Authenticate request
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: ctx.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: ctx.trustedProxies,
  });
  
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }
  
  const params = parseQueryParams(url);
  
  // Route to appropriate handler
  const path = pathname.replace("/api/ssgm", "");
  
  // /health
  if (path === "/health" || path === "/health/") {
    await handleHealth(req, res, ctx);
    return true;
  }
  
  // /runs
  if (path === "/runs" || path === "/runs/") {
    await handleListRuns(req, res, ctx, params);
    return true;
  }
  
  // /runs/:run_id/events
  const eventsMatch = path.match(/^\/runs\/([^/]+)\/events\/?$/);
  if (eventsMatch) {
    await handleGetEvents(req, res, ctx, eventsMatch[1], params);
    return true;
  }
  
  // /runs/:run_id/graph
  const graphMatch = path.match(/^\/runs\/([^/]+)\/graph\/?$/);
  if (graphMatch) {
    await handleGetGraph(req, res, ctx, graphMatch[1]);
    return true;
  }
  
  // /runs/:run_id/workspace
  const workspaceMatch = path.match(/^\/runs\/([^/]+)\/workspace\/?$/);
  if (workspaceMatch) {
    await handleGetWorkspace(req, res, ctx, workspaceMatch[1], params);
    return true;
  }
  
  // Unknown route
  sendNotFound(res, `Unknown SSGM API endpoint: ${path}`);
  return true;
}
