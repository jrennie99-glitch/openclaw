/**
 * SSGM File System Hooks
 *
 * Hooks into fs.readFileSync and fs.writeFileSync to track file operations.
 * Non-invasive: preserves original functionality, adds tracking behind feature flag.
 */

import fs from "node:fs";
import { trackFileRead, trackFileWrite } from "./tracker.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("ssgm:fs-hooks");

// Store original functions
const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;

// Track if hooks are installed
let hooksInstalled = false;

/**
 * Check if workspace tracking is enabled
 */
function isTrackingEnabled(): boolean {
  const value = process.env.WORKSPACE_TRACKING_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Determine if a path should be tracked
 * Filters out system files, node_modules, and binary files
 */
function shouldTrackPath(filePath: string | Buffer | URL): boolean {
  try {
    const pathStr = typeof filePath === "string" 
      ? filePath 
      : filePath instanceof Buffer 
        ? filePath.toString() 
        : filePath.toString();

    // Skip system directories
    if (pathStr.includes("node_modules")) return false;
    if (pathStr.includes(".git")) return false;
    if (pathStr.includes("__pycache__")) return false;
    if (pathStr.includes(".npm")) return false;
    if (pathStr.includes(".cache")) return false;
    
    // Skip common binary extensions
    const binaryExts = [
      ".jpg", ".jpeg", ".png", ".gif", ".ico", ".svg", ".webp",
      ".mp3", ".mp4", ".wav", ".avi", ".mov", ".webm",
      ".zip", ".tar", ".gz", ".rar", ".7z",
      ".exe", ".dll", ".so", ".dylib",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx",
      ".ttf", ".otf", ".woff", ".woff2",
      ".sqlite", ".db", ".bin"
    ];
    
    const lowerPath = pathStr.toLowerCase();
    if (binaryExts.some(ext => lowerPath.endsWith(ext))) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Installed hook for fs.readFileSync
 */
function hookedReadFileSync(
  path: string | Buffer | URL,
  options?: { encoding?: null; flag?: string } | null
): Buffer;
function hookedReadFileSync(
  path: string | Buffer | URL,
  options: { encoding: BufferEncoding; flag?: string } | BufferEncoding
): string;
function hookedReadFileSync(
  path: string | Buffer | URL,
  options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null
): string | Buffer {
  // Call original first to preserve exact behavior
  const result = originalReadFileSync(path, options as any);

  // Track if enabled and path is eligible
  if (isTrackingEnabled() && shouldTrackPath(path)) {
    try {
      const pathStr = typeof path === "string" ? path : path.toString();
      trackFileRead(pathStr);
    } catch (err) {
      // Silent fail - tracking should not break operations
      log.debug(`Tracking failed for read: ${String(err)}`);
    }
  }

  return result;
}

/**
 * Installed hook for fs.writeFileSync
 */
function hookedWriteFileSync(
  path: string | Buffer | URL,
  data: string | Buffer | ArrayBufferView,
  options?: { encoding?: BufferEncoding | null; mode?: number; flag?: string } | BufferEncoding | null
): void {
  // Track before write if enabled
  if (isTrackingEnabled() && shouldTrackPath(path)) {
    try {
      const pathStr = typeof path === "string" ? path : path.toString();
      
      // Only track text content (string or toString-able)
      let content: string | null = null;
      if (typeof data === "string") {
        content = data;
      } else if (Buffer.isBuffer(data)) {
        // Try to read as UTF-8, skip if binary
        content = data.toString("utf-8");
      } else if (data && typeof data === "object" && "toString" in data) {
        content = data.toString();
      }

      if (content !== null) {
        trackFileWrite(pathStr, content);
      }
    } catch (err) {
      // Silent fail - tracking should not break operations
      log.debug(`Tracking failed for write: ${String(err)}`);
    }
  }

  // Call original to perform actual write
  return originalWriteFileSync(path, data, options as any);
}

/**
 * Install FS hooks for workspace tracking
 * Idempotent - safe to call multiple times
 */
export function installFsHooks(): void {
  if (hooksInstalled) {
    return;
  }

  if (!isTrackingEnabled()) {
    log.debug("FS hooks not installed - WORKSPACE_TRACKING_ENABLED is not set");
    return;
  }

  try {
    // Replace fs methods
    fs.readFileSync = hookedReadFileSync as typeof fs.readFileSync;
    fs.writeFileSync = hookedWriteFileSync as typeof fs.writeFileSync;

    hooksInstalled = true;
    log.info("FS hooks installed - tracking file operations");
  } catch (err) {
    log.error(`Failed to install FS hooks: ${String(err)}`);
  }
}

/**
 * Uninstall FS hooks and restore original functions
 */
export function uninstallFsHooks(): void {
  if (!hooksInstalled) {
    return;
  }

  try {
    fs.readFileSync = originalReadFileSync;
    fs.writeFileSync = originalWriteFileSync;

    hooksInstalled = false;
    log.info("FS hooks uninstalled");
  } catch (err) {
    log.error(`Failed to uninstall FS hooks: ${String(err)}`);
  }
}

/**
 * Check if hooks are currently installed
 */
export function areHooksInstalled(): boolean {
  return hooksInstalled;
}

/**
 * Reinstall hooks (useful after feature flag changes)
 */
export function reinstallFsHooks(): void {
  uninstallFsHooks();
  installFsHooks();
}
