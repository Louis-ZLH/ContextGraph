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