import type { ChatMessage } from "../ui/canvas/ChatNode";
import type { ResourceNodeData } from "../ui/canvas/ResourceNode";

// Mock Data Store
const MOCK_CHAT_DATA: Record<string, { label: string; icon: "start" | "branch"; messages: ChatMessage[]; inheritedContext?: boolean }> = {
  chatNode1: {
    label: "Start: React Basics",
    icon: "start",
    messages: [
      { role: "user", content: "React Flow 的核心概念是什么？" },
      {
        role: "ai",
        content:
          "核心概念主要是 **Nodes**（节点）、**Edges**（连线）和 **Handles**（句柄）。它是基于状态驱动的。",
      },
    ],
  },
  chatNode2: {
    label: "Branch: Custom Node",
    icon: "branch",
    inheritedContext: true,
    messages: [
      { role: "user", content: "那怎么自定义一个带有输入框的 Node?" },
      {
        role: "ai",
        content: [
          "你需要注册 `nodeTypes`，然后创建自定义组件：",
          "",
          "```tsx",
          "function TextNode({ data }) {",
          "  return (",
          '    <div className="custom-node">',
          "      <input",
          '        className="nodrag"',
          "        value={data.label}",
          "      />",
          "    </div>",
          "  );",
          "}",
          "```",
          "",
          "记得给 `input` 添加 `nodrag` 类名，否则拖拽会冲突。",
        ].join("\n"),
      },
    ],
  },
};

const MOCK_RESOURCE_DATA: Record<string, ResourceNodeData> = {
  sourceNode1: {
    title: "React Flow Documentation",
    fileName: "react-flow-docs-v11.pdf",
    fileType: "PDF",
    fileSize: "2.4 MB",
    pageCount: "48 pages",
    excerpt:
      '"A node in React Flow is a React component. It can be as simple as a div or as complex as an interactive chart..."',
    excerptSource: "— Page 12, Section 3.1",
    tags: ["#react-flow", "#nodes", "#custom"],
    addedTime: "Added 2 days ago",
    referenceCount: 2,
  },
};

// Mock Hooks (simulating React Query)
export function useChatNodeData(id: string) {
  // In a real app, this would be useQuery(...)
  return MOCK_CHAT_DATA[id] || {
    label: "New Chat",
    icon: "start",
    messages: [],
  };
}

export function useResourceNodeData(id: string) {
  // In a real app, this would be useQuery(...)
  return MOCK_RESOURCE_DATA[id] || {
    title: "Unknown Source",
    fileName: "unknown.pdf",
    fileType: "PDF",
    fileSize: "0 MB",
    pageCount: "0 pages",
    excerpt: "No content available",
    excerptSource: "",
    tags: [],
    addedTime: "",
    referenceCount: 0,
  };
}
