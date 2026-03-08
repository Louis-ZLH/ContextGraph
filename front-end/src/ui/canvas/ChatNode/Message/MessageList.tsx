import {
  useRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  memo,
} from "react";
import type { ThemeName } from "../../../../feature/user/userSlice";
import MessageItem from "./MessageItem";
import { streamContext } from "../index";

interface MessageListProps {
  threadIds: string[];
  theme: ThemeName;
  isMaximized: boolean;
}

function MessageList({
  threadIds,
  theme,
  isMaximized,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRatioRef = useRef(1);
  const lastUserMsg = useRef<HTMLDivElement>(null);
  const lastAssistantMsg = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const prevThreadIdsRef = useRef<string[]>([]);
  const stream = useContext(streamContext);
  const lastSendSignalRef = useRef(0);

  // 同步计算并设置 spacer 高度（直接操作 DOM，无一帧延迟）
  const updateSpacerHeight = useCallback(() => {
    const container = scrollContainerRef.current;
    const lastUser = lastUserMsg.current;
    const lastAssistant = lastAssistantMsg.current;
    const spacer = spacerRef.current;
    if (!container || !lastUser || !lastAssistant || !spacer) return;

    const viewportHeight = container.clientHeight;
    const lastUserHeight = lastUser.offsetHeight;
    const lastAssistantHeight = lastAssistant.offsetHeight;
    const topPadding = 100;
    const calculated = Math.max(0, viewportHeight - lastUserHeight - lastAssistantHeight - topPadding);
    spacer.style.height = `${calculated}px`;
  }, []);

  // 记录滚动比例，用于 isMaximized 切换时恢复位置
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      scrollRatioRef.current = maxScroll > 0 ? el.scrollTop / maxScroll : 1;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // isMaximized 变化时按比例恢复滚动位置
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    updateSpacerHeight();
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll > 0) {
      el.scrollTop = scrollRatioRef.current * maxScroll;
    }
  }, [isMaximized, updateSpacerHeight]);

  // 滚动策略：初始加载瞬间沉底 / 发送消息 smooth / 切换 branch 不滚动
  useLayoutEffect(() => {
    const prev = prevThreadIdsRef.current;
    prevThreadIdsRef.current = threadIds;

    if (threadIds.length === 0) return;

    const el = scrollContainerRef.current;
    if (!el) return;

    const signal = stream?.sendSignalRef.current ?? 0;
    const hasSendSignal = signal > lastSendSignalRef.current;
    lastSendSignalRef.current = signal;

    // 1. 初始加载（组件首次 mount 拿到 threadIds）→ 瞬间沉底
    if (prev.length === 0) {
      updateSpacerHeight();
      el.scrollTop = el.scrollHeight;
      return;
    }

    // 2. 发送/编辑消息（send 被调用过）→ smooth
    if (hasSendSignal) {
      updateSpacerHeight();
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }

    // 3. 切换 branch / temp→real 确认 → 不滚动
  }, [threadIds, updateSpacerHeight, stream]);

  // ResizeObserver 监听 streaming 期间内容高度变化，同步更新 spacer
  const lastThreadId = threadIds[threadIds.length - 1];
  const secondLastThreadId = threadIds[threadIds.length - 2];
  useEffect(() => {
    const container = scrollContainerRef.current;
    const lastAssistant = lastAssistantMsg.current;
    if (!container || !lastAssistant) return;

    let lastContainerHeight = container.clientHeight;
    const resizeObserver = new ResizeObserver(() => {
      const currentHeight = container.clientHeight;
      // streaming 期间 assistant 增长但 container 高度不变 → spacer 为 0 后无需重算
      // container 高度变了（窗口 resize / maximize）→ 必须重算
      if (
        spacerRef.current?.style.height === "0px" &&
        currentHeight === lastContainerHeight
      ) return;
      lastContainerHeight = currentHeight;
      updateSpacerHeight();
    });

    resizeObserver.observe(lastAssistant);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [lastThreadId, secondLastThreadId, updateSpacerHeight]); // id 变化时（新消息、temp→real 确认）重新绑定
  
  return (
    <div
      ref={scrollContainerRef}
      className={
        "flex-1 overflow-y-auto nowheel select-text cursor-default pb-16" +
        (isMaximized ? "" : " px-2") +
        (theme === "cyber"
          ? " CyberScroller"
          : theme === "saas"
            ? " ModernScroller"
            : "")
      }
      style={
        isMaximized
          ? {
              paddingLeft: "max(0.5rem, calc((100% - 700px) / 2))",
              paddingRight: "max(0.5rem, calc((100% - 700px) / 2))",
            }
          : undefined
      }
    >
      <div className="flex flex-col gap-1 py-3">
        {threadIds.map((threadId, index) => {
          const isLastAssistantMsg = index === threadIds.length - 1;
          const isLastUserMsg = index === threadIds.length - 2;

          let ref = null;
          if(isLastAssistantMsg) {
            ref = lastAssistantMsg;
          } else if(isLastUserMsg) {
            ref = lastUserMsg;
          }

          return (
          <MessageItem key={threadId} threadId={threadId} theme={theme} ref={ref} />
        )})}
        <div
          ref={spacerRef}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export default memo(MessageList);
