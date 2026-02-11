import { useState, useCallback, useRef, useEffect } from "react";
import { Handle, Position, useReactFlow, type Viewport } from "@xyflow/react";
import { PlusCircle, ArrowUp, Maximize2, Minimize2, X } from "lucide-react";
import { useSelector, useDispatch } from "react-redux";
import MarkdownRenderer from "../MarkdownRenderer";
import type { ThemeName } from "../../feature/user/userSlice";
import { useChatNodeData } from "../../service/mockNodeData";
import { deleteNode, toggleShowControls } from "../../feature/canvas/canvasSlice";

export interface ChatMessage {
  role: "user" | "ai";
  content: string;
}

// Keep the interface for compatibility if needed, but we won't rely on data prop for content
export interface ChatNodeData {
  [key: string]: unknown;
}

function ChatNode({ id }: { id: string}) {
  const dispatch = useDispatch();
  // Fetch data using the ID (Mocking React Query)
  const nodeData = useChatNodeData(id);
  const { fitView, getViewport, setViewport } = useReactFlow();
  const [inputValue, setInputValue] = useState("");
  const theme = useSelector(
    (state: { user: { theme: ThemeName } }) => state.user.theme,
  );
  const showControls = useSelector((state: { canvas: { showControls: boolean } }) => state.canvas.showControls);
  const [isMaximized, setIsMaximized] = useState(false);
  const viewportState = useRef<{x: number, y: number, zoom: number}|null>(null);
  
  const messages: ChatMessage[] = nodeData.messages ?? [];
  const label = nodeData.label ?? "Chat";
  const inheritedContext = nodeData.inheritedContext ?? false;

  const onInputChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(evt.target.value);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (showControls === false) {
        dispatch(toggleShowControls(true));
      }
    }
  }, [showControls, dispatch])

  const handleSizeChange = useCallback(() => {
    dispatch(toggleShowControls());
    if (!isMaximized) {
      viewportState.current = getViewport();
      setIsMaximized(true);
      // 先调整节点尺寸，再调整 viewport，避免节点放大后 viewport 无法适应
      window.requestAnimationFrame(() => {
        fitView({
          nodes: [{ id }],
          padding: -0.1,
          maxZoom: 2,
          duration: 500,
        });
      });
    } else {
      setIsMaximized(false);
      if (viewportState.current) {
        // 恢复 viewport
        setViewport(viewportState.current as Viewport, { duration: 500 });
      }
      viewportState.current = null;
    }
  }, [isMaximized, dispatch, fitView, getViewport, setViewport, id]);

  return (
    <div className={`node-card rounded-xl flex flex-col text-sm ${isMaximized ? "h-[370px] w-[630px] nodrag nopan" : "h-[450px] w-[350px]"}`}>
      {/* Header */}
      <div className={`h-8 border-b border-main flex items-center justify-between px-3 ${isMaximized ? "cursor-default pt-1.5" : "cursor-move"}`}>
        <div className={`flex items-center gap-2`}>
          <span className="text-xs font-bold text-secondary uppercase tracking-wider">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors nodrag nopan"
            onClick={handleSizeChange}
          >
            {isMaximized ? 
            <Minimize2
            size={12}
            className="text-secondary hover:text-primary cursor-pointer"
            style={{ color: "var(--text-secondary)" }}/>
            : 
            <Maximize2 
            size={12} 
            className="text-secondary hover:text-primary cursor-pointer" 
            style={{ color: "var(--text-secondary)" }} />}
          </button>
          {!isMaximized && (
          <button
            className="p-1 rounded hover:bg-red-500/10 cursor-pointer transition-colors nodrag nopan"
            onClick={() => dispatch(deleteNode(id))}
          >
            <X
              size={12}
              className="text-secondary hover:text-red-500 transition-colors"
              style={{ color: "var(--text-secondary)" }}
            />
          </button>)}
        </div>
      </div>

      {/* Messages */}
      <div
        className={
          "nodrag nopan flex-1 overflow-y-auto p-4 space-y-4 nowheel select-text cursor-default" +
          (theme === "cyber"
            ? " CyberScroller"
            : theme === "saas"
              ? " ModernScroller"
              : "")
        }
      >
        {inheritedContext && (
          <div className="text-[10px] text-center text-secondary mb-2">
            --- Context Inherited ---
          </div>
        )}

        {messages.map((msg, i) =>
          msg.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="bubble-user max-w-[85%] p-2.5 rounded-2xl rounded-tr-sm text-sm cursor-text">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start max-w-[85%] cursor-text">
              <MarkdownRenderer content={msg.content} theme={theme} />
            </div>
          ),
        )}
      </div>

      {/* Input */}
      <div className="nodrag nopan p-3 border-t border-main">
        <div className="flex items-center gap-2 p-2 rounded border border-main node-bg">
          <PlusCircle
            size={16}
            className="text-secondary cursor-pointer shrink-0"
            style={{ color: "var(--text-secondary)" }}
          />
          <input
            type="text"
            placeholder="Reply..."
            value={inputValue}
            onChange={onInputChange}
            className="nodrag flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <ArrowUp
            size={16}
            className="cursor-pointer shrink-0"
            style={{ color: "var(--accent)" }}
          />
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="custom-handle custom-handle-target"
        style={{ top: 30, left: -6 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="custom-handle custom-handle-source"
        style={{ top: 30, right: -6 }}
      />
    </div>
  );
}

export default ChatNode;
