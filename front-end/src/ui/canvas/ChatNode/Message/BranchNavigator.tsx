import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppDispatch } from "../../../../hooks";
import { switchBranchAndNotify } from "../../../../feature/chat/chatThunks";
import { useCallback } from "react";
function BranchNavigator({ messageId, current, total }: { messageId: string; current: number; total: number }) {

  const dispatch = useAppDispatch();
  const handlePrevious = useCallback(() => {
    if (current <= 1) return;
    dispatch(switchBranchAndNotify({ msgId: messageId, index: current - 2 }));
  }, [dispatch, messageId, current]);

  const handleNext = useCallback(() => {
    if (current >= total) return;
    dispatch(switchBranchAndNotify({ msgId: messageId, index: current }));
  }, [dispatch, messageId, current, total]);
  return (
    <div className="flex items-center gap-0.5" style={{ color: "var(--text-secondary)" }}>
      <button 
      disabled={current <= 1}
      onClick={handlePrevious}
      className="p-0.5 rounded hover:opacity-70 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
        <ChevronLeft size={12} />
      </button>
      <span className="text-[11px] tabular-nums select-none">
        {current}/{total}
      </span>
      <button 
      disabled={current >= total}
      onClick={handleNext}
      className="p-0.5 rounded hover:opacity-70 cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
        <ChevronRight size={12} />
      </button>
    </div>
  );
}

export default BranchNavigator;
