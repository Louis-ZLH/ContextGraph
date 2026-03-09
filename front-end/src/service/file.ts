import type { FileCategory } from "../feature/canvas/canvasSlice";
import { apiRequest } from "../util/api";
import type { JSONResponse, uploadFileResponse, getFileInfoResponse, FileListResponse, StorageUsageResponse } from "./type";
import { toCamelCase } from "../util/transform";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** 判断文件是否超过大小限制（5MB） */
export function isFileTooLarge(file: File): boolean {
  return file.size > MAX_FILE_SIZE;
}

// ────────────── 文件类型检测 ──────────────

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const EXCEL_EXTENSIONS = new Set(["xlsx", "csv"]);
const DOC_EXTENSIONS = new Set(["docx", "pptx", "txt", "md"]);

const ALL_ACCEPTED = new Set([
  ...IMAGE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...EXCEL_EXTENSIONS,
  ...DOC_EXTENSIONS,
  "json",
]);

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** 旧版 Office 格式（.doc/.xls/.ppt）需要明确拒绝并提示用户转换 */
export function isOldOfficeFormat(file: File): boolean {
  const ext = getExtension(file.name);
  if (ext === "doc" || ext === "xls" || ext === "ppt") return true;
  const mime = file.type;
  return (
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint"
  );
}

/** 判断文件是否属于支持的类型（与后端 allowedMIMEPrefixes 对齐） */
export function isFileAccepted(file: File): boolean {
  if (isOldOfficeFormat(file)) return false;

  const mime = file.type;
  if (
    mime.startsWith("image/") ||
    mime === "application/pdf" ||
    mime.startsWith("text/") ||
    mime.startsWith("application/vnd.openxmlformats") ||
    mime === "application/json"
  ) return true;

  // 兜底：按扩展名
  return ALL_ACCEPTED.has(getExtension(file.name));
}

/** 根据 File 对象返回分类 */
export function getFileCategory(file: File): FileCategory {
  return getFileCategoryFromMime(file.type, file.name);
}

/** 根据 MIME type + 文件名返回分类（用于服务端返回的 contentType） */
export function getFileCategoryFromMime(contentType: string, filename?: string): FileCategory {
  if (contentType.startsWith("image/")) return "image";
  if (contentType === "application/pdf") return "pdf";
  if (
    contentType.startsWith("application/vnd.ms-excel") ||
    contentType.startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml") ||
    contentType === "text/csv"
  ) return "excel";
  if (
    contentType === "application/msword" ||
    contentType.startsWith("application/vnd.openxmlformats-officedocument.wordprocessingml") ||
    contentType.startsWith("application/vnd.ms-powerpoint") ||
    contentType.startsWith("application/vnd.openxmlformats-officedocument.presentationml") ||
    (contentType.startsWith("text/") && contentType !== "text/csv")
  ) return "document";

  // 兜底：按扩展名
  if (filename) {
    const ext = getExtension(filename);
    if (IMAGE_EXTENSIONS.has(ext)) return "image";
    if (PDF_EXTENSIONS.has(ext)) return "pdf";
    if (EXCEL_EXTENSIONS.has(ext)) return "excel";
    if (DOC_EXTENSIONS.has(ext)) return "document";
  }

  return "other";
}

// ────────────── 格式化 ──────────────

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ────────────── 上传 ──────────────

/**
 * 上传文件到服务器（mock 实现）
 * 真实 API 就绪后替换此函数即可
 * @returns 上传后的资源 URL
 */
export async function uploadFile(file: File): Promise<{ success: boolean, message: string, data: uploadFileResponse | null }> {
  const formData = new FormData();
  formData.append("file", file);

  try{
    const response = await apiRequest<JSONResponse>("/api/file/upload", {
      method: "POST",
      body: formData,
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message, data: toCamelCase(response.data) as uploadFileResponse };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message, data: null };
    }
    return { success: false, message: "Failed to upload file", data: null };
  }
}


export async function getFileInfo(fileId: string): Promise<{ success: boolean, message: string, data: getFileInfoResponse | null }> {
  try{
    const response = await apiRequest<JSONResponse>(`/api/file/${fileId}/info`, {
      method: "GET",
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message, data: toCamelCase(response.data) as getFileInfoResponse };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message, data: null };
    }
    return { success: false, message: "Failed to get file info", data: null };
  }
}

export async function getFileList(params: { page?: number; limit?: number; keyword?: string }): Promise<{ success: boolean, message: string, data: FileListResponse | null }> {
  try {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set("page", String(params.page));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.keyword) query.set("keyword", params.keyword);

    const response = await apiRequest<JSONResponse>(`/api/file/list?${query.toString()}`, {
      method: "GET",
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message, data: toCamelCase(response.data) as FileListResponse };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message, data: null };
    }
    return { success: false, message: "Failed to get file list", data: null };
  }
}

export async function deleteFile(fileId: string): Promise<{ success: boolean, message: string }> {
  try {
    const response = await apiRequest<JSONResponse>(`/api/file/${fileId}`, {
      method: "DELETE",
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "Failed to delete file" };
  }
}

export async function getStorageUsage(): Promise<{ success: boolean; message: string; data: StorageUsageResponse | null }> {
  try {
    const response = await apiRequest<JSONResponse>("/api/file/storage", {
      method: "GET",
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message, data: toCamelCase(response.data) as StorageUsageResponse };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message, data: null };
    }
    return { success: false, message: "Failed to get storage usage", data: null };
  }
}

export async function bindFileIdToNode(nodeId: string, fileId: string): Promise<{ success: boolean, message: string}> {
  try{
    const response = await apiRequest<JSONResponse>(`api/file/bind-node`, {
      method: "POST",
      body: JSON.stringify({ node_id: nodeId, file_id: fileId }),
    });
    if (response.code !== 0) {
      throw new Error(response.message);
    }
    return { success: true, message: response.message };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return { success: false, message: error.message };
    }
    return { success: false, message: "Failed to bind file id to node" };
  }
}