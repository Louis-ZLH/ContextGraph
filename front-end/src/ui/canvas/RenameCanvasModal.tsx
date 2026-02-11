import { useState, useEffect, useRef } from "react";
import { Modal } from "../common/Modal";
import { useMutation } from "@tanstack/react-query";
import { renameCanvas as renameCanvasService } from "../../service/canvas";
import { toast } from "react-hot-toast";
import { queryClient } from "../../query";
import { Loader2 } from "lucide-react";
import { useSelector } from "react-redux";
import type { ThemeName } from "../../feature/user/userSlice";

interface RenameCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  currentTitle: string;
}

export function RenameCanvasModal({ isOpen, onClose, canvasId, currentTitle }: RenameCanvasModalProps) {
  const [title, setTitle] = useState(currentTitle);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  const theme = useSelector(
    (state: { user: { theme: ThemeName } }) => state.user.theme
  );

  // Reset title when modal opens (adjust state during render based on prop change)
  if (isOpen && !prevIsOpen) {
    setTitle(currentTitle);
  }
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
  }

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
      }, 50);
    }
  }, [isOpen]);

  const { mutate: renameCanvas, isPending } = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameCanvasService(id, title),
    onSuccess: (data) => {
      if (data?.success) {
        queryClient.invalidateQueries({ queryKey: ["canvas", "list"] });
        onClose();
        toast.success("Canvas renamed successfully");
      } else {
        toast.error(data?.message || "Failed to rename canvas");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to rename canvas");
    }
  });

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) {
        toast.error("Title cannot be empty");
        return;
    }
    if (title === currentTitle) {
        onClose();
        return;
    }
    renameCanvas({ id: canvasId, title: title.trim() });
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        disabled={isPending}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          theme === "cyber" 
            ? "hover:bg-white/10 text-zinc-400 hover:text-white"
            : "hover:bg-black/5 text-gray-500 hover:text-gray-900"
        }`}
      >
        Cancel
      </button>
      <button
        onClick={() => handleSubmit()}
        disabled={isPending}
        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
          theme === "cyber"
            ? "bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-emerald-600/50"
            : theme === "paper"
                ? "bg-orange-600 hover:bg-orange-500 text-white disabled:bg-orange-600/50"
                : "bg-blue-600 hover:bg-blue-500 text-white disabled:bg-blue-600/50"
        }`}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : "Confirm"}
      </button>
    </>
  );

  const inputClass = theme === "cyber"
    ? "bg-zinc-800 border-zinc-700 text-zinc-100 focus:ring-emerald-500/50"
    : theme === "paper"
        ? "bg-white border-stone-300 text-stone-800 focus:ring-orange-500/50"
        : "bg-white border-gray-300 text-gray-900 focus:ring-blue-500/50";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Rename Canvas"
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-1 ${
             theme === "cyber" ? "text-zinc-400" : "text-gray-500"
          }`}>
            Canvas Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPending}
            className={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 transition-all ${inputClass}`}
            placeholder="Enter canvas name"
          />
        </div>
      </form>
    </Modal>
  );
}
