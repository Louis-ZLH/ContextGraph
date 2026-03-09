import { useQuery } from "@tanstack/react-query";
import { storageUsageQueryOptions } from "../../query/file";
import { formatFileSize } from "../../service/file";

export function StorageBar() {
  const { data: storageResult } = useQuery(storageUsageQueryOptions);
  const storageUsage = storageResult?.data;

  if (!storageUsage) return null;

  const { used, limit } = storageUsage;
  const percent = Math.min((used / limit) * 100, 100);
  const barColor =
    percent >= 95 ? "#ef4444" : percent >= 80 ? "#f59e0b" : "var(--accent)";

  return (
    <div className="hidden md:flex items-center gap-2">
      <div className="w-28 h-4 rounded-sm overflow-hidden" style={{ backgroundColor: "var(--border-main)" }}>
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-xs text-secondary whitespace-nowrap">
        {formatFileSize(used)} / {formatFileSize(limit)}
      </span>
    </div>
  );
}
