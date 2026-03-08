import { MessageSquare } from "lucide-react";
import { useAppSelector } from "../../../hooks";

export function ChatParentItem({ nodeId }: { nodeId: string }) {
  const title = useAppSelector((s) => s.chat.conversations[nodeId]?.title);
  return (
    <div className="px-4 py-2.5 flex items-center gap-3 border-b border-main last:border-b-0">
      <MessageSquare size={14} className="text-secondary shrink-0" />
      <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
        {title ?? "New Chat"}
      </span>
    </div>
  );
}
