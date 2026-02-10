/**
 * SSGM Event Store
 * 
 * File-based event storage for runs and events.
 */

import { mkdir, readFile, writeFile, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SsgmEvent, SsgmRun, SsgmEventFilter, SsgmWorkspaceSnapshot, SsgmTaskGraph } from "./types.js";

const MAX_EVENTS_PER_RUN = 10000;
const MAX_RUNS_IN_MEMORY = 100;

export interface SsgmEventStore {
  /** Create a new run */
  createRun(run: SsgmRun): Promise<void>;
  
  /** Update a run */
  updateRun(runId: string, updates: Partial<SsgmRun>): Promise<void>;
  
  /** Get a run by ID */
  getRun(runId: string): Promise<SsgmRun | null>;
  
  /** List all runs with pagination */
  listRuns(options: { limit: number; offset: number }): Promise<{ runs: SsgmRun[]; total: number }>;
  
  /** Append an event to a run */
  appendEvent(event: SsgmEvent): Promise<void>;
  
  /** Get events for a run with filtering */
  getEvents(runId: string, filter?: SsgmEventFilter): Promise<SsgmEvent[]>;
  
  /** Get task graph for a run */
  getTaskGraph(runId: string): Promise<SsgmTaskGraph | null>;
  
  /** Store workspace snapshot */
  storeWorkspaceSnapshot(runId: string, snapshot: SsgmWorkspaceSnapshot): Promise<void>;
  
  /** Get workspace snapshot */
  getWorkspaceSnapshot(runId: string): Promise<SsgmWorkspaceSnapshot | null>;
  
  /** Get health status */
  getHealth(): { status: "healthy" | "degraded" | "unhealthy"; eventCount: number; runCount: number };
}

interface StoredData {
  runs: Record<string, SsgmRun>;
  events: Record<string, SsgmEvent[]>;
  snapshots: Record<string, SsgmWorkspaceSnapshot>;
}

export class FileBasedEventStore implements SsgmEventStore {
  private baseDir: string;
  private data: StoredData = { runs: {}, events: {}, snapshots: {} };
  private dirtyRuns = new Set<string>();
  private dirtyEvents = new Set<string>();
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.startFlushInterval();
  }

  async init(): Promise<void> {
    if (!existsSync(this.baseDir)) {
      await mkdir(this.baseDir, { recursive: true });
    }
    await this.loadData();
  }

  private startFlushInterval(): void {
    // Flush to disk every 30 seconds
    this.flushInterval = setInterval(() => {
      void this.flush();
    }, 30000);
  }

  stop(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  private async loadData(): Promise<void> {
    try {
      const runsPath = join(this.baseDir, "runs.json");
      if (existsSync(runsPath)) {
        const runsData = await readFile(runsPath, "utf-8");
        this.data.runs = JSON.parse(runsData);
      }
    } catch {
      // Ignore load errors, start fresh
    }
  }

  private async flush(): Promise<void> {
    try {
      // Flush runs
      if (this.dirtyRuns.size > 0) {
        const runsPath = join(this.baseDir, "runs.json");
        await writeFile(runsPath, JSON.stringify(this.data.runs, null, 2));
        this.dirtyRuns.clear();
      }

      // Flush events for each dirty run
      for (const runId of this.dirtyEvents) {
        const eventsPath = join(this.baseDir, `events-${runId}.jsonl`);
        const events = this.data.events[runId] ?? [];
        const lines = events.map(e => JSON.stringify(e)).join("\n");
        await writeFile(eventsPath, lines + "\n");
      }
      this.dirtyEvents.clear();
    } catch {
      // Ignore flush errors for now
    }
  }

  async createRun(run: SsgmRun): Promise<void> {
    this.data.runs[run.id] = run;
    this.data.events[run.id] = [];
    this.dirtyRuns.add(run.id);
    await this.flush();
  }

  async updateRun(runId: string, updates: Partial<SsgmRun>): Promise<void> {
    const run = this.data.runs[runId];
    if (!run) return;
    Object.assign(run, updates);
    this.dirtyRuns.add(runId);
  }

  async getRun(runId: string): Promise<SsgmRun | null> {
    return this.data.runs[runId] ?? null;
  }

  async listRuns(options: { limit: number; offset: number }): Promise<{ runs: SsgmRun[]; total: number }> {
    const allRuns = Object.values(this.data.runs)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    
    const total = allRuns.length;
    const runs = allRuns.slice(options.offset, options.offset + options.limit);
    
    return { runs, total };
  }

  async appendEvent(event: SsgmEvent): Promise<void> {
    if (!this.data.events[event.runId]) {
      this.data.events[event.runId] = [];
    }
    
    const events = this.data.events[event.runId];
    events.push(event);
    
    // Enforce max events per run (remove oldest)
    if (events.length > MAX_EVENTS_PER_RUN) {
      this.data.events[event.runId] = events.slice(-MAX_EVENTS_PER_RUN);
    }
    
    this.dirtyEvents.add(event.runId);
    
    // Update run event count
    const run = this.data.runs[event.runId];
    if (run) {
      run.eventCount = this.data.events[event.runId].length;
      this.dirtyRuns.add(event.runId);
    }
  }

  async getEvents(runId: string, filter?: SsgmEventFilter): Promise<SsgmEvent[]> {
    let events = this.data.events[runId] ?? [];
    
    if (!filter) {
      return events;
    }
    
    return events.filter(event => {
      if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
        return false;
      }
      if (filter.agentId && event.agentId !== filter.agentId) {
        return false;
      }
      if (filter.startDate && new Date(event.timestamp) < new Date(filter.startDate)) {
        return false;
      }
      if (filter.endDate && new Date(event.timestamp) > new Date(filter.endDate)) {
        return false;
      }
      if (filter.parentId && event.parentId !== filter.parentId) {
        return false;
      }
      return true;
    });
  }

  async getTaskGraph(runId: string): Promise<SsgmTaskGraph | null> {
    const events = this.data.events[runId] ?? [];
    if (events.length === 0) return null;
    
    const nodes: SsgmTaskGraph["nodes"] = [];
    const edges: SsgmTaskGraph["edges"] = [];
    const nodeMap = new Map<string, SsgmTaskGraph["nodes"][0]>();
    
    // Build nodes from events
    for (const event of events) {
      let node = nodeMap.get(event.id);
      if (!node) {
        node = {
          id: event.id,
          type: this.inferNodeType(event.type),
          label: this.inferNodeLabel(event),
          status: this.inferNodeStatus(event),
          startedAt: event.timestamp,
          eventIds: [event.id],
          parentIds: event.parentId ? [event.parentId] : [],
        };
        nodes.push(node);
        nodeMap.set(event.id, node);
      }
      
      // Add edges from parent
      if (event.parentId) {
        edges.push({
          from: event.parentId,
          to: event.id,
          type: "sequence",
        });
      }
    }
    
    return { runId, nodes, edges };
  }

  private inferNodeType(eventType: SsgmEvent["type"]): SsgmTaskGraph["nodes"][0]["type"] {
    if (eventType.startsWith("agent.")) return "agent";
    if (eventType.startsWith("tool.")) return "tool";
    if (eventType.startsWith("checkpoint.")) return "checkpoint";
    return "event";
  }

  private inferNodeLabel(event: SsgmEvent): string {
    const payload = event.payload as Record<string, unknown> | undefined;
    if (payload?.name) return String(payload.name);
    if (payload?.tool) return String(payload.tool);
    if (event.agentId) return `${event.type} (${event.agentId})`;
    return event.type;
  }

  private inferNodeStatus(event: SsgmEvent): SsgmTaskGraph["nodes"][0]["status"] {
    if (event.type.endsWith(".error")) return "failed";
    if (event.type.endsWith(".complete")) return "completed";
    if (event.type.endsWith(".cancel")) return "cancelled";
    if (event.type.endsWith(".start")) return "running";
    return "pending";
  }

  async storeWorkspaceSnapshot(runId: string, snapshot: SsgmWorkspaceSnapshot): Promise<void> {
    this.data.snapshots[runId] = snapshot;
    const snapshotPath = join(this.baseDir, `snapshot-${runId}.json`);
    await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));
  }

  async getWorkspaceSnapshot(runId: string): Promise<SsgmWorkspaceSnapshot | null> {
    // Check memory first
    if (this.data.snapshots[runId]) {
      return this.data.snapshots[runId];
    }
    
    // Try to load from disk
    try {
      const snapshotPath = join(this.baseDir, `snapshot-${runId}.json`);
      const data = await readFile(snapshotPath, "utf-8");
      const snapshot = JSON.parse(data);
      this.data.snapshots[runId] = snapshot;
      return snapshot;
    } catch {
      return null;
    }
  }

  getHealth(): { status: "healthy" | "degraded" | "unhealthy"; eventCount: number; runCount: number } {
    const runCount = Object.keys(this.data.runs).length;
    const eventCount = Object.values(this.data.events).reduce((sum, events) => sum + events.length, 0);
    
    if (eventCount > MAX_EVENTS_PER_RUN * MAX_RUNS_IN_MEMORY) {
      return { status: "degraded", eventCount, runCount };
    }
    
    return { status: "healthy", eventCount, runCount };
  }
}

// Singleton store instance
let globalStore: SsgmEventStore | null = null;

export function getEventStore(baseDir?: string): SsgmEventStore {
  if (!globalStore && baseDir) {
    globalStore = new FileBasedEventStore(baseDir);
  }
  if (!globalStore) {
    throw new Error("Event store not initialized");
  }
  return globalStore;
}

export async function initEventStore(baseDir: string): Promise<SsgmEventStore> {
  const store = new FileBasedEventStore(baseDir);
  await store.init();
  globalStore = store;
  return store;
}
