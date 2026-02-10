/**
 * SSGM Workspace Tracker - File operation tracking and diff generation
 *
 * Tracks file reads/writes and generates unified diffs for changes.
 * Behind WORKSPACE_TRACKING_ENABLED feature flag.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("ssgm:workspace");

// Feature flag check
function isWorkspaceTrackingEnabled(): boolean {
  const value = process.env.WORKSPACE_TRACKING_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

// Types
export interface FileOperation {
  id: string;
  type: "read" | "write";
  path: string;
  timestamp: number;
  sessionId?: string;
  size?: number;
  hasDiff?: boolean;
}

export interface FileDiff {
  id: string;
  fileId: string;
  path: string;
  before: string | null;
  after: string;
  unifiedDiff: string;
  timestamp: number;
}

// In-memory storage (rotated to keep last N entries)
const MAX_TRACKED_FILES = 10000;
const fileOperations: Map<string, FileOperation> = new Map();
const fileDiffs: Map<string, FileDiff> = new Map();

// Stats for monitoring
let readCount = 0;
let writeCount = 0;
let diffCount = 0;

/**
 * Get the SSGM diffs directory path
 */
export function getSsgmDiffsDir(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "ssgm", "diffs");
}

/**
 * Ensure diffs directory exists
 */
function ensureDiffsDir(): string {
  const dir = getSsgmDiffsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Generate a unique ID for operations
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate unified diff between two file contents
 */
export function generateUnifiedDiff(
  before: string | null,
  after: string,
  filePath: string,
  contextLines = 3,
): string {
  const beforeLines = before?.split("\n") ?? [];
  const afterLines = after.split("\n");

  // Simple LCS-based diff
  const diff: string[] = [];
  const timestamp = new Date().toISOString();
  const filename = path.basename(filePath);

  // Header
  diff.push(`--- ${filename}\t${timestamp}`);
  diff.push(`+++ ${filename}\t${timestamp}`);

  let i = 0;
  let j = 0;

  while (i < beforeLines.length || j < afterLines.length) {
    // Find next difference
    while (
      i < beforeLines.length &&
      j < afterLines.length &&
      beforeLines[i] === afterLines[j]
    ) {
      i++;
      j++;
    }

    if (i >= beforeLines.length && j >= afterLines.length) {
      break;
    }

    // Find range of changes
    const oldStart = i;
    const newStart = j;

    // Count deletions
    while (i < beforeLines.length && (j >= afterLines.length || beforeLines[i] !== afterLines[j])) {
      i++;
    }

    // Count insertions
    while (j < afterLines.length && (i >= beforeLines.length || beforeLines[i] !== afterLines[j])) {
      j++;
    }

    const oldCount = i - oldStart;
    const newCount = j - newStart;

    // Output hunk header
    const oldRange = oldCount === 0 ? `${oldStart + 1},0` : `${oldStart + 1},${oldCount}`;
    const newRange = newCount === 0 ? `${newStart + 1},0` : `${newStart + 1},${newCount}`;
    diff.push(`@@ -${oldRange} +${newRange} @@`);

    // Output deletions
    for (let k = oldStart; k < oldStart + oldCount; k++) {
      diff.push(`-${beforeLines[k]}`);
    }

    // Output insertions
    for (let k = newStart; k < newStart + newCount; k++) {
      diff.push(`+${afterLines[k]}`);
    }
  }

  return diff.join("\n");
}

/**
 * Store a diff to disk
 */
function storeDiff(diff: FileDiff): void {
  try {
    const dir = ensureDiffsDir();
    const diffPath = path.join(dir, `${diff.id}.json`);
    fs.writeFileSync(diffPath, JSON.stringify(diff, null, 2), "utf-8");
  } catch (err) {
    log.warn(`Failed to store diff: ${String(err)}`);
  }
}

/**
 * Track a file read operation
 */
export function trackFileRead(filePath: string): void {
  if (!isWorkspaceTrackingEnabled()) {
    return;
  }

  try {
    const id = generateId();
    const normalizedPath = path.resolve(filePath);
    const stats = fs.existsSync(normalizedPath) ? fs.statSync(normalizedPath) : null;

    const operation: FileOperation = {
      id,
      type: "read",
      path: normalizedPath,
      timestamp: Date.now(),
      sessionId: process.env.OPENCLAW_SESSION_ID,
      size: stats?.size,
    };

    fileOperations.set(id, operation);
    readCount++;

    // Rotate old entries
    if (fileOperations.size > MAX_TRACKED_FILES) {
      const oldestId = fileOperations.keys().next().value;
      fileOperations.delete(oldestId);
    }

    log.debug(`Read: ${normalizedPath}`);
  } catch (err) {
    // Silent fail - tracking should not break operations
    log.debug(`Failed to track read: ${String(err)}`);
  }
}

/**
 * Track a file write operation and generate diff
 */
export function trackFileWrite(filePath: string, content: string): void {
  if (!isWorkspaceTrackingEnabled()) {
    return;
  }

  try {
    const id = generateId();
    const normalizedPath = path.resolve(filePath);

    // Capture before state
    let before: string | null = null;
    if (fs.existsSync(normalizedPath)) {
      try {
        before = fs.readFileSync(normalizedPath, "utf-8");
      } catch {
        // Binary file or unreadable - store null
        before = null;
      }
    }

    // Generate diff if we have before state
    let diffId: string | undefined;
    let hasDiff = false;
    if (before !== null && before !== content) {
      diffId = generateId();
      const unifiedDiff = generateUnifiedDiff(before, content, normalizedPath);

      const fileDiff: FileDiff = {
        id: diffId,
        fileId: id,
        path: normalizedPath,
        before,
        after: content,
        unifiedDiff,
        timestamp: Date.now(),
      };

      fileDiffs.set(diffId, fileDiff);
      storeDiff(fileDiff);
      hasDiff = true;
      diffCount++;
    }

    const operation: FileOperation = {
      id,
      type: "write",
      path: normalizedPath,
      timestamp: Date.now(),
      sessionId: process.env.OPENCLAW_SESSION_ID,
      size: content.length,
      hasDiff,
    };

    fileOperations.set(id, operation);
    writeCount++;

    // Rotate old entries
    if (fileOperations.size > MAX_TRACKED_FILES) {
      const oldestId = fileOperations.keys().next().value;
      fileOperations.delete(oldestId);
    }

    log.debug(`Write: ${normalizedPath}${hasDiff ? " (diff captured)" : ""}`);
  } catch (err) {
    // Silent fail - tracking should not break operations
    log.debug(`Failed to track write: ${String(err)}`);
  }
}

/**
 * Get all tracked file operations
 */
export function getTrackedFiles(options?: {
  type?: "read" | "write";
  limit?: number;
  offset?: number;
}): FileOperation[] {
  let operations = Array.from(fileOperations.values());

  if (options?.type) {
    operations = operations.filter((op) => op.type === options.type);
  }

  // Sort by timestamp descending
  operations.sort((a, b) => b.timestamp - a.timestamp);

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;

  return operations.slice(offset, offset + limit);
}

/**
 * Get a specific diff by ID
 */
export function getDiff(diffId: string): FileDiff | undefined {
  // First check memory
  const fromMemory = fileDiffs.get(diffId);
  if (fromMemory) {
    return fromMemory;
  }

  // Try loading from disk
  try {
    const dir = getSsgmDiffsDir();
    const diffPath = path.join(dir, `${diffId}.json`);
    if (fs.existsSync(diffPath)) {
      const content = fs.readFileSync(diffPath, "utf-8");
      const diff = JSON.parse(content) as FileDiff;
      fileDiffs.set(diffId, diff); // Cache in memory
      return diff;
    }
  } catch (err) {
    log.warn(`Failed to load diff ${diffId}: ${String(err)}`);
  }

  return undefined;
}

/**
 * Get diffs for a specific file operation
 */
export function getDiffsForOperation(fileId: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  for (const diff of fileDiffs.values()) {
    if (diff.fileId === fileId) {
      diffs.push(diff);
    }
  }
  return diffs.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get tracking statistics
 */
export function getTrackingStats(): {
  readCount: number;
  writeCount: number;
  diffCount: number;
  totalTracked: number;
  enabled: boolean;
} {
  return {
    readCount,
    writeCount,
    diffCount,
    totalTracked: fileOperations.size,
    enabled: isWorkspaceTrackingEnabled(),
  };
}

/**
 * Clear all tracking data (for testing)
 */
export function clearTrackingData(): void {
  fileOperations.clear();
  fileDiffs.clear();
  readCount = 0;
  writeCount = 0;
  diffCount = 0;
}

/**
 * Initialize workspace tracking
 */
export function initializeWorkspaceTracking(): void {
  if (!isWorkspaceTrackingEnabled()) {
    log.info("Workspace tracking disabled (set WORKSPACE_TRACKING_ENABLED=true to enable)");
    return;
  }

  ensureDiffsDir();
  log.info("Workspace tracking enabled - monitoring file operations");
}
