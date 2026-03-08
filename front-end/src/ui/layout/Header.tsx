import { Sun, Terminal, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router";
import type { Conversation } from "../../feature/chat/types";
export type ThemeName = "saas" | "cyber" | "paper";

interface HeaderProps {
  theme: ThemeName;
  onSetTheme: (theme: ThemeName) => void;
}

export function Header({ theme, onSetTheme }: HeaderProps) {
  const canvasTitle = useSelector((state: {canvas: {title: string}}) => state.canvas.title);
  const location = useLocation();
  const pathname = location.pathname;
  const title = useMemo(() => {
    switch(pathname) {
      case "/canvas":
        return "Create Canvas";
      case "/canvas/search":
        return "Search Canvases";
      case "/canvas/myresource":
        return "My Resources";
      default:
        return canvasTitle;
    }
  }, [pathname, canvasTitle]);
  const maximizedNodeId = useSelector((state: {canvas: {maximizedNodeId: string | null}}) => state.canvas.maximizedNodeId);
  const chatTitle = useSelector((state: {chat: {conversations: Record<string, Conversation>}}) => maximizedNodeId ? state.chat.conversations[maximizedNodeId]?.title : null);

  return (
    <header className="h-14 border-b border-main bg-header flex items-center justify-between px-4 z-10 relative">
      <div className="flex flex-col">
        <div className="flex items-center gap-2 text-secondary text-xs">
          <span>Workspace</span>
          <span className="text-[10px]">&gt;</span>
        </div>
        <h1
          className="font-semibold leading-tight text-sm"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h1>
      </div>

      {chatTitle && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-medium truncate max-w-[40%] text-center"
          style={{ color: "var(--text-primary)" }}
        >
          {chatTitle}
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Theme switcher */}
        <div className="flex rounded-md p-0.5 border border-main node-bg">
          <button
            onClick={() => onSetTheme("saas")}
            title="SaaS Theme"
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{
              backgroundColor:
                theme === "saas" ? "var(--accent-light)" : "transparent",
              color:
                theme === "saas" ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <Sun size={14} />
          </button>
          <button
            onClick={() => onSetTheme("cyber")}
            title="Cyber Theme"
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{
              backgroundColor:
                theme === "cyber" ? "var(--accent-light)" : "transparent",
              color:
                theme === "cyber" ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <Terminal size={14} />
          </button>
          <button
            onClick={() => onSetTheme("paper")}
            title="Paper Theme"
            className="w-7 h-7 flex items-center justify-center rounded"
            style={{
              backgroundColor:
                theme === "paper" ? "var(--accent-light)" : "transparent",
              color:
                theme === "paper" ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            <ScrollText size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
