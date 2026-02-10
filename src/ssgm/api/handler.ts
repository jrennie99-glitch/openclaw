/**
 * SSGM API HTTP Handler
 * 
 * REST API endpoints for querying events and runs.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { SsgmEventStore } from "../store.js";
import type { SsgmEventFilter, SsgmEventType } from "../types.js";
import { createRedactor, type SsgmRedactionConfig } from "../redaction.js";
import {
  visionAdapterFactory,
  type VisionAdapter,
  type VisionAnalyzeRequest,
  type VisionFeatureFlags,
  DEFAULT_VISION_FEATURE_FLAGS,
} from "../vision/index.js";
import { getBearerToken, getHeader } from "../../gateway/http-utils.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "../../gateway/auth.js";
import { sendJson, sendMethodNotAllowed, sendUnauthorized, sendNotFound } from "../../gateway/http-common.js";
import { readJsonBody } from "../../gateway/hooks.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

interface ApiContext {
  store: SsgmEventStore;
  auth: ResolvedGatewayAuth;
  trustedProxies?: string[];
  redactionConfig?: SsgmRedactionConfig;
  visionAdapter?: VisionAdapter;
  visionFeatures?: VisionFeatureFlags;
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

async function authenticateRequest(
  req: IncomingMessage,
  ctx: ApiContext,
): Promise<{ ok: true } | { ok: false; res: ServerResponse }> {
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: ctx.auth,
    connectAuth: token ? { token, password: token } : null,
    req,
    trustedProxies: ctx.trustedProxies,
  });
  
  if (!authResult.ok) {
    return { ok: false, res: undefined as unknown as ServerResponse };
  }
  
  return { ok: true };
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

// POST /api/ssgm/vision/analyze
async function handleVisionAnalyze(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  const features = ctx.visionFeatures ?? DEFAULT_VISION_FEATURE_FLAGS;
  
  // Check if camera/vision feature is enabled
  if (!features.CAMERA_ENABLED) {
    sendJson(res, 403, {
      ok: false,
      error: {
        message: "Vision analysis is disabled. Enable CAMERA_ENABLED feature flag.",
        type: "feature_disabled",
      },
    });
    return;
  }
  
  // Check if adapter is configured
  if (!ctx.visionAdapter || !ctx.visionAdapter.isReady()) {
    sendJson(res, 503, {
      ok: false,
      error: {
        message: "Vision adapter not configured or not ready",
        type: "adapter_not_ready",
      },
    });
    return;
  }
  
  // Parse request body (max 15MB for base64 images)
  const bodyResult = await readJsonBody(req, 15 * 1024 * 1024);
  if (!bodyResult.ok) {
    sendJson(res, 400, {
      ok: false,
      error: {
        message: bodyResult.error,
        type: "invalid_request",
      },
    });
    return;
  }
  
  const body = bodyResult.value as Partial<VisionAnalyzeRequest>;
  
  // Validate request
  if (!body.image || typeof body.image !== "string") {
    sendJson(res, 400, {
      ok: false,
      error: {
        message: "Missing or invalid 'image' field - expected base64 string or data URL",
        type: "invalid_request",
      },
    });
    return;
  }
  
  // Validate image format
  const validation = ctx.visionAdapter.validateImage(body.image);
  if (!validation.valid) {
    sendJson(res, 400, {
      ok: false,
      error: {
        message: validation.error || "Invalid image",
        type: "invalid_image",
      },
    });
    return;
  }
  
  try {
    const request: VisionAnalyzeRequest = {
      image: body.image,
      prompt: body.prompt,
      maxTokens: body.maxTokens,
      model: body.model,
    };
    
    const result = await ctx.visionAdapter.analyze(request);
    sendJson(res, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, {
      ok: false,
      error: {
        message: `Vision analysis failed: ${message}`,
        type: "analysis_error",
      },
    });
  }
}

// GET /api/ssgm/vision/status
async function handleVisionStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  ctx: ApiContext,
): Promise<void> {
  const features = ctx.visionFeatures ?? DEFAULT_VISION_FEATURE_FLAGS;
  const adapter = ctx.visionAdapter;
  
  sendJson(res, 200, {
    ok: true,
    enabled: features.CAMERA_ENABLED,
    ready: adapter?.isReady() ?? false,
    adapter: adapter?.name ?? null,
    models: adapter?.listModels() ?? [],
    features: {
      clientCompression: features.CLIENT_COMPRESSION_ENABLED,
      maxConcurrentRequests: features.MAX_CONCURRENT_REQUESTS,
    },
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

  // Get request method
  const method = req.method ?? "GET";

  // Parse query params for all requests
  const params = parseQueryParams(url);

  // Route to appropriate handler
  const path = pathname.replace("/api/ssgm", "");

  // Vision routes
  // POST /vision/analyze
  if ((path === "/vision/analyze" || path === "/vision/analyze/") && method === "POST") {
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
    await handleVisionAnalyze(req, res, ctx);
    return true;
  }

  // GET /vision/status
  if ((path === "/vision/status" || path === "/vision/status/") && method === "GET") {
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
    await handleVisionStatus(req, res, ctx);
    return true;
  }

  // All other routes require GET method
  if (method !== "GET") {
    sendMethodNotAllowed(res, "GET");
    return true;
  }

  // Authenticate request for remaining GET routes
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
