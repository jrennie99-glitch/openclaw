/**
 * Tests for SSGM Workspace Tracker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  trackFileRead,
  trackFileWrite,
  getTrackedFiles,
  getDiff,
  getTrackingStats,
  clearTrackingData,
  generateUnifiedDiff,
  getSsgmDiffsDir,
} from "./tracker.js";
import { installFsHooks, uninstallFsHooks, areHooksInstalled } from "./fs-hooks.js";

describe("Workspace Tracker", () => {
  const tempDir = path.join(os.tmpdir(), "ssgm-test-" + Date.now());

  beforeEach(() => {
    // Enable tracking for tests
    process.env.WORKSPACE_TRACKING_ENABLED = "true";
    clearTrackingData();
    
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup
    clearTrackingData();
    uninstallFsHooks();
    
    // Remove temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("trackFileRead", () => {
    it("should track a file read operation", () => {
      const testFile = path.join(tempDir, "test-read.txt");
      fs.writeFileSync(testFile, "hello world");

      trackFileRead(testFile);

      const files = getTrackedFiles();
      expect(files.length).toBe(1);
      expect(files[0].type).toBe("read");
      expect(files[0].path).toBe(testFile);
    });

    it("should resolve relative paths to absolute", () => {
      const testFile = "./test-relative.txt";
      fs.writeFileSync(testFile, "test content");

      trackFileRead(testFile);

      const files = getTrackedFiles();
      expect(files[0].path).toBe(path.resolve(testFile));

      // Cleanup
      fs.unlinkSync(testFile);
    });

    it("should not track when disabled", () => {
      process.env.WORKSPACE_TRACKING_ENABLED = "false";
      const testFile = path.join(tempDir, "test-disabled.txt");
      fs.writeFileSync(testFile, "content");

      trackFileRead(testFile);

      const files = getTrackedFiles();
      expect(files.length).toBe(0);
    });
  });

  describe("trackFileWrite", () => {
    it("should track a file write operation", () => {
      const testFile = path.join(tempDir, "test-write.txt");

      trackFileWrite(testFile, "new content");

      const files = getTrackedFiles();
      expect(files.length).toBe(1);
      expect(files[0].type).toBe("write");
      expect(files[0].size).toBe("new content".length);
    });

    it("should generate diff for file modifications", () => {
      const testFile = path.join(tempDir, "test-diff.txt");
      fs.writeFileSync(testFile, "original content");

      trackFileWrite(testFile, "modified content");

      const files = getTrackedFiles();
      expect(files[0].hasDiff).toBe(true);

      // Verify diff was created
      const diffs = getTrackedFiles({ type: "write" });
      const diffId = diffs[0]?.id;
      expect(diffId).toBeDefined();
    });

    it("should not generate diff for new files", () => {
      const testFile = path.join(tempDir, "test-new-file.txt");

      trackFileWrite(testFile, "content for new file");

      const files = getTrackedFiles();
      // New files don't have diffs (no before state)
      expect(files[0].hasDiff).toBe(false);
    });

    it("should not generate diff when content is unchanged", () => {
      const testFile = path.join(tempDir, "test-unchanged.txt");
      fs.writeFileSync(testFile, "same content");

      trackFileWrite(testFile, "same content");

      const files = getTrackedFiles();
      expect(files[0].hasDiff).toBe(false);
    });
  });

  describe("generateUnifiedDiff", () => {
    it("should generate proper unified diff format", () => {
      const before = "line1\nline2\nline3";
      const after = "line1\nmodified line2\nline3";

      const diff = generateUnifiedDiff(before, after, "/test/file.txt");

      expect(diff).toContain("--- file.txt");
      expect(diff).toContain("+++ file.txt");
      expect(diff).toContain("@@");
      expect(diff).toContain("-line2");
      expect(diff).toContain("+modified line2");
    });

    it("should handle new files (null before)", () => {
      const after = "new content\nmore content";

      const diff = generateUnifiedDiff(null, after, "/test/file.txt");

      expect(diff).toContain("+++ file.txt");
      expect(diff).toContain("+new content");
    });

    it("should handle empty files", () => {
      const diff = generateUnifiedDiff("", "content", "/test/file.txt");
      expect(diff).toContain("+content");
    });
  });

  describe("getTrackedFiles", () => {
    it("should respect limit parameter", () => {
      // Create multiple files
      for (let i = 0; i < 10; i++) {
        const testFile = path.join(tempDir, `file-${i}.txt`);
        trackFileWrite(testFile, `content ${i}`);
      }

      const files = getTrackedFiles({ limit: 5 });
      expect(files.length).toBe(5);
    });

    it("should respect offset parameter", () => {
      // Create files with delays to ensure ordering
      for (let i = 0; i < 5; i++) {
        const testFile = path.join(tempDir, `file-${i}.txt`);
        trackFileWrite(testFile, `content ${i}`);
      }

      const files = getTrackedFiles({ limit: 2, offset: 2 });
      expect(files.length).toBe(2);
    });

    it("should filter by type", () => {
      const readFile = path.join(tempDir, "read.txt");
      const writeFile = path.join(tempDir, "write.txt");
      
      fs.writeFileSync(readFile, "test");
      trackFileRead(readFile);
      trackFileWrite(writeFile, "content");

      const reads = getTrackedFiles({ type: "read" });
      const writes = getTrackedFiles({ type: "write" });

      expect(reads.length).toBe(1);
      expect(reads[0].type).toBe("read");
      expect(writes.length).toBe(1);
      expect(writes[0].type).toBe("write");
    });

    it("should sort by timestamp descending", () => {
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");

      trackFileWrite(file1, "content1");
      trackFileWrite(file2, "content2");

      const files = getTrackedFiles();
      expect(files[0].timestamp).toBeGreaterThanOrEqual(files[1].timestamp);
    });
  });

  describe("getTrackingStats", () => {
    it("should return accurate statistics", () => {
      const testFile = path.join(tempDir, "stats.txt");
      fs.writeFileSync(testFile, "original");

      trackFileRead(testFile);
      trackFileWrite(testFile, "modified");

      const stats = getTrackingStats();
      expect(stats.readCount).toBe(1);
      expect(stats.writeCount).toBe(1);
      expect(stats.diffCount).toBe(1);
      expect(stats.totalTracked).toBe(2);
    });

    it("should reflect enabled status", () => {
      process.env.WORKSPACE_TRACKING_ENABLED = "true";
      expect(getTrackingStats().enabled).toBe(true);

      process.env.WORKSPACE_TRACKING_ENABLED = "false";
      expect(getTrackingStats().enabled).toBe(false);
    });
  });

  describe("clearTrackingData", () => {
    it("should clear all tracking data", () => {
      const testFile = path.join(tempDir, "clear.txt");
      trackFileWrite(testFile, "content");

      expect(getTrackedFiles().length).toBe(1);

      clearTrackingData();

      expect(getTrackedFiles().length).toBe(0);
      expect(getTrackingStats().totalTracked).toBe(0);
    });
  });
});

describe("FS Hooks", () => {
  const tempDir = path.join(os.tmpdir(), "ssgm-hooks-test-" + Date.now());

  beforeEach(() => {
    process.env.WORKSPACE_TRACKING_ENABLED = "true";
    clearTrackingData();
    uninstallFsHooks();

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    clearTrackingData();
    uninstallFsHooks();

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe("installFsHooks", () => {
    it("should install hooks when tracking is enabled", () => {
      installFsHooks();
      expect(areHooksInstalled()).toBe(true);
    });

    it("should not install hooks when tracking is disabled", () => {
      process.env.WORKSPACE_TRACKING_ENABLED = "false";
      installFsHooks();
      expect(areHooksInstalled()).toBe(false);
    });

    it("should be idempotent", () => {
      installFsHooks();
      installFsHooks();
      expect(areHooksInstalled()).toBe(true);
    });
  });

  describe("uninstallFsHooks", () => {
    it("should restore original fs functions", () => {
      installFsHooks();
      expect(areHooksInstalled()).toBe(true);

      uninstallFsHooks();
      expect(areHooksInstalled()).toBe(false);
    });

    it("should be safe to call when not installed", () => {
      expect(areHooksInstalled()).toBe(false);
      uninstallFsHooks();
      expect(areHooksInstalled()).toBe(false);
    });
  });

  describe("hooked fs operations", () => {
    it("should track fs.writeFileSync calls", () => {
      installFsHooks();
      
      const testFile = path.join(tempDir, "hooked-write.txt");
      fs.writeFileSync(testFile, "hooked content");

      const files = getTrackedFiles({ type: "write" });
      expect(files.length).toBe(1);
      expect(files[0].path).toBe(testFile);
    });

    it("should track fs.readFileSync calls", () => {
      const testFile = path.join(tempDir, "hooked-read.txt");
      fs.writeFileSync(testFile, "content to read");
      clearTrackingData(); // Clear the write

      installFsHooks();
      fs.readFileSync(testFile, "utf-8");

      const files = getTrackedFiles({ type: "read" });
      expect(files.length).toBe(1);
      expect(files[0].path).toBe(testFile);
    });

    it("should not track node_modules", () => {
      installFsHooks();

      const nodeModulesFile = path.join(tempDir, "node_modules", "test.txt");
      fs.mkdirSync(path.dirname(nodeModulesFile), { recursive: true });
      fs.writeFileSync(nodeModulesFile, "should not track");

      const files = getTrackedFiles();
      expect(files.length).toBe(0);
    });

    it("should preserve original fs behavior", () => {
      installFsHooks();

      const testFile = path.join(tempDir, "behavior.txt");
      fs.writeFileSync(testFile, "test");
      
      const content = fs.readFileSync(testFile, "utf-8");
      expect(content).toBe("test");
    });
  });
});
