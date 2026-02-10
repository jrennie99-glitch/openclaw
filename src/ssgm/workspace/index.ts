/**
 * SSGM Workspace Module
 *
 * File operation tracking and diff generation for the SSGM system.
 *
 * Feature flag: WORKSPACE_TRACKING_ENABLED
 * When enabled, hooks into fs.readFileSync and fs.writeFileSync to track
 * all file operations and generate unified diffs for writes.
 */

// Core tracking
export {
  trackFileRead,
  trackFileWrite,
  getTrackedFiles,
  getDiff,
  getDiffsForOperation,
  getTrackingStats,
  clearTrackingData,
  initializeWorkspaceTracking,
  getSsgmDiffsDir,
  generateUnifiedDiff,
  type FileOperation,
  type FileDiff,
} from "./tracker.js";

// FS hooks
export {
  installFsHooks,
  uninstallFsHooks,
  areHooksInstalled,
  reinstallFsHooks,
} from "./fs-hooks.js";

// API handler
export { handleWorkspaceApiRequest } from "./api.js";

// Initialization
export { initializeSsgmWorkspace } from "./init.js";
