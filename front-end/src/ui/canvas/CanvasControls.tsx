import { type DragEvent, useCallback } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
} from "@xyflow/react";
import { MessageSquarePlus } from "lucide-react";
import type { ThemeName } from "../../feature/user/userSlice";

interface CanvasControlsProps {
  onLayout: (direction: "TB" | "LR") => void;
  onAddNode: (type: "chatNode") => void;
  theme: ThemeName;
}

export function CanvasControls({ onLayout, onAddNode, theme }: CanvasControlsProps) {
  const onDragStart = useCallback(
    (event: DragEvent, nodeType: "chatNode") => {
      event.dataTransfer.setData("application/reactflow", nodeType);
      event.dataTransfer.effectAllowed = "move";
    },
    [],
  );

  const btnClass = `nopan cursor-pointer px-3 py-1.5 rounded-md text-xs font-medium node-card transition-[filter] ${
    theme === "cyber" ? "hover:brightness-150" : "hover:brightness-95"
  }`;

  return (
    <>
      {/* Custom arrow marker that uses theme colors */}
      <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
        <defs>
          <marker
            id="custom-arrow"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              style={{ fill: "var(--edge-stroke)" }}
            />
          </marker>
        </defs>
      </svg>

      <Panel position="top-left">
        <div className="flex gap-2">
          {/* 布局按钮 */}
          <button onClick={() => onLayout("TB")} className={btnClass}>
            Vertical
          </button>
          <button onClick={() => onLayout("LR")} className={btnClass}>
            Horizontal
          </button>

          <div className="w-px bg-main mx-1" />

          {/* 添加 Chat 节点：可拖拽 + 可点击 */}
          <button
            className={btnClass + " flex items-center gap-1.5 cursor-grab active:cursor-grabbing"}
            draggable
            onDragStart={(e) => onDragStart(e, "chatNode")}
            onClick={() => onAddNode("chatNode")}
            title="拖拽到画布放置，或点击在中心创建"
          >
            <MessageSquarePlus size={14} />
            Chat
          </button>
        </div>
      </Panel>
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="var(--text-secondary)"
        style={{ opacity: 0.3 }}
      />
      <Controls />
      <MiniMap
        position="top-right"
        // Dynamic mask color based on theme
        maskColor={
          theme === "cyber"
            ? "rgba(11, 17, 32, 0.7)" // Dark mask for cyber
            : "rgba(243, 244, 246, 0.7)" // Light mask for saas/paper
        }
        // Dynamic node color based on theme
        nodeColor={
          theme === "cyber"
            ? "#334155" // Slate-700 for cyber nodes
            : "#e5e7eb" // Gray-200 for saas/paper nodes
        }
      />
    </>
  );
}
