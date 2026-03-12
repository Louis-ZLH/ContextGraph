export interface ChatState {
    conversations: Record<string, Conversation>; // node_id -> Conversation
    messages: Record<string, Message>; // message_id -> Message
    imagePreviews: Record<string, ImagePreviewState>; // messageId -> 临时 base64 预览状态，支持多图并发生成
}

export interface Conversation {
    id: string; // node_id
    title: string | null;
    updatedAt: number;
    rootMessageId: string | null; // 入口指针, 和conversation一一对应
    currentLeafId: string | null; // 当前视图指针
    hasFetchedMessages?: boolean; // 是否已经获取过消息, undefined和false表示未获取过, true表示已获取过
}

export interface Message {
    id: string; // 前端生成
    conversationId: string; // 外键：标记它属于哪个会话
    parentId?: string; // root的parentId为undefined
    childrenIds: string[];
    content?: string; // root的content为undefined
    role: 'user' | 'assistant' | 'root'; // system不给前端展示
    status: "sending" | "waiting" | "streaming" | "completed" | "error" | "aborted";
    model: number;
    createdAt: number;
    metadata: Record<string, unknown>;
    error?: string;
    statusText?: string;
    fileUrl?: string;  // Persisted URL for AI-generated files (all types), used for history rendering
    fileName?: string;  // Persisted filename for file type detection in history rendering
  }
  // root message不会展示，只是方便管理

export interface GeneratedFile {
    fileId: string;
    filename: string;
    contentType: string;
}

export interface ImagePreviewState {
    messageId: string;
    b64Image: string; // 当前最新的 partial base64
}