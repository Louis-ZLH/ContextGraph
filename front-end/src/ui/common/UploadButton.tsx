import { useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { uploadFile, isFileAccepted, isOldOfficeFormat, isFileTooLarge } from "../../service/file";

const ACCEPTED_EXTENSIONS =
  ".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.docx,.xlsx,.pptx,.csv,.json";

export function UploadButton() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: doUpload, isPending: isUploading } = useMutation({
    mutationFn: (file: File) => uploadFile(file),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("File uploaded");
        queryClient.invalidateQueries({ queryKey: ["file", "list"] });
        queryClient.invalidateQueries({ queryKey: ["file", "storage"] });
      } else {
        toast.error(data.message);
      }
    },
    onError: () => {
      toast.error("Failed to upload file");
    },
  });

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (isOldOfficeFormat(file)) {
        toast.error(
          "Old Office formats (.doc/.xls/.ppt) are not supported. Please convert to .docx/.xlsx/.pptx."
        );
      } else if (!isFileAccepted(file)) {
        toast.error("Unsupported file type");
      } else if (isFileTooLarge(file)) {
        toast.error("File size exceeds 5MB limit");
      } else {
        doUpload(file);
      }
      e.target.value = "";
    },
    [doUpload]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept={ACCEPTED_EXTENSIONS}
      />
      <button
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-(--border-main) bg-(--node-bg) text-sm text-(--text-primary) hover:border-(--accent) hover:text-(--accent) active:scale-95 transition-all duration-200 disabled:opacity-50 cursor-pointer"
      >
        {isUploading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Upload size={16} />
        )}
        {isUploading ? "Uploading..." : "Upload"}
      </button>
    </>
  );
}
