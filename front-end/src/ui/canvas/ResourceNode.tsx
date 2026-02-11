import { useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import { useDispatch } from "react-redux";
import type { NodeData, FileCategory } from "../../feature/canvas/canvasSlice";
import { deleteNode } from "../../feature/canvas/canvasSlice";
import { formatFileSize } from "../../service/upload";

// ────────────── 文件类型图标映射 ──────────────

function FileTypeIcon({ fileType, size = 28 }: { fileType?: FileCategory; size?: number }) {
  switch (fileType) {
    case "image":
      return <FileImage size={size} className="source-meta-icon" />;
    case "pdf":
      return <FileText size={size} className="source-meta-icon" />;
    case "excel":
      return <FileSpreadsheet size={size} className="source-meta-icon" />;
    case "document":
      return <FileText size={size} className="source-meta-icon" />;
    default:
      return <File size={size} className="source-meta-icon" />;
  }
}

function getFileExtLabel(fileName?: string): string {
  if (!fileName) return "";
  return fileName.split(".").pop()?.toUpperCase() ?? "";
}

// ────────────── 主组件 ──────────────

function ResourceNode({ id, data }: { id: string; data: NodeData }) {
  const dispatch = useDispatch();
  const status = data.uploadStatus ?? (data.resourceUrl ? "success" : "error");
  const fileName = data.fileName ?? "Unknown file";
  const fileType = data.fileType as FileCategory | undefined;
  const extLabel = getFileExtLabel(data.fileName);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="source-node rounded-xl flex flex-col w-[280px] text-sm">
      {/* ── Header ── */}
      <div className="source-header h-10 border-b border-main flex items-center justify-between px-3 cursor-move rounded-t-xl">
        <div className="flex items-center gap-2">
          <FileTypeIcon fileType={fileType} size={12} />
          <span className="text-xs font-bold uppercase tracking-wider text-secondary">
            Source
          </span>
        </div>
        <div className="flex items-center gap-2">
          {status === "uploading" && (
            <span className="source-tag text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" />
              Uploading
            </span>
          )}
          {status === "error" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-red-500 bg-red-500/10">
              Error
            </span>
          )}
          {status === "success" && extLabel && (
            <span className="source-tag text-[10px] font-semibold px-1.5 py-0.5 rounded">
              {extLabel}
            </span>
          )}
          <button
            className="p-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors nodrag nopan"
            onClick={() => dispatch(deleteNode(id))}
          >
            <X
              size={12}
              className="text-secondary hover:text-red-500 transition-colors"
              style={{ color: "var(--text-secondary)" }}
            />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="p-4">
        {/* 上传中 */}
        {status === "uploading" && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <Loader2 size={32} className="animate-spin text-secondary" />
            <p className="text-xs text-secondary truncate max-w-full">{fileName}</p>
            {data.fileSize != null && (
              <p className="text-[11px] text-secondary">{formatFileSize(data.fileSize)}</p>
            )}
          </div>
        )}

        {/* 上传成功 */}
        {status === "success" && (
          <>
            {/* 图片类型：直接展示预览 */}
            {fileType === "image" && data.resourceUrl && !imgError ? (
              <div className="flex flex-col gap-2">
                <div className="rounded-md overflow-hidden border border-main">
                  <img
                    src={data.resourceUrl}
                    alt={fileName}
                    className="w-full max-h-[180px] object-cover"
                    onError={() => setImgError(true)}
                    draggable={false}
                  />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <FileImage size={14} className="source-meta-icon shrink-0" />
                  <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                    {fileName}
                  </p>
                </div>
                {data.fileSize != null && (
                  <p className="text-[11px] text-secondary">{formatFileSize(data.fileSize)}</p>
                )}
              </div>
            ) : (
              /* 非图片（或图片加载失败）：文件图标 + 文件名 */
              <div className="flex items-start gap-3">
                <div className="w-12 h-14 rounded-md flex items-center justify-center shrink-0 bg-accent-light">
                  <FileTypeIcon fileType={fileType} size={24} />
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <p
                    className="font-semibold text-sm truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fileName}
                  </p>
                  {data.fileSize != null && (
                    <p className="text-[11px] text-secondary mt-1">
                      {formatFileSize(data.fileSize)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* 上传失败 */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <AlertCircle size={28} className="text-red-500" />
            <p className="text-xs truncate max-w-full" style={{ color: "var(--text-primary)" }}>
              {fileName}
            </p>
            <p className="text-[11px] text-red-500">Upload failed</p>
          </div>
        )}
      </div>

      {/* ── Handles ── */}
      <Handle
        type="source"
        position={Position.Right}
        className="custom-handle custom-handle-source"
        style={{ top: 20, right: -6 }}
      />
    </div>
  );
}

export default ResourceNode;
