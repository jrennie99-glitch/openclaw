/**
 * SSGM Workspace Initialization
 *
 * Initializes the workspace tracking system on startup.
 * Called during gateway initialization when WORKSPACE_TRACKING_ENABLED is set.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { initializeWorkspaceTracking, getSsgmDiffsDir } from "./tracker.js";
import { installFsHooks } from "./fs-hooks.js";
import fs from "node:fs";
import path from "node:path";

const log = createSubsystemLogger("ssgm:workspace:init");

// Track initialization state
let initialized = false;

/**
 * Check if workspace tracking should be enabled
 */
export function shouldEnableWorkspaceTracking(): boolean {
  const value = process.env.WORKSPACE_TRACKING_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

/**
 * Migrate old diff format if needed
 * (placeholder for future migrations)
 */
function runMigrations(): void {
  try {
    const diffsDir = getSsgmDiffsDir();
    if (!fs.existsSync(diffsDir)) {
      return;
    }

    // Future migration logic goes here
    // e.g., migrate old diff formats, clean up orphaned files, etc.

    log.debug("Workspace migrations completed");
  } catch (err) {
    log.warn(`Migration check failed: ${String(err)}`);
  }
}

/**
 * Clean up old diffs to prevent disk bloat
 * Keeps last 30 days of diffs by default
 */
function cleanupOldDiffs(): void {
  try {
    const maxAgeDays = parseInt(process.env.WORKSPACE_DIFF_RETENTION_DAYS ?? "30", 10);
    if (maxAgeDays <= 0) {
      return; // No cleanup if retention is disabled
    }

    const diffsDir = getSsgmDiffsDir();
    if (!fs.existsSync(diffsDir)) {
      return;
    }

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - maxAgeMs;

    const files = fs.readdirSync(diffsDir);
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.endsWith(".json")) continue;

      const filePath = path.join(diffsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          cleanedCount++;
        }
      } catch {
        // Ignore errors for individual files
      }
    }

    if (cleanedCount > 0) {
      log.info(`Cleaned up ${cleanedCount} old diff files`);
    }
  } catch (err) {
    log.warn(`Diff cleanup failed: ${String(err)}`);
  }
}

/**
 * Initialize the SSGM workspace system
 * Called once during gateway startup
 */
export function initializeSsgmWorkspace(): void {
  if (initialized) {
    return;
  }

  if (!shouldEnableWorkspaceTracking()) {
    log.info("SSGM Workspace: disabled (set WORKSPACE_TRACKING_ENABLED=true to enable)");
    return;
  }

  try {
    log.info("SSGM Workspace: initializing...");

    // Initialize tracking infrastructure
    initializeWorkspaceTracking();

    // Install FS hooks
    installFsHooks();

    // Run maintenance tasks
    runMigrations();
    cleanupOldDiffs();

    initialized = true;
    log.info("SSGM Workspace: initialized successfully");
  } catch (err) {
    log.error(`SSGM Workspace: initialization failed: ${String(err)}`);
    // Don't throw - workspace tracking is non-critical
  }
}

/**
 * Check if workspace tracking is initialized
 */
export function isWorkspaceInitialized(): boolean {
  return initialized;
}

/**
 * Get workspace status for health checks
 */
export function getWorkspaceStatus(): {
  initialized: boolean;
  enabled: boolean;
  hooksInstalled: boolean;
} {
  return {
    initialized,
    enabled: shouldEnableWorkspaceTracking(),
    hooksInstalled: initialized,
  };
}
