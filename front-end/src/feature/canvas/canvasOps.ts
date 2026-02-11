import type { Node, Edge, AtomicOp, Command, GraphDelta, CanvasState } from "./types";

export const emptyDelta = (): GraphDelta => ({
    updatedNodes: [],
    createdNodes: [],
    deletedNodesId: [],
    createdEdges: [],
    deletedEdgesId: [],
});

export function applyOps(state: CanvasState, ops: AtomicOp[]) {
    for (const op of ops) {
      switch (op.type) {
        case "create_node":
          state.nodes.push(op.data as Node);
          break;
  
        case "delete_node":
          state.nodes = state.nodes.filter((n) => n.id !== op.data.id);
          // 级联外部处理
          break;
  
        case "update_node": {
          const index = state.nodes.findIndex((n) => n.id === op.data.id);
          if (index !== -1) {
            state.nodes[index] = { ...state.nodes[index], ...(op.data as Node) };
          }
          break;
        }
  
        case "create_edge":
          // 防重复, !!!!之后外部注意做判断********************************************************
          if (
            !state.edges.some(
              (e) =>
                e.source === (op.data as Edge).source &&
                e.target === (op.data as Edge).target
            )
          ) {
            state.edges.push(op.data as Edge);
          }
          break;
  
        case "delete_edge":
          state.edges = state.edges.filter(
            (e) => e.id !== (op.data as Edge).id
          );
          break;
      }
    }
  }
  
/** 将 AtomicOps 合并进 pendingDelta，包含抵消逻辑 */
export function mergeOpsToDelta(state: CanvasState,delta: GraphDelta, ops: AtomicOp[]) {
for (const op of ops) {
    switch (op.type) {
    case "create_node": {
        // delete后create，抵消
        const deletedNodeIndex = delta.deletedNodesId.findIndex((id) => id === op.data.id);
        if (deletedNodeIndex >= 0) {
        delta.deletedNodesId.splice(deletedNodeIndex, 1);
        mergeNodeUpdate(delta, op.data as Node);
        } else {
        // 检查是否已经在 createdNodes 里（不应该，但防御性编程）
        const existing = delta.createdNodes.find((n) => n.id === op.data.id);
        if (existing) {
            delta.createdNodes = delta.createdNodes.filter((n) => n.id !== op.data.id);
        } 
        delta.createdNodes.push(op.data as Node);
        }
        break;
    }
    case "delete_node": {
        const createdNodeIndex = delta.createdNodes.findIndex((n) => n.id === op.data.id);
        if (createdNodeIndex >= 0) {
        delta.createdNodes.splice(createdNodeIndex, 1);
        delta.updatedNodes = delta.updatedNodes.filter((n) => n.id !== op.data.id);
        } else {
        if (!delta.deletedNodesId.includes(op.data.id)) {
            delta.deletedNodesId.push(op.data.id);
        }
        delta.updatedNodes = delta.updatedNodes.filter((n) => n.id !== op.data.id);
        }
        // 进行级联外部显示处理
        break;
    }
    case "update_node": {
        const inCreated = delta.createdNodes.find((n) => n.id === op.data.id);
        if (inCreated) {
        delta.createdNodes = delta.createdNodes.filter((n) => n.id !== op.data.id);
        delta.createdNodes.push(op.data as Node);
        } else {
        mergeNodeUpdate(delta, op.data as Node);
        }
        break;
    }
    case "create_edge": {
        const deletedEdgeIndex = delta.deletedEdgesId.findIndex((id) => id === op.data.id);
        if (deletedEdgeIndex >= 0) {
        delta.deletedEdgesId.splice(deletedEdgeIndex, 1); //抵消
        } else {
        if (!delta.createdEdges.some((e) => e.id === op.data.id)) {
            delta.createdEdges.push(op.data as Edge);
        }
        }
        break;
    }
    case "delete_edge": {
        const createdEdgeIndex = delta.createdEdges.findIndex((e) => e.id === op.data.id);
        if (createdEdgeIndex >= 0) {
        delta.createdEdges.splice(createdEdgeIndex, 1);
        } else {
        if (!delta.deletedEdgesId.includes(op.data.id)) {
            delta.deletedEdgesId.push(op.data.id);
        }
        }
        break;
    }
    default: {
        console.warn(`Unknown operation type: ${op.type}`);
        break;
    }
    }
}
}

/** 合并node更新操作 */
export function mergeNodeUpdate(delta: GraphDelta, node: Node) {
    const existingNode = delta.updatedNodes.find((n) => n.id === node.id);
    if (existingNode) {
        delta.updatedNodes = delta.updatedNodes.filter((n) => n.id !== node.id);
    }
    delta.updatedNodes.push(node);
}

export function applyCommand(state: CanvasState, cmd: Command) {
    //1. 应用到 state
    applyOps(state, cmd.forward);

    //2. 合并进 pendingDelta
    mergeOpsToDelta(state, state.pendingDelta, cmd.forward);

    //3. 压入 undo 栈
    state.undoStack.push(cmd);
    if (state.undoStack.length > state.maxHistory) {
    state.undoStack.shift(); // 超过上限丢弃最早的
    }

    //4. 清空 redo 栈
    state.redoStack = [];
}