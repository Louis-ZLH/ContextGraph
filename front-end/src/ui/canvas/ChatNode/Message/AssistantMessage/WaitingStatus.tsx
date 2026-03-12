import { useEffect, useRef, useState, memo } from "react";

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

export default WaitingStatus;
