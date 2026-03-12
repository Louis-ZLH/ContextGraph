import type { Edge } from "../feature/canvas/types";
export type User = {
    userId: string;
    username: string;
    email: string;
    plan: "free" | "plus" | "pro";
    avatarUrl: string;
    tokenQuota: string;
}

export interface JSONResponse {
    code: number;
    message: string;
    data?: Record<string, unknown>;
}

export interface CanvasListInfo {
    canvasList: Canvas[];
}

export interface Canvas {
    id: string;
    title: string;
    updatedAt: string;
}

export interface CanvasDetail {
    canvasId: string;
    title: string;
    nodes: BackendNode[];
    edges: Edge[];
    version: number; // 当前版本号，用于乐观更新
}

export interface syncResponse {
    updatedAt: string;
    version: number;
    stats: SyncStats;
}

export interface SyncStats {
    nodesUpdated: number;
    nodesCreated: number;
    nodesDeleted: number;
    edgesCreated: number;
    edgesDeleted: number;
}

export interface fullSyncResponse {
    updatedAt: string;
    version: number;
}

export interface getCanvasVersionResponse {
    version: number;
}

export interface uploadFileResponse {
    fileId: string;
}

export interface getFileInfoResponse {
    fileId: string;
    filename: string;
    fileSize: number;
    contentType: string;
}

export interface FileListItem {
    fileId: string;
    filename: string;
    fileSize: number;
    contentType: string;
    createdAt: string;
}

export interface FileListResponse {
    files: FileListItem[];
    total: number;
    page: number;
    limit: number;
}

// 搜索结果单项
export interface CanvasSearchItem {
    canvasId: string;
    title: string;
    updatedAt: string;
    matchType: "title" | "conversation" | "content";
    matchText: string;
}

// 搜索响应
export interface CanvasSearchResponse {
    results: CanvasSearchItem[];
    total: number;
    page: number;
    limit: number;
}

export interface StorageUsageResponse {
  used: number;
  limit: number;
}

// 前端传后端的数据格式
export interface DTONodeReadyToSend {
    id: string;
    type: "chatNode" | "resourceNode";
    position: { x: number; y: number };
    file_id?: string;
}

// 后端传前端，驼峰化之后的数据格式
export interface BackendNode {
    id: string;
    type: "chatNode" | "resourceNode";
    position: { x: number; y: number };
    fileId?: string;
}

// AI 文件生成相关 SSE 事件数据
export interface ImagePartialData {
    type?: string;  // Go transparently passes RawData which includes redundant type field
    b64_image: string;
    partial_index: number;
    chat_node_id: string;
    message_id: string;
}

export interface ResourceCreatedData {
    type?: string;  // Same as above, redundant field from Go RawData passthrough
    file_id: string;  // int64 snowflake ID, Go serializes as string via json:"file_id,string"
    node_id: string;
    edge_id: string;
    filename: string;
    content_type: string;
    chat_node_id: string;
    message_id: string;  // associated assistant message ID
    position: { x: number; y: number };
    file_url: string;  // File access URL for all file types
}