/**
 * SSGM Gateway Integration
 * 
 * Hooks SSGM Mission Control into the OpenClaw gateway server.
 * All features are behind feature flags (default OFF).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import type { createSubsystemLogger } from "../logging/subsystem.js";
import { getConfig } from "../config/config.js";

const logger = createSubsystemLogger("ssgm");

// Feature flags (all default to OFF)
export const SSGM_FLAGS = {
  ENABLED: process.env.SSGM_ENABLED === "true",
  UI_ENABLED: process.env.SSGM_UI_ENABLED === "true",
  TRACE_LOGGING: process.env.TRACE_LOGGING_ENABLED !== "false", // Safe default ON
  EVENT_STREAM: process.env.EVENT_STREAM_ENABLED === "true",
  WORKSPACE_TRACKING: process.env.WORKSPACE_TRACKING_ENABLED === "true",
  CHECKPOINTS: process.env.CHECKPOINTS_ENABLED === "true",
  HITL_APPROVAL: process.env.HITL_APPROVAL_ENABLED === "true",
  SAFE_MODE: process.env.SAFE_MODE === "true",
  KILL_SWITCH: process.env.ADMIN_KILL_SWITCH === "true",
  UPLOADS: process.env.UPLOADS_ENABLED === "true",
  VOICE: process.env.VOICE_ENABLED === "true",
  CAMERA: process.env.CAMERA_ENABLED === "true",
};

// Lazy-loaded modules
let ssgmApiHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<boolean>) | null = null;
let ssgmUiHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<boolean>) | null = null;
let eventStore: any = null;

/**
 * Initialize SSGM subsystem
 */
export async function initializeSSGM(): Promise<void> {
  if (!SSGM_FLAGS.ENABLED) {
    logger.info("SSGM disabled (SSGM_ENABLED=false)");
    return;
  }

  logger.info("Initializing SSGM Mission Control...");
  logger.info("Feature flags:", SSGM_FLAGS);

  // Ensure SSGM directories exist
  const config = getConfig();
  const baseDir = config?.configDir || process.env.HOME || "/tmp";
  const ssgmDir = resolvePath(baseDir, ".openclaw", "ssgm");

  if (!existsSync(ssgmDir)) {
    await mkdir(ssgmDir, { recursive: true });
    await mkdir(resolvePath(ssgmDir, "events"), { recursive: true });
    await mkdir(resolvePath(ssgmDir, "diffs"), { recursive: true });
    await mkdir(resolvePath(ssgmDir, "checkpoints"), { recursive: true });
    await mkdir(resolvePath(ssgmDir, "uploads"), { recursive: true });
  }

  // Initialize event store
  if (SSGM_FLAGS.TRACE_LOGGING) {
    try {
      const { initEventStore } = await import("./store.js");
      eventStore = await initEventStore(resolvePath(ssgmDir, "events"));
      logger.info("Event store initialized");
    } catch (err) {
      logger.error("Failed to initialize event store:", err);
    }
  }

  // Initialize workspace tracking
  if (SSGM_FLAGS.WORKSPACE_TRACKING) {
    try {
      const { initializeSsgmWorkspace } = await import("./workspace/index.js");
      await initializeSsgmWorkspace(ssgmDir);
      logger.info("Workspace tracking initialized");
    } catch (err) {
      logger.error("Failed to initialize workspace tracking:", err);
    }
  }

  logger.info("SSGM initialized successfully");
}

/**
 * Handle SSGM API requests
 */
export async function handleSsgmApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!SSGM_FLAGS.ENABLED) {
    return false;
  }

  const url = new URL(req.url || "/", "http://localhost");
  
  if (!url.pathname.startsWith("/api/ssgm")) {
    return false;
  }

  // Lazy load API handler
  if (!ssgmApiHandler) {
    try {
      const { handleSsgmApiRequest: handler } = await import("./api/handler.js");
      ssgmApiHandler = handler;
    } catch (err) {
      logger.error("Failed to load SSGM API handler:", err);
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "SSGM API unavailable" }));
      return true;
    }
  }

  return ssgmApiHandler(req, res);
}

/**
 * Handle SSGM UI requests
 */
export async function handleSsgmUiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (!SSGM_FLAGS.ENABLED || !SSGM_FLAGS.UI_ENABLED) {
    return false;
  }

  const url = new URL(req.url || "/", "http://localhost");
  
  if (!url.pathname.startsWith("/ssgm")) {
    return false;
  }

  // Lazy load UI handler
  if (!ssgmUiHandler) {
    try {
      ssgmUiHandler = createSsgmUiHandler();
    } catch (err) {
      logger.error("Failed to create SSGM UI handler:", err);
      res.statusCode = 503;
      res.end("SSGM UI unavailable");
      return true;
    }
  }

  return ssgmUiHandler(req, res);
}

/**
 * Create UI handler for static files
 */
function createSsgmUiHandler(): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const uiDir = new URL("./ui/", import.meta.url);
  const staticFiles = new Map<string, { content: Buffer; type: string }>();

  // Pre-load static files
  const files = [
    { path: "/ssgm", file: "index.html", type: "text/html" },
    { path: "/ssgm/", file: "index.html", type: "text/html" },
    { path: "/ssgm/index.html", file: "index.html", type: "text/html" },
    { path: "/ssgm/static/ssgm.css", file: "ssgm.css", type: "text/css" },
    { path: "/ssgm/static/ssgm.js", file: "ssgm.js", type: "application/javascript" },
  ];

  return async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    
    // SSE endpoint for event streaming
    if (url.pathname === "/ssgm/stream" && SSGM_FLAGS.EVENT_STREAM) {
      return handleEventStream(req, res);
    }

    // Static files
    const match = files.find(f => f.path === url.pathname);
    if (!match) {
      return false;
    }

    try {
      const fileUrl = new URL(match.file, uiDir);
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(fileUrl);
      
      res.statusCode = 200;
      res.setHeader("Content-Type", match.type);
      res.setHeader("Cache-Control", "no-cache");
      res.end(content);
      return true;
    } catch (err) {
      logger.error("Failed to serve SSGM UI file:", err);
      res.statusCode = 404;
      res.end("Not found");
      return true;
    }
  };
}

/**
 * Handle SSE event stream
 */
async function handleEventStream(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (req.method !== "GET") {
    return false;
  }

  const url = new URL(req.url || "/", "http://localhost");
  const runId = url.searchParams.get("runId");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

  // TODO: Implement actual event streaming from event store
  // For now, send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);

  // Clean up on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
  });

  return true;
}

/**
 * Record an event (for internal use)
 */
export async function recordEvent(event: any): Promise<void> {
  if (!SSGM_FLAGS.TRACE_LOGGING || !eventStore) {
    return;
  }

  try {
    await eventStore.appendEvent(event);
  } catch (err) {
    logger.error("Failed to record event:", err);
  }
}

/**
 * Check if action is blocked by safety controls
 */
export function isActionBlocked(action: string, details?: any): { blocked: boolean; reason?: string } {
  // Kill switch
  if (SSGM_FLAGS.KILL_SWITCH) {
    return { blocked: true, reason: "Kill switch activated" };
  }

  // Safe mode
  if (SSGM_FLAGS.SAFE_MODE) {
    const blockedActions = ["file.write", "file.delete", "terminal.exec", "deploy"];
    if (blockedActions.includes(action)) {
      return { blocked: true, reason: "Safe mode enabled" };
    }
  }

  return { blocked: false };
}

/**
 * Get SSGM health status
 */
export function getSsgmHealth(): { enabled: boolean; status: string; flags: typeof SSGM_FLAGS } {
  return {
    enabled: SSGM_FLAGS.ENABLED,
    status: SSGM_FLAGS.ENABLED ? "healthy" : "disabled",
    flags: SSGM_FLAGS,
  };
}
