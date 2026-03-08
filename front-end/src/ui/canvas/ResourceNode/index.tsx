import { useState, memo } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  FileImage,
  Loader2,
  AlertCircle,
  X,
  Download,
} from "lucide-react";
import { useDispatch } from "react-redux";
import type { NodeData, FileCategory } from "../../../feature/canvas/canvasSlice";
import { deleteNode } from "../../../feature/canvas/canvasSlice";
import { formatFileSize, getFileCategoryFromMime, getFileInfo } from "../../../service/file";
import { useQuery } from "@tanstack/react-query";
import { BASE_URL } from "../../../util/api";
import { FileTypeIcon } from "./FileTypeIcon";
import { getFileExtLabel } from "./utils";

function ResourceNode({ id, data, selected }: { id: string; data: NodeData; selected?: boolean }) {
  const dispatch = useDispatch();
  const fileId: string | undefined = data?.fileId ?? undefined;
  const status = fileId === "__error__" ? "error"
    : String(fileId) === "-1" ? "deleted"
    : fileId ? "success"
    : "uploading";

  const { data: fileInfo, isLoading: isFileInfoLoading } = useQuery({
    queryKey: ["fileInfo", fileId],
    queryFn: async () => {
      if (!fileId) {
        return null;
      }
      const { success, message, data } = await getFileInfo(fileId);
      if (!success || !data) {
        throw new Error(message);
      }
      return data;
    },
  });

  // loading = 文件已上传完毕，正在拉取文件元信息
  const isLoading = status === "success" && isFileInfoLoading;

  const fileType: FileCategory | undefined = fileInfo
    ? getFileCategoryFromMime(fileInfo.contentType, fileInfo.filename)
    : undefined;
  const isImage = fileInfo?.contentType?.startsWith("image/") ?? false;
  const fileName = fileInfo?.filename;
  const fileSize = fileInfo?.fileSize;
  const resourceUrl = fileId ? `${BASE_URL}/api/file/${fileId}` : undefined;
  const downloadUrl = fileId ? `${BASE_URL}/api/file/${fileId}?download=true` : undefined;

  const extLabel = getFileExtLabel(fileName);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div className={`source-node rounded-xl flex flex-col w-[230px] text-xs ${selected ? "node-selected" : ""}`}>
      {/* ── Header ── */}
      <div className="source-header h-8 border-b border-main flex items-center justify-between px-2.5 cursor-move rounded-t-xl">
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
          {isLoading && (
            <span className="source-loading-tag text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="source-loading-dots">
                <span /><span /><span />
              </span>
              Loading
            </span>
          )}
          {status === "error" && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded text-red-500 bg-red-500/10">
              Error
            </span>
          )}
          {status === "success" && !isLoading && extLabel && (
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
      <div className="p-3">
        {/* 上传中 */}
        {status === "uploading" && (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <Loader2 size={26} className="animate-spin text-secondary" />
            <p className="text-xs text-secondary truncate max-w-full">{fileName}</p>
            {fileSize != null && (
              <p className="text-[11px] text-secondary">{formatFileSize(fileSize)}</p>
            )}
          </div>
        )}

        {/* 加载文件信息中 — 骨架屏 */}
        {isLoading && (
          <div className="flex items-start gap-3 source-skeleton-wrapper">
            <div className="w-12 h-14 rounded-md shrink-0 source-skeleton" />
            <div className="flex-1 min-w-0 py-1 flex flex-col gap-2">
              <div className="h-4 w-3/4 rounded source-skeleton" />
              <div className="h-3 w-1/2 rounded source-skeleton" />
              <div className="h-6 w-20 rounded source-skeleton mt-1" />
            </div>
          </div>
        )}

        {/* 上传成功 */}
        {status === "success" && !isLoading && (
          <>
            {/* 图片类型：直接展示预览 */}
            {isImage && resourceUrl && !imgError ? (
              <div className="flex flex-col gap-2">
                <div className="rounded-md overflow-hidden border border-main relative">
                  {/* 图片加载中的骨架占位 */}
                  {!imgLoaded && (
                    <div className="w-full h-[140px] source-skeleton" />
                  )}
                  <img
                    src={resourceUrl}
                    alt={fileName}
                    className={`w-full max-h-[140px] object-cover transition-opacity duration-300 ${
                      imgLoaded ? "opacity-100" : "opacity-0 absolute inset-0"
                    }`}
                    onLoad={() => setImgLoaded(true)}
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
                {fileSize != null && (
                  <p className="text-[11px] text-secondary">{formatFileSize(fileSize)}</p>
                )}
              </div>
            ) : (
              /* 非图片（或图片加载失败）：文件图标 + 文件名 + 下载按钮 */
              <div className="flex items-start gap-3">
                <div className="w-10 h-12 rounded-md flex items-center justify-center shrink-0 bg-accent-light">
                  <FileTypeIcon fileType={fileType} size={20} />
                </div>
                <div className="flex-1 min-w-0 py-1">
                  <p
                    className="font-semibold text-sm truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fileName}
                  </p>
                  {fileSize != null && (
                    <p className="text-[11px] text-secondary mt-1">
                      {formatFileSize(fileSize)}
                    </p>
                  )}
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded text-[11px] font-medium
                        bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer nodrag nopan"
                      style={{ color: "var(--accent)" }}
                    >
                      <Download size={12} />
                      Download
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* 文件已删除 */}
        {status === "deleted" && (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <AlertCircle size={22} className="text-secondary" />
            <p className="text-xs text-secondary">File has been deleted</p>
          </div>
        )}

        {/* 上传失败 */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center py-4 gap-2">
            <AlertCircle size={22} className="text-red-500" />
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
        style={{ top: 20, right: -8 }}
      />
    </div>
  );
}

export default memo(ResourceNode, (prev, next) =>
  prev.id === next.id &&
  prev.selected === next.selected &&
  prev.data?.fileId === next.data?.fileId
);
