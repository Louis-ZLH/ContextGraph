import { Sparkles, Copy, Check, ThumbsUp, ThumbsDown, RotateCcw, Loader2 } from "lucide-react";
import MarkdownRenderer from "../../../MarkdownRenderer";
import type { ThemeName } from "../../../../feature/user/userSlice";
import type { Message } from "../../../../feature/chat/types";
import BranchNavigator from "./BranchNavigator";
import ErrorBlock from "./ErrorBlock";
import { useCallback, useContext, useEffect, useRef, useState, memo } from "react";
import { streamContext } from "../index";
import { modelsContext } from "../index";
import { useSelector, shallowEqual } from "react-redux";
import { selectParentMessageById } from "../../../../feature/chat/chatSlice";
import type { RootState } from "../../../../store";

const MIN_CHARS = 1;
const DRAIN_FRAMES = 8;
const MIN_INTERVAL = 40; // ms between advances — slower cadence for slow models
const HOLD_MS = 500;     // hold a lone first char, wait for more to accumulate

function useStreamingBuffer(content: string, isStreaming: boolean): string {
  const [displayed, setDisplayed] = useState(content);
  const posRef = useRef(content.length);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);
  const idleRef = useRef(true);
  const holdStartRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      cancelAnimationFrame(rafRef.current);
      posRef.current = content.length;
      idleRef.current = true;
      return;
    }

    const tick = (now: number) => {
      const remaining = content.length - posRef.current;

      if (remaining <= 0) {
        idleRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Transition from idle: start hold timer
      if (idleRef.current) {
        idleRef.current = false;
        holdStartRef.current = now;
      }

      // Hold lone char: wait for more to arrive or timeout
      if (remaining === 1 && now - holdStartRef.current < HOLD_MS) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (now - lastTickRef.current >= MIN_INTERVAL) {
        const step = Math.max(MIN_CHARS, Math.ceil(remaining / DRAIN_FRAMES));
        posRef.current = Math.min(posRef.current + step, content.length);
        setDisplayed(content.slice(0, posRef.current));
        lastTickRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [content, isStreaming]);

  return isStreaming ? displayed : content;
}

/**
 * WaitingStatus: 显示等待阶段的状态文本，支持字符波浪过渡动画。
 * - 无 statusText 时不渲染
 * - 文本变化时，旧文本执行从左到右的字符跳动，完成后切换为新文本
 */
const WaitingStatus = memo(function WaitingStatus({ statusText }: { statusText?: string }) {
  const [visibleText, setVisibleText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [waving, setWaving] = useState(false);
  const targetTextRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const incoming = statusText ?? "";

  // 首次文本：直接显示（渲染阶段同步）
  if (visibleText === "" && incoming !== "") {
    setVisibleText(incoming);
    setTargetText(incoming);
  }

  // 新文本到达：更新目标，若未在波浪中则启动
  if (visibleText !== "" && incoming !== targetText) {
    setTargetText(incoming);
    if (!waving) {
      setWaving(true);
    }
  }

  // 同步 ref 以便 setTimeout 回调读取最新值
  useEffect(() => {
    targetTextRef.current = targetText;
  }, [targetText]);

  // 波浪动画计时器
  useEffect(() => {
    if (!waving) return;

    const charCount = visibleText.length;
    const duration = charCount * 10 + 150;

    timerRef.current = setTimeout(() => {
      setVisibleText(targetTextRef.current);
      setWaving(false);
    }, duration);

    return () => clearTimeout(timerRef.current);
  }, [waving, visibleText]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  if (!visibleText) return null;

  return (
    <span className="text-xs inline-flex flex-wrap" style={{ color: "var(--text-secondary)" }}>
      {visibleText.split("").map((char, i) => (
        <span
          key={`${visibleText}-${i}`}
          className={waving ? "status-char-wave" : ""}
          style={waving ? { animationDelay: `${i * 10}ms` } : undefined}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </span>
  );
});

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

  if (message.status === "aborted" && !message.content) return null;

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
                {/* {isStreaming && (
                  <span
                    className="inline-block w-[2px] h-[14px] ml-0.5 align-middle animate-pulse"
                    style={{ backgroundColor: "var(--text-primary, currentColor)" }}
                  />
                )} */}
              </div>
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
