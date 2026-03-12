import { Sparkles, Copy, Check, ThumbsUp, ThumbsDown, RotateCcw, Loader2 } from "lucide-react";
import MarkdownRenderer from "../../../../MarkdownRenderer";
import type { ThemeName } from "../../../../../feature/user/userSlice";
import type { Message, GeneratedFile, ImagePreviewState } from "../../../../../feature/chat/types";
import BranchNavigator from "../BranchNavigator";
import ErrorBlock from "../ErrorBlock";
import { useCallback, useContext, useState, memo } from "react";
import { streamContext, modelsContext } from "../../index";
import { useSelector, shallowEqual } from "react-redux";
import { selectParentMessageById } from "../../../../../feature/chat/chatSlice";
import type { RootState } from "../../../../../store";
import { BASE_URL } from "../../../../../util/api";
import { useStreamingBuffer } from "./useStreamingBuffer";
import WaitingStatus from "./WaitingStatus";
import FileCard from "./FileCard";

interface AssistantMessageProps {
  message: Message;
  theme: ThemeName;
  hasBranches?: boolean;
  current?: number;
  total?: number;
  ref?: React.Ref<HTMLDivElement>;
}

function AssistantMessage({ message, theme, hasBranches, current, total, ref }: AssistantMessageProps) {
  const { send } = useContext(streamContext)!;
  const { modelIndex } = useContext(modelsContext)!;
  const parentMessage = useSelector((state: RootState) => selectParentMessageById(state, message.id), shallowEqual);
  const currentLeafId = useSelector((state: RootState) => state.chat.conversations[message.conversationId]?.currentLeafId);
  const imagePreview = useSelector((state: RootState) => state.chat.imagePreviews[message.id] as ImagePreviewState | undefined);
  const generatedFiles = message.metadata?.generatedFiles as GeneratedFile[] | undefined;
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null);
  const [hovered, setHovered] = useState(false);
  const isWaiting = message.status === "waiting";
  const isStreaming = message.status === "streaming";
  const displayedContent = useStreamingBuffer(message.content ?? "", isStreaming);
  const showActions = (message.status === "completed" || message.status === "aborted" || message.status === "error") && (message.id === currentLeafId || hovered);

  const handleCopy = useCallback(() => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message.content]);

  const handleFeedback = useCallback((type: "good" | "bad") => {
    setFeedback(prev => prev === type ? null : type);
  }, []);

  const handleRetry = useCallback(() => {
    if (!parentMessage) return;
    send(null, modelIndex, parentMessage.id as string, true, parentMessage.id);
  }, [parentMessage, send, modelIndex]);

  const isEmptyError = message.status === "error" && !message.content;

  return (
    <div ref={ref} className={`px-4 py-2 ${message.id === currentLeafId ? "pb-16" : "pb-8"} relative`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="flex gap-2.5 items-start">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5${isWaiting || isStreaming ? " sparkles-active" : ""}`}
          style={{ backgroundColor: "var(--accent-light)" }}
        >
          <Sparkles size={12} style={{ color: "var(--accent)" }} />
        </div>
        {!isEmptyError && (
          <div className="flex-1 min-w-0">
            {!isWaiting && (
              <div className={`cursor-text${isStreaming ? " streaming-content" : ""}`}>
                <MarkdownRenderer content={displayedContent} theme={theme} id={message.id} />
              </div>
            )}
            {/* Three-state file card rendering */}
            {/* State 1: Streaming base64 preview (image_partial phase) */}
            {imagePreview && (
              <FileCard src={`data:image/jpeg;base64,${imagePreview.b64Image}`} isPreview />
            )}
            {/* State 2: Stream complete — render from metadata.generatedFiles */}
            {!imagePreview && generatedFiles && generatedFiles.length > 0 && generatedFiles.map((f) => (
              <FileCard key={f.fileId} src={`${BASE_URL}/api/file/${f.fileId}`} filename={f.filename} />
            ))}
            {/* State 3: History load — render from message.fileUrl + fileName */}
            {!imagePreview && !generatedFiles?.length && message.fileUrl && (
              <FileCard src={message.fileUrl} filename={message.fileName} />
            )}
            {(isWaiting || (isStreaming && message.statusText)) && (
              <div className="flex items-center gap-2 py-1">
                <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-secondary)" }} />
                <WaitingStatus statusText={message.statusText} />
              </div>
            )}
          </div>
        )}
      </div>
      {message.status === "error" && message.error && <ErrorBlock error={message.error} />}
      {showActions && (
        <div className={`absolute ${message.id === currentLeafId ? "bottom-9" : "bottom-1"} left-12 flex items-center gap-1`}>
          {hasBranches && <BranchNavigator messageId={message.id} current={current!} total={total!} />}
          {hasBranches && (
            <div className="w-px h-3 mx-0.5" style={{ backgroundColor: "var(--text-secondary)", opacity: 0.3 }} />
          )}
          <button title="Copy" onClick={handleCopy} className="p-1 rounded hover:opacity-70 cursor-pointer transition-opacity">
            {copied ? <Check size={12} style={{ color: "var(--accent)" }} /> : <Copy size={12} style={{ color: "var(--text-secondary)" }} />}
          </button>
          <button title="Good" onClick={() => handleFeedback("good")} className="p-1 rounded hover:opacity-70 cursor-pointer transition-opacity">
            <ThumbsUp size={12} style={{ color: feedback === "good" ? "var(--accent)" : "var(--text-secondary)" }} />
          </button>
          <button title="Bad" onClick={() => handleFeedback("bad")} className="p-1 rounded hover:opacity-70 cursor-pointer transition-opacity">
            <ThumbsDown size={12} style={{ color: feedback === "bad" ? "#ef4444" : "var(--text-secondary)" }} />
          </button>
          <button title="Retry" onClick={handleRetry} className="p-1 rounded hover:opacity-70 cursor-pointer transition-opacity">
            <RotateCcw size={12} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(AssistantMessage);
