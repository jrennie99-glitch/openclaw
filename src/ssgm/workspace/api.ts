/**
 * SSGM Workspace API HTTP Handler
 *
 * Routes:
 * - GET /api/ssgm/workspace/files - List tracked files
 * - GET /api/ssgm/workspace/diff/:file_id - Get diff for a file operation
 * - GET /api/ssgm/workspace/stats - Get tracking statistics
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getTrackedFiles, getDiff, getDiffsForOperation, getTrackingStats } from "./tracker.js";
import { sendJson } from "../../gateway/http-common.js";

const API_BASE_PATH = "/api/ssgm/workspace";

/**
 * Parse query parameters from URL
 */
function parseQueryParams(url: URL): Record<string, string> {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * Handle workspace API requests
 * Returns true if request was handled, false otherwise
 */
export async function handleWorkspaceApiRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = url.pathname;

  // Check if this is a workspace API request
  if (!pathname.startsWith(API_BASE_PATH)) {
    return false;
  }

  const subPath = pathname.slice(API_BASE_PATH.length);

  // GET /api/ssgm/workspace/files - List tracked files
  if (subPath === "/files" && req.method === "GET") {
    return handleListFiles(req, res, url);
  }

  // GET /api/ssgm/workspace/diff/:file_id - Get diff for a file
  if (subPath.startsWith("/diff/") && req.method === "GET") {
    const fileId = subPath.slice("/diff/".length);
    return handleGetDiff(req, res, fileId);
  }

  // GET /api/ssgm/workspace/stats - Get tracking statistics
  if (subPath === "/stats" && req.method === "GET") {
    return handleGetStats(req, res);
  }

  // GET /api/ssgm/workspace/health - Health check
  if (subPath === "/health" && req.method === "GET") {
    return handleHealthCheck(req, res);
  }

  // Not a recognized endpoint
  return false;
}

/**
 * Handle GET /api/ssgm/workspace/files
 */
function handleListFiles(
  _req: IncomingMessage,
  res: ServerResponse,
  url: URL
): boolean {
  const params = parseQueryParams(url);

  const options: {
    type?: "read" | "write";
    limit?: number;
    offset?: number;
  } = {};

  if (params.type === "read" || params.type === "write") {
    options.type = params.type;
  }

  if (params.limit) {
    const limit = parseInt(params.limit, 10);
    if (!isNaN(limit) && limit > 0) {
      options.limit = Math.min(limit, 1000); // Cap at 1000
    }
  }

  if (params.offset) {
    const offset = parseInt(params.offset, 10);
    if (!isNaN(offset) && offset >= 0) {
      options.offset = offset;
    }
  }

  const files = getTrackedFiles(options);

  sendJson(res, 200, {
    success: true,
    data: files,
    meta: {
      count: files.length,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
    },
  });

  return true;
}

/**
 * Handle GET /api/ssgm/workspace/diff/:file_id
 */
function handleGetDiff(
  _req: IncomingMessage,
  res: ServerResponse,
  fileId: string
): boolean {
  // Try to get diff directly by ID
  let diff = getDiff(fileId);

  // If not found, try to find diff associated with this file operation
  if (!diff) {
    const diffs = getDiffsForOperation(fileId);
    if (diffs.length > 0) {
      diff = diffs[0]; // Return most recent
    }
  }

  if (!diff) {
    sendJson(res, 404, {
      success: false,
      error: "Diff not found",
      fileId,
    });
    return true;
  }

  sendJson(res, 200, {
    success: true,
    data: {
      id: diff.id,
      fileId: diff.fileId,
      path: diff.path,
      unifiedDiff: diff.unifiedDiff,
      beforeLength: diff.before?.length ?? 0,
      afterLength: diff.after.length,
      timestamp: diff.timestamp,
    },
  });

  return true;
}

/**
 * Handle GET /api/ssgm/workspace/stats
 */
function handleGetStats(
  _req: IncomingMessage,
  res: ServerResponse
): boolean {
  const stats = getTrackingStats();

  sendJson(res, 200, {
    success: true,
    data: stats,
  });

  return true;
}

/**
 * Handle GET /api/ssgm/workspace/health
 */
function handleHealthCheck(
  _req: IncomingMessage,
  res: ServerResponse
): boolean {
  const stats = getTrackingStats();

  sendJson(res, 200, {
    success: true,
    status: "healthy",
    workspaceTracking: stats.enabled,
    timestamp: new Date().toISOString(),
  });

  return true;
}
