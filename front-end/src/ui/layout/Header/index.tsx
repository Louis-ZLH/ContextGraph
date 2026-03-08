import { useAppSelector } from "../../../hooks";
import { Breadcrumb } from "./Breadcrumb";
import { ParentNodesPanel } from "./ParentNodesPanel";

export function Header() {
  const maximizedNodeId = useAppSelector((s) => s.canvas.maximizedNodeId);
  const chatTitle = useAppSelector((s) => maximizedNodeId ? s.chat.conversations[maximizedNodeId]?.title : null);

  return (
    <header className="h-14 border-b border-main bg-header flex items-center justify-between px-4 z-10 relative">
      <Breadcrumb />

      {chatTitle && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-medium truncate max-w-[40%] text-center"
          style={{ color: "var(--text-primary)" }}
        >
          {chatTitle}
        </div>
      )}

      <div className="flex items-center gap-3">
        <ParentNodesPanel />
      </div>
    </header>
  );
}
