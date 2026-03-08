import { Copy, Check, Pencil } from "lucide-react";
import type { Message } from "../../../../feature/chat/types";
import BranchNavigator from "./BranchNavigator";
import ErrorBlock from "./ErrorBlock";
import { streamContext } from "../index";
import React, { useContext, useState, useRef, useEffect, useCallback, memo } from "react";
import { modelsContext } from "../index";

interface UserMessageProps {
  message: Message;
  hasBranches?: boolean;
  current?: number;
  total?: number;
  ref?: React.Ref<HTMLDivElement>;
}

function UserMessage({ message, hasBranches, current, total, ref }: UserMessageProps) {
  const { send } = useContext(streamContext)!;
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [copied, setCopied] = useState(false);
  const { modelIndex } = useContext(modelsContext)!;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = useCallback(() => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [message.content]);

  const startEdit = useCallback(() => {
    setEditContent(message.content ?? "");
    setIsEditing(true);
  }, [message.content]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const submitEdit = useCallback(() => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    send(trimmed, modelIndex, message.parentId as string);
    setIsEditing(false);
  }, [editContent, message.content, message.parentId, send, modelIndex]);

  // auto-resize textarea & focus
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
      // move cursor to end
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [isEditing]);

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setEditContent(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        cancelEdit();
      }
    },
    [cancelEdit],
  );

  return (
    <>
      <div ref={ref} className="group/user flex flex-col items-end px-4 py-3">
        {isEditing ? (
          <div className="w-[85%] flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              className="w-full px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed resize-none outline-none ring-1"
              style={{
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--accent)",
              } as React.CSSProperties}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={cancelEdit}
                className="px-3 py-1 rounded-lg text-[12px] cursor-pointer transition-opacity hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                Cancel
              </button>
              <button
                onClick={submitEdit}
                disabled={!editContent.trim() || editContent.trim() === message.content}
                className="px-3 py-1 rounded-lg text-[12px] cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "var(--bubble-user)",
                  color: "var(--bubble-user-text)",
                }}
              >
                Update
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed"
              style={{
                backgroundColor: "var(--bubble-user)",
                color: "var(--bubble-user-text)",
              }}
            >
              {message.content}
            </div>
            <div className="flex items-center gap-1 mt-1 h-5 opacity-0 group-hover/user:opacity-100 transition-opacity">
              <button title="Copy" onClick={handleCopy} className="p-1 rounded hover:opacity-70 cursor-pointer transition-opacity">
                {copied ? <Check size={12} style={{ color: "var(--accent)" }} /> : <Copy size={12} style={{ color: "var(--text-secondary)" }} />}
              </button>
              <button title="Edit" onClick={startEdit} className="p-1 rounded hover:opacity-70 cursor-pointer transition-opacity">
                <Pencil size={12} style={{ color: "var(--text-secondary)" }} />
              </button>
              {hasBranches && <BranchNavigator messageId={message.id} current={current!} total={total!} />}
            </div>
          </>
        )}
      </div>
      {message.error && <ErrorBlock error={message.error} />}
    </>
  );
}

export default memo(UserMessage);
