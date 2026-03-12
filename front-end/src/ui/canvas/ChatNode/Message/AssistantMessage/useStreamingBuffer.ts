import { useEffect, useRef, useState } from "react";

const MIN_CHARS = 1;
const DRAIN_FRAMES = 8;
const MIN_INTERVAL = 40; // ms between advances — slower cadence for slow models
const HOLD_MS = 500;     // hold a lone first char, wait for more to accumulate

export function useStreamingBuffer(content: string, isStreaming: boolean): string {
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
