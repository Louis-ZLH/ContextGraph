import type { Node as NodeBase, Edge as EdgeBase } from "@xyflow/react";

export type FileCategory = "image" | "pdf" | "excel" | "document" | "other";

export interface NodeData {
  // Resource node 相关
  resourceUrl?: string;
  uploadStatus?: "uploading" | "success" | "error";
  fileName?: string;
  fileType?: FileCategory;
  mimeType?: string;
  fileSize?: number;
  [key: string]: unknown;
}

export interface Node extends NodeBase {
  id: string;
  type: "chatNode" | "resourceNode";
  position: { x: number; y: number };
  data: NodeData;
}

export interface Edge extends EdgeBase {
  id: string;
  source: string;
  target: string;
  type: "custom-edge";
}

/** 原子操作 */
export interface AtomicOp {
  type:
    | "create_node"
    | "delete_node"
    | "update_node"
    | "create_edge"
    | "delete_edge";
  data: Node | Edge;
}

/** 一次用户操作 = 正向 + 反向 */
export interface Command {
  canvas_id: string;
  timeStamp: number;
  forward: AtomicOp[];
  backward: AtomicOp[];
}

export interface GraphDelta {
  updatedNodes: Node[];
  createdNodes: Node[];
  deletedNodesId: string[];
  createdEdges: Edge[];
  deletedEdgesId: string[];
  // Node 同id冲突处理：
  // 1. create → update   合并进 createdNodes（新值覆盖）
  // 2. create → delete   从 createdNodes 中删除（抵消）
  // 3. update → update   新值覆盖旧值
  // 4. update → delete   从 updatedNodes 中删除，加入 deletedNodesId
  // 5. delete → create   从 deletedNodesId 中删除，放进 updatedNodes（后端已有该行）

  // Edge 同id冲突处理：
  // 1. create → delete   从 createdEdges 中删除（抵消）
  // 2. delete → create   从 deletedEdgesId 中删除（抵消）

  // 级联处理：
  // delete_node 时： 所有关联边 集合为U
  // 1. 处在createdEdges中的边是子集V，需要从createdEdges中删除
  // 2. 同时将 U-V 加入 deletedEdgesId
}

export interface CanvasState {
  canvasId: string | null;
  title: string;
  showControls: boolean;

    // 核心数据
  nodes: Node[];
  edges: Edge[];
  version: number;  // 当前版本号，用于乐观更新

    // undo / redo
  undoStack: Command[];
  redoStack: Command[];
  maxHistory: number;
  pendingDelta: GraphDelta;
  syncStatus: "idle" | "syncing" | "error";
  syncFailCount: number; // 同步失败次数
  isFullSyncing: boolean; // 全量同步中，显示 loading overlay
}

