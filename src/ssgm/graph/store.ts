/**
 * Task Graph Store
 *
 * File-based storage for task graphs in ~/.openclaw/ssgm/graphs/
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type {
  GraphStoreConfig,
  SerializableTaskGraph,
  TaskGraph,
  TaskGraphNode,
} from "./types.js";

const DEFAULT_CONFIG: GraphStoreConfig = {
  baseDir: path.join(os.homedir(), ".openclaw", "ssgm", "graphs"),
  retentionDays: 30,
  maxGraphs: 1000,
};

/** Convert TaskGraph to serializable format */
function toSerializable(graph: TaskGraph): SerializableTaskGraph {
  return {
    runId: graph.runId,
    version: graph.version,
    createdAt: graph.createdAt,
    updatedAt: graph.updatedAt,
    rootId: graph.rootId,
    nodes: Array.from(graph.nodes.entries()),
    edges: graph.edges,
    eventCount: graph.eventCount,
  };
}

/** Convert serializable format back to TaskGraph */
function fromSerializable(serialized: SerializableTaskGraph): TaskGraph {
  return {
    runId: serialized.runId,
    version: serialized.version,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
    rootId: serialized.rootId,
    nodes: new Map(serialized.nodes),
    edges: serialized.edges,
    eventCount: serialized.eventCount,
  };
}

/** Sanitize runId for use as filename */
function sanitizeRunId(runId: string): string {
  // Replace unsafe characters
  return runId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

/** Get graph file path */
function getGraphPath(baseDir: string, runId: string): string {
  const sanitized = sanitizeRunId(runId);
  return path.join(baseDir, `${sanitized}.json`);
}

export class GraphStore {
  private config: GraphStoreConfig;
  private ensureDirPromise: Promise<void> | null = null;

  constructor(config: Partial<GraphStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Ensure the storage directory exists
   */
  private async ensureDir(): Promise<void> {
    if (this.ensureDirPromise) {
      return this.ensureDirPromise;
    }

    this.ensureDirPromise = fs
      .mkdir(this.config.baseDir, { recursive: true })
      .then(() => undefined);

    return this.ensureDirPromise;
  }

  /**
   * Save a graph to storage
   */
  async save(runId: string, graph: TaskGraph): Promise<void> {
    await this.ensureDir();

    const filePath = getGraphPath(this.config.baseDir, runId);
    const serialized = toSerializable(graph);
    const data = JSON.stringify(serialized, null, 2);

    await fs.writeFile(filePath, data, "utf-8");

    // Run cleanup if needed
    if (this.config.maxGraphs) {
      await this.cleanup();
    }
  }

  /**
   * Load a graph from storage
   */
  async load(runId: string): Promise<TaskGraph | null> {
    const filePath = getGraphPath(this.config.baseDir, runId);

    try {
      const data = await fs.readFile(filePath, "utf-8");
      const serialized = JSON.parse(data) as SerializableTaskGraph;
      return fromSerializable(serialized);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Check if a graph exists
   */
  async exists(runId: string): Promise<boolean> {
    const filePath = getGraphPath(this.config.baseDir, runId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a graph
   */
  async delete(runId: string): Promise<boolean> {
    const filePath = getGraphPath(this.config.baseDir, runId);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }

  /**
   * List all stored graph run IDs
   */
  async list(): Promise<Array<{ runId: string; createdAt: string; updatedAt: string }>> {
    await this.ensureDir();

    try {
      const entries = await fs.readdir(this.config.baseDir);
      const graphs: Array<{ runId: string; createdAt: string; updatedAt: string }> = [];

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;

        const runId = entry.slice(0, -5); // Remove .json
        const filePath = path.join(this.config.baseDir, entry);

        try {
          const stat = await fs.stat(filePath);
          const data = await fs.readFile(filePath, "utf-8");
          const serialized = JSON.parse(data) as SerializableTaskGraph;

          graphs.push({
            runId: serialized.runId || runId,
            createdAt: serialized.createdAt,
            updatedAt: serialized.updatedAt,
          });
        } catch {
          // Skip invalid files
          continue;
        }
      }

      // Sort by updatedAt descending
      return graphs.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Clean up old graphs based on retention policy
   */
  async cleanup(): Promise<number> {
    const entries = await this.list();
    let deleted = 0;

    // Delete by retention days
    if (this.config.retentionDays && this.config.retentionDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

      for (const entry of entries) {
        if (new Date(entry.updatedAt) < cutoff) {
          await this.delete(entry.runId);
          deleted++;
        }
      }
    }

    // Delete by max count (keep newest)
    if (this.config.maxGraphs && entries.length - deleted > this.config.maxGraphs) {
      const toDelete = entries.slice(this.config.maxGraphs);
      for (const entry of toDelete) {
        await this.delete(entry.runId);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get storage statistics
   */
  async stats(): Promise<{
    totalGraphs: number;
    totalSize: number;
    oldestGraph: string | null;
    newestGraph: string | null;
  }> {
    await this.ensureDir();

    try {
      const entries = await fs.readdir(this.config.baseDir);
      let totalSize = 0;
      let oldest: Date | null = null;
      let newest: Date | null = null;
      let count = 0;

      for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;

        const filePath = path.join(this.config.baseDir, entry);
        try {
          const stat = await fs.stat(filePath);
          totalSize += stat.size;
          count++;

          if (!oldest || stat.mtime < oldest) {
            oldest = stat.mtime;
          }
          if (!newest || stat.mtime > newest) {
            newest = stat.mtime;
          }
        } catch {
          continue;
        }
      }

      return {
        totalGraphs: count,
        totalSize,
        oldestGraph: oldest?.toISOString() || null,
        newestGraph: newest?.toISOString() || null,
      };
    } catch {
      return {
        totalGraphs: 0,
        totalSize: 0,
        oldestGraph: null,
        newestGraph: null,
      };
    }
  }

  /**
   * Get the storage base directory
   */
  getBaseDir(): string {
    return this.config.baseDir;
  }
}

/** Singleton instance for convenience */
let defaultStore: GraphStore | null = null;

export function getDefaultGraphStore(): GraphStore {
  if (!defaultStore) {
    defaultStore = new GraphStore();
  }
  return defaultStore;
}
