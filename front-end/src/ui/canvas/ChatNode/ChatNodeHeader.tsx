import { memo } from "react";
import { Sparkles, Maximize2, Minimize2, X } from "lucide-react";

interface ChatNodeHeaderProps {
  label: string;
  isMaximized: boolean;
  onSizeChange: () => void;
  onDelete: () => void;
}

function ChatNodeHeader({
  label,
  isMaximized,
  onSizeChange,
  onDelete,
}: ChatNodeHeaderProps) {
  return (
    <div
      className={`h-9 border-main flex items-center justify-between px-3 ${isMaximized ? "cursor-default pt-1.5 absolute top-0 left-0 right-0" : "cursor-move border-b "}`}
    >
      <div
        className="flex items-center gap-2"
        style={{ opacity: isMaximized ? 0 : 1 }}
      >
        <div
          className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "var(--accent-light)" }}
        >
          <Sparkles size={11} style={{ color: "var(--accent)" }} />
        </div>
        <span
          className="text-xs font-semibold tracking-wide"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          className="z-10 p-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors nodrag nopan"
          onClick={onSizeChange}
        >
          {isMaximized ? (
            <Minimize2
              size={13}
              className="cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            />
          ) : (
            <Maximize2
              size={13}
              className="cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            />
          )}
        </button>
        {!isMaximized && (
          <button
            className="p-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors nodrag nopan"
            onClick={onDelete}
          >
            <X
              size={13}
              className="hover:text-red-500 transition-colors"
              style={{ color: "var(--text-secondary)" }}
            />
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(ChatNodeHeader);
