/**
 * SSGM Task Graph Types
 *
 * Defines the data structures for task dependency graphs.
 */

/** Status values for graph nodes */
export type GraphNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "cancelled";

/** Types of nodes in the task graph */
export type GraphNodeType = "goal" | "task" | "step" | "tool_call" | "event";

/** Base node properties */
export interface GraphNode {
  /** Unique identifier */
  id: string;
  /** Node type */
  type: GraphNodeType;
  /** Display name/title */
  name: string;
  /** Current status */
  status: GraphNodeStatus;
  /** Parent node ID (null for root) */
  parentId: string | null;
  /** Child node IDs */
  children: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Duration in milliseconds */
  duration?: number;
  /** Metadata */
  metadata: Record<string, unknown>;
  /** Position for visualization (optional) */
  position?: { x: number; y: number };
}

/** Goal node - the root of a run */
export interface GoalNode extends GraphNode {
  type: "goal";
  /** Initial user query/prompt */
  prompt: string;
  /** Session key */
  sessionKey: string;
  /** Agent ID that handled this goal */
  agentId?: string;
}

/** Task node - high-level objective */
export interface TaskNode extends GraphNode {
  type: "task";
  /** Task description */
  description: string;
  /** Estimated complexity (1-10) */
  complexity?: number;
}

/** Step node - discrete action within a task */
export interface StepNode extends GraphNode {
  type: "step";
  /** Step description */
  description: string;
  /** Step index within parent task */
  index: number;
}

/** Tool call node -invocation of a tool */
export interface ToolCallNode extends GraphNode {
  type: "tool_call";
  /** Tool name */
  tool: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
  /** Tool result (if completed) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
}

/** Event node - raw event reference */
export interface EventNode extends GraphNode {
  type: "event";
  /** Event type */
  eventType: string;
  /** Event timestamp */
  timestamp: string;
  /** Raw event data reference */
  eventRef: string;
}

/** Union type for all node types */
export type TaskGraphNode = GoalNode | TaskNode | StepNode | ToolCallNode | EventNode;

/** Edge representing dependency between nodes */
export interface GraphEdge {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Edge type */
  type: "child" | "depends_on" | "triggers";
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/** Complete task graph for a run */
export interface TaskGraph {
  /** Run identifier */
  runId: string;
  /** Graph version */
  version: number;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Root node ID */
  rootId: string;
  /** All nodes in the graph */
  nodes: Map<string, TaskGraphNode>;
  /** All edges in the graph */
  edges: GraphEdge[];
  /** Events processed count */
  eventCount: number;
}

/** Serializable version of TaskGraph for JSON storage */
export interface SerializableTaskGraph {
  runId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  rootId: string;
  nodes: Array<[string, TaskGraphNode]>;
  edges: GraphEdge[];
  eventCount: number;
}

/** Event input for graph building */
export interface GraphEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: string;
  /** Timestamp */
  timestamp: string;
  /** Event payload */
  data: Record<string, unknown>;
}

/** Builder configuration */
export interface GraphBuilderConfig {
  /** Maximum depth for graph traversal */
  maxDepth?: number;
  /** Include raw event nodes */
  includeEventNodes?: boolean;
  /** Auto-assign positions */
  autoPosition?: boolean;
}

/** Store configuration */
export interface GraphStoreConfig {
  /** Base directory for graph storage */
  baseDir: string;
  /** Retention period in days (0 = infinite) */
  retentionDays?: number;
  /** Max graphs to keep */
  maxGraphs?: number;
}

/** Graph statistics */
export interface GraphStats {
  /** Total nodes */
  nodeCount: number;
  /** Nodes by type */
  nodesByType: Record<GraphNodeType, number>;
  /** Nodes by status */
  nodesByStatus: Record<GraphNodeStatus, number>;
  /** Total edges */
  edgeCount: number;
  /** Maximum depth */
  maxDepth: number;
  /** Total duration (ms) */
  totalDuration?: number;
}
