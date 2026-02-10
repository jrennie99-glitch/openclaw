/**
 * Task Graph Builder
 *
 * Builds hierarchical task graphs from event streams.
 */

import type {
  GraphBuilderConfig,
  GraphEvent,
  GoalNode,
  TaskGraph,
  TaskGraphNode,
  TaskNode,
  StepNode,
  ToolCallNode,
  EventNode,
  GraphEdge,
  GraphNodeStatus,
} from "./types.js";

const DEFAULT_CONFIG: Required<GraphBuilderConfig> = {
  maxDepth: 10,
  includeEventNodes: false,
  autoPosition: true,
};

/** Extracts goal information from events */
function extractGoal(events: GraphEvent[]): {
  prompt: string;
  sessionKey: string;
  agentId?: string;
  timestamp: string;
} | null {
  for (const event of events) {
    // Look for initial user message or wake event
    if (event.type === "message" || event.type === "user_message" || event.type === "wake") {
      return {
        prompt: String(event.data.text || event.data.content || event.data.prompt || ""),
        sessionKey: String(event.data.sessionKey || event.data.session || "default"),
        agentId: event.data.agentId ? String(event.data.agentId) : undefined,
        timestamp: event.timestamp,
      };
    }
  }
  return null;
}

/** Determines if an event indicates a new task */
function isTaskStart(event: GraphEvent): boolean {
  const taskTypes = ["task_start", "objective_start", "plan_start", "subagent_spawn"];
  return taskTypes.includes(event.type);
}

/** Determines if an event indicates task completion */
function isTaskEnd(event: GraphEvent): boolean {
  const endTypes = ["task_end", "objective_complete", "plan_complete", "subagent_complete"];
  return endTypes.includes(event.type);
}

/** Determines if an event indicates a step */
function isStep(event: GraphEvent): boolean {
  const stepTypes = ["step", "action", "thinking", "reasoning"];
  return stepTypes.includes(event.type) || event.type.includes("step");
}

/** Determines if an event is a tool call */
function isToolCall(event: GraphEvent): boolean {
  return event.type === "tool_call" || event.type === "function_call" || event.type === "invoke";
}

/** Maps event status to graph node status */
function mapStatus(
  event: GraphEvent,
  defaultStatus: GraphNodeStatus = "pending",
): GraphNodeStatus {
  const status = event.data.status;
  if (typeof status === "string") {
    const validStatuses: GraphNodeStatus[] = [
      "pending",
      "running",
      "completed",
      "failed",
      "skipped",
      "cancelled",
    ];
    if (validStatuses.includes(status as GraphNodeStatus)) {
      return status as GraphNodeStatus;
    }
  }

  // Infer from event type
  if (event.type.includes("error") || event.type.includes("fail")) {
    return "failed";
  }
  if (event.type.includes("complete") || event.type.includes("success")) {
    return "completed";
  }
  if (event.type.includes("skip")) {
    return "skipped";
  }
  if (event.type.includes("cancel")) {
    return "cancelled";
  }
  if (event.type.includes("start") || event.type.includes("begin")) {
    return "running";
  }

  return defaultStatus;
}

/** Generates a unique node ID */
function generateId(prefix: string, index: number): string {
  return `${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Calculate positions for tree layout */
function calculatePositions(
  nodes: Map<string, TaskGraphNode>,
  rootId: string,
): Map<string, TaskGraphNode> {
  const positioned = new Map(nodes);
  const nodeHeight = 60;
  const nodeWidth = 200;
  const levelGap = 100;
  const siblingGap = 20;

  // Build parent-child relationships
  const children = new Map<string, string[]>();
  for (const [id, node] of positioned) {
    if (node.parentId) {
      const siblings = children.get(node.parentId) || [];
      siblings.push(id);
      children.set(node.parentId, siblings);
    }
  }

  // Recursive position calculation
  function positionNode(nodeId: string, level: number, offset: number): number {
    const node = positioned.get(nodeId);
    if (!node) return offset;

    const nodeChildren = children.get(nodeId) || [];

    if (nodeChildren.length === 0) {
      // Leaf node
      node.position = {
        x: level * (nodeWidth + levelGap),
        y: offset,
      };
      positioned.set(nodeId, node);
      return offset + nodeHeight + siblingGap;
    }

    // Parent node - position children first
    let childOffset = offset;
    for (const childId of nodeChildren) {
      childOffset = positionNode(childId, level + 1, childOffset);
    }

    // Center parent over children
    const firstChild = positioned.get(nodeChildren[0]);
    const lastChild = positioned.get(nodeChildren[nodeChildren.length - 1]);
    const parentY =
      ((firstChild?.position?.y || 0) + (lastChild?.position?.y || 0)) / 2;

    node.position = {
      x: level * (nodeWidth + levelGap),
      y: parentY,
    };
    positioned.set(nodeId, node);

    return childOffset;
  }

  positionNode(rootId, 0, 0);
  return positioned;
}

export class TaskGraphBuilder {
  private config: Required<GraphBuilderConfig>;

  constructor(config: GraphBuilderConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build a task graph from a stream of events
   */
  buildFromEvents(runId: string, events: GraphEvent[]): TaskGraph {
    const now = new Date().toISOString();
    const nodes = new Map<string, TaskGraphNode>();
    const edges: GraphEdge[] = [];

    // Extract goal info
    const goalInfo = extractGoal(events);
    const rootId = generateId("goal", 0);

    // Create root goal node
    const goalNode: GoalNode = {
      id: rootId,
      type: "goal",
      name: goalInfo?.prompt?.slice(0, 100) || "Untitled Goal",
      status: "completed",
      parentId: null,
      children: [],
      createdAt: goalInfo?.timestamp || now,
      completedAt: events[events.length - 1]?.timestamp || now,
      prompt: goalInfo?.prompt || "",
      sessionKey: goalInfo?.sessionKey || "default",
      agentId: goalInfo?.agentId,
      metadata: {},
    };
    nodes.set(rootId, goalNode);

    // Track current task for nested structure
    let currentTaskId: string | null = null;
    let currentStepId: string | null = null;
    let taskIndex = 0;
    let stepIndex = 0;
    let toolIndex = 0;

    // Process events to build graph
    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      if (isTaskStart(event)) {
        const taskId = generateId("task", taskIndex++);
        const taskNode: TaskNode = {
          id: taskId,
          type: "task",
          name: String(event.data.name || event.data.title || `Task ${taskIndex}`),
          status: "running",
          parentId: rootId,
          children: [],
          createdAt: event.timestamp,
          description: String(event.data.description || event.data.text || ""),
          complexity: typeof event.data.complexity === "number" ? event.data.complexity : undefined,
          metadata: { eventId: event.id },
        };
        nodes.set(taskId, taskNode);
        goalNode.children.push(taskId);
        edges.push({ from: rootId, to: taskId, type: "child" });
        currentTaskId = taskId;
        currentStepId = null;
        stepIndex = 0;
      } else if (isTaskEnd(event) && currentTaskId) {
        const task = nodes.get(currentTaskId) as TaskNode | undefined;
        if (task) {
          task.status = mapStatus(event, "completed");
          task.completedAt = event.timestamp;
          // Calculate duration if start time exists
          if (task.createdAt) {
            task.duration =
              new Date(event.timestamp).getTime() - new Date(task.createdAt).getTime();
          }
          nodes.set(currentTaskId, task);
        }
        currentTaskId = null;
        currentStepId = null;
      } else if (isStep(event) && currentTaskId) {
        const stepId = generateId("step", stepIndex++);
        const stepNode: StepNode = {
          id: stepId,
          type: "step",
          name: String(event.data.name || `Step ${stepIndex}`),
          status: mapStatus(event, "running"),
          parentId: currentTaskId,
          children: [],
          createdAt: event.timestamp,
          description: String(event.data.description || event.data.text || ""),
          index: stepIndex,
          metadata: { eventId: event.id },
        };
        nodes.set(stepId, stepNode);
        const task = nodes.get(currentTaskId) as TaskNode | undefined;
        if (task) {
          task.children.push(stepId);
          nodes.set(currentTaskId, task);
        }
        edges.push({ from: currentTaskId, to: stepId, type: "child" });
        currentStepId = stepId;
        toolIndex = 0;
      } else if (isToolCall(event)) {
        const parentId = currentStepId || currentTaskId || rootId;
        const toolId = generateId("tool", toolIndex++);
        const toolNode: ToolCallNode = {
          id: toolId,
          type: "tool_call",
          name: String(event.data.tool || event.data.name || event.data.function || "unknown"),
          status: mapStatus(event, "running"),
          parentId,
          children: [],
          createdAt: event.timestamp,
          tool: String(event.data.tool || event.data.name || event.data.function || "unknown"),
          arguments: (event.data.arguments || event.data.args || event.data.parameters || {}) as Record<string, unknown>,
          result: event.data.result,
          error: event.data.error ? String(event.data.error) : undefined,
          metadata: { eventId: event.id },
        };
        nodes.set(toolId, toolNode);
        const parent = nodes.get(parentId);
        if (parent) {
          parent.children.push(toolId);
          nodes.set(parentId, parent);
        }
        edges.push({ from: parentId, to: toolId, type: "child" });

        // Update status if result present
        if (event.data.result !== undefined) {
          toolNode.status = "completed";
          toolNode.completedAt = event.timestamp;
          nodes.set(toolId, toolNode);
        } else if (event.data.error) {
          toolNode.status = "failed";
          toolNode.completedAt = event.timestamp;
          nodes.set(toolId, toolNode);
        }
      }

      // Handle result/completion events for tool calls
      if (event.type === "tool_result" || event.type === "function_result") {
        // Find the most recent tool call without a result
        for (const [id, node] of nodes) {
          if (
            node.type === "tool_call" &&
            node.status === "running" &&
            !node.completedAt
          ) {
            const toolNode = node as ToolCallNode;
            toolNode.result = event.data.result;
            toolNode.status = event.data.error ? "failed" : "completed";
            toolNode.completedAt = event.timestamp;
            toolNode.duration =
              new Date(event.timestamp).getTime() - new Date(toolNode.createdAt).getTime();
            nodes.set(id, toolNode);
            break;
          }
        }
      }
    }

    // Update goal status based on children
    const hasFailed = goalNode.children.some((childId) => {
      const child = nodes.get(childId);
      return child?.status === "failed";
    });
    if (hasFailed) {
      goalNode.status = "failed";
    }

    // Calculate positions if auto-positioning enabled
    let finalNodes = nodes;
    if (this.config.autoPosition) {
      finalNodes = calculatePositions(nodes, rootId);
    }

    return {
      runId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      rootId,
      nodes: finalNodes,
      edges,
      eventCount: events.length,
    };
  }

  /**
   * Merge new events into an existing graph
   */
  mergeEvents(graph: TaskGraph, newEvents: GraphEvent[]): TaskGraph {
    // For now, rebuild from all events
    // In production, this would do incremental updates
    const allEvents: GraphEvent[] = [];
    // Note: Events aren't stored in graph, so we need to fetch them separately
    // This is a placeholder for incremental update logic

    return this.buildFromEvents(graph.runId, allEvents);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<GraphBuilderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
