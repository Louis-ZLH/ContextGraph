import type { Node, Edge } from "../feature/canvas/types";
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
    nodes: Node[];
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