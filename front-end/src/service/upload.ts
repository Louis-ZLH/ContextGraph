import type { FileCategory } from "../feature/canvas/canvasSlice";

// ────────────── 文件类型检测 ──────────────

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const EXCEL_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);
const DOC_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "txt", "rtf"]);

const ALL_ACCEPTED = new Set([
  ...IMAGE_EXTENSIONS,
  ...PDF_EXTENSIONS,
  ...EXCEL_EXTENSIONS,
  ...DOC_EXTENSIONS,
]);

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

/** 判断文件是否属于支持的类型 */
export function isFileAccepted(file: File): boolean {
  // 优先 MIME
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/pdf") return true;
  if (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type === "text/csv"
  ) return true;
  if (
    file.type.includes("word") ||
    file.type.includes("document") ||
    file.type.includes("powerpoint") ||
    file.type.includes("presentation") ||
    file.type === "text/plain"
  ) return true;

  // 兜底：按扩展名
  return ALL_ACCEPTED.has(getExtension(file.name));
}

/** 根据文件返回分类 */
export function getFileCategory(file: File): FileCategory {
  const ext = getExtension(file.name);

  // MIME 优先
  if (file.type.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)) return "image";
  if (file.type === "application/pdf" || PDF_EXTENSIONS.has(ext)) return "pdf";
  if (
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type === "text/csv" ||
    EXCEL_EXTENSIONS.has(ext)
  ) return "excel";
  if (
    file.type.includes("word") ||
    file.type.includes("document") ||
    file.type.includes("powerpoint") ||
    file.type.includes("presentation") ||
    file.type === "text/plain" ||
    DOC_EXTENSIONS.has(ext)
  ) return "document";

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
export async function uploadFile(_nodeId: string, file: File): Promise<string> {
  // TODO: 替换为真实 API 调用
  // return await api.post(`/upload`, { nodeId, file });

  // Mock: 模拟 1.5s 上传延迟，返回 blob URL（图片可直接预览）
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(URL.createObjectURL(file));
    }, 1500);
  });
}
