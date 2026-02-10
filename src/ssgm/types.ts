/**
 * SSGM (Snapshot/Session Graph Manager) Event Types
 * 
 * Core event schema for the observability and mission control system.
 */

export type SsgmEventType = 
  | "run.start"
  | "run.end"
  | "agent.spawn"
  | "agent.complete"
  | "agent.error"
  | "tool.invoke"
  | "tool.result"
  | "tool.error"
  | "message.send"
  | "message.receive"
  | "file.read"
  | "file.write"
  | "file.delete"
  | "checkpoint.create"
  | "checkpoint.restore"
  | "approval.request"
  | "approval.grant"
  | "approval.deny"
  | "system.error"
  | "system.warning"
  | "system.info";

export interface SsgmEvent {
  /** Unique event ID (UUID) */
  id: string;
  /** Run/session ID this event belongs to */
  runId: string;
  /** Event timestamp (ISO 8601) */
  timestamp: string;
  /** Event type */
  type: SsgmEventType;
  /** Agent ID that generated this event (if applicable) */
  agentId?: string;
  /** Event payload (type-specific data) */
  payload: Record<string, unknown>;
  /** Parent event ID for hierarchical relationships */
  parentId?: string;
  /** Sequence number within the run */
  sequence: number;
}

export interface SsgmRun {
  /** Unique run ID */
  id: string;
  /** Run start time */
  startedAt: string;
  /** Run end time (if completed) */
  endedAt?: string;
  /** Run status */
  status: "running" | "completed" | "failed" | "cancelled";
  /** Initial prompt/message that started the run */
  prompt?: string;
  /** Root agent ID */
  rootAgentId?: string;
  /** Total event count */
  eventCount: number;
  /** Error message (if failed) */
  error?: string;
}

export interface SsgmTaskGraph {
  /** Run ID */
  runId: string;
  /** Nodes (agents/tools/events) */
  nodes: SsgmTaskNode[];
  /** Edges (relationships) */
  edges: SsgmTaskEdge[];
}

export interface SsgmTaskNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: "agent" | "tool" | "event" | "checkpoint";
  /** Display label */
  label: string;
  /** Status */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  /** Start time */
  startedAt: string;
  /** End time (if completed) */
  endedAt?: string;
  /** Event IDs associated with this node */
  eventIds: string[];
  /** Parent node IDs */
  parentIds: string[];
}

export interface SsgmTaskEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: "spawn" | "invoke" | "depend" | "sequence";
}

export interface SsgmWorkspaceSnapshot {
  /** Run ID */
  runId: string;
  /** Timestamp */
  timestamp: string;
  /** Files in workspace */
  files: SsgmWorkspaceFile[];
  /** Total size in bytes */
  totalSizeBytes: number;
}

export interface SsgmWorkspaceFile {
  /** Relative path */
  path: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Last modified time */
  modifiedAt: string;
  /** File hash (SHA-256) */
  hash?: string;
  /** Content snapshot (if small enough) */
  content?: string;
}

/** Event filter options */
export interface SsgmEventFilter {
  /** Filter by event types */
  eventTypes?: SsgmEventType[];
  /** Filter by agent ID */
  agentId?: string;
  /** Start date (ISO 8601) */
  startDate?: string;
  /** End date (ISO 8601) */
  endDate?: string;
  /** Parent event ID */
  parentId?: string;
}

/** Redaction configuration */
export interface SsgmRedactionConfig {
  /** Redact file contents */
  redactFileContents?: boolean;
  /** Redact tool arguments */
  redactToolArgs?: boolean;
  /** Redact message contents */
  redactMessages?: boolean;
  /** Patterns to redact */
  redactPatterns?: RegExp[];
}
