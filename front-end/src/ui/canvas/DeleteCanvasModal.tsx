import { Modal } from "../common/Modal";
import { useMutation } from "@tanstack/react-query";
import { deleteCanvas as deleteCanvasService } from "../../service/canvas";
import { toast } from "react-hot-toast";
import { queryClient } from "../../query";
import { Loader2, AlertTriangle } from "lucide-react";
import { useSelector } from "react-redux";
import type { ThemeName } from "../../feature/user/userSlice";
import { useNavigate, useParams } from "react-router";

interface DeleteCanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  canvasTitle: string;
}

export function DeleteCanvasModal({ isOpen, onClose, canvasId, canvasTitle }: DeleteCanvasModalProps) {
  const theme = useSelector(
    (state: { user: { theme: ThemeName } }) => state.user.theme
  );
  const navigate = useNavigate();
  const { canvas_id: currentCanvasID } = useParams();

  const { mutate: deleteCanvas, isPending } = useMutation({
    mutationFn: deleteCanvasService,
    onSuccess: (data) => {
      if (data?.success) {
        if (currentCanvasID === canvasId) {
          navigate("/canvas");
        }
        queryClient.invalidateQueries({ queryKey: ["canvas", "list"] });
        onClose();
        toast.success("Canvas deleted successfully");
      } else {
        toast.error(data?.message || "Failed to delete canvas");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete canvas");
    }
  });

  const handleDelete = () => {
    deleteCanvas(canvasId);
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
        onClick={handleDelete}
        disabled={isPending}
        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
          theme === "cyber"
            ? "bg-red-900/50 hover:bg-red-900/70 text-red-200 border border-red-800"
            : "bg-red-600 hover:bg-red-700 text-white"
        }`}
      >
        {isPending ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2 text-red-500">
          <AlertTriangle size={24} />
          <span>Delete Canvas</span>
        </div>
      }
      footer={footer}
    >
      <div className={`text-sm ${theme === "cyber" ? "text-zinc-300" : "text-gray-600"}`}>
        Are you sure you want to delete <span className="font-bold">"{canvasTitle}"</span>? This action cannot be undone.
      </div>
    </Modal>
  );
}
