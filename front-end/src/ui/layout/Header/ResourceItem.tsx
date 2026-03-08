import { Download, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getFileInfo, getFileCategoryFromMime } from "../../../service/file";
import { FileTypeIcon } from "../../canvas/ResourceNode/FileTypeIcon";
import { BASE_URL } from "../../../util/api";

export function ResourceItem({ fileId }: { fileId?: string }) {
  const { data: fileInfo } = useQuery({
    queryKey: ["fileInfo", fileId],
    queryFn: async () => {
      if (!fileId || fileId === "__error__") return null;
      const { success, data } = await getFileInfo(fileId);
      if (!success || !data) return null;
      return data;
    },
    enabled: !!fileId && fileId !== "__error__",
  });

  const resourceUrl = fileId ? `${BASE_URL}/api/file/${fileId}` : undefined;
  const downloadUrl = fileId ? `${BASE_URL}/api/file/${fileId}?download=true` : undefined;
  const fileName = fileInfo?.filename ?? "Loading...";
  const fileCategory = fileInfo
    ? getFileCategoryFromMime(fileInfo.contentType, fileInfo.filename)
    : undefined;

  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-2 border-b border-main last:border-b-0">
      <div className="flex items-center gap-3 min-w-0">
        <FileTypeIcon fileType={fileCategory} size={20} />
        <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
          {fileName}
        </span>
      </div>
      {fileId && fileId !== "__error__" && (
        <div className="flex items-center gap-1 shrink-0">
          {resourceUrl && (
            <a
              href={resourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-accent-light transition-colors"
              style={{ color: "var(--accent)" }}
              title="Preview"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              className="p-1.5 rounded-md hover:bg-accent-light transition-colors"
              style={{ color: "var(--accent)" }}
              title="Download"
            >
              <Download size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
