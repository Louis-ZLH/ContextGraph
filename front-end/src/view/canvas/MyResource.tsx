import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Search, Download, Trash2, FileQuestion, SearchX, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { fileListQueryOptions } from "../../query/file";
import { deleteFile, formatFileSize, getFileCategoryFromMime } from "../../service/file";
import { FileTypeIcon } from "../../ui/canvas/ResourceNode/FileTypeIcon";
import { Modal } from "../../ui/common/Modal";
import { BASE_URL } from "../../util/api";
import { queryClient } from "../../query";
import type { FileListItem } from "../../service/type";

const PAGE_LIMIT = 20;

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function MyResource() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<FileListItem | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const debouncedKeyword = useDebounce(keyword, 300);

  const { data: result, isLoading } = useQuery(
    fileListQueryOptions({ page, limit: PAGE_LIMIT, keyword: debouncedKeyword })
  );

  const fileList = result?.data;
  const files = fileList?.files ?? [];
  const total = fileList?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const { mutate: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: (fileId: string) => deleteFile(fileId),
    onSuccess: (data) => {
      if (data.success) {
        toast.success("File deleted");
        queryClient.invalidateQueries({ queryKey: ["file", "list"] });
        setDeleteTarget(null);
      } else {
        toast.error(data.message);
      }
    },
    onError: () => {
      toast.error("Failed to delete file");
    },
  });

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyword(e.target.value);
    setPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setKeyword("");
    setPage(1);
  }, []);

  const isImage = (contentType: string) => contentType.startsWith("image/");

  return (
    <div className="w-full h-full bg-canvas overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <h1 className="text-3xl font-bold text-primary">My Resources</h1>
          <div className={`relative w-full sm:w-72 transition-all duration-300 ${searchFocused ? "sm:w-80" : ""}`}>
            <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 ${searchFocused ? "text-accent" : "text-secondary"}`} />
            <input
              type="text"
              value={keyword}
              onChange={handleSearchChange}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search files..."
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-main bg-node-bg text-primary text-sm placeholder:text-secondary focus:outline-none focus:border-accent focus:ring-1 focus:ring-(--accent)/70 transition-all duration-200"
            />
            {keyword && (
              <button
                onClick={clearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-primary transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-main bg-node-bg overflow-hidden animate-pulse">
                <div className="h-40 bg-secondary/10" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-secondary/10" />
                  <div className="h-3 w-1/2 rounded bg-secondary/10" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && files.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            {debouncedKeyword ? (
              <>
                <SearchX size={48} className="text-secondary" />
                <p className="text-secondary text-lg">No matching files found</p>
                <button
                  onClick={clearSearch}
                  className="text-sm text-accent hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <FileQuestion size={48} className="text-secondary" />
                <p className="text-secondary text-lg">No files uploaded yet</p>
              </>
            )}
          </div>
        )}

        {/* Cards grid */}
        {!isLoading && files.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {files.map((file) => {
                const fileCategory = getFileCategoryFromMime(file.contentType, file.filename);
                const fileUrl = `${BASE_URL}/api/file/${file.fileId}`;

                return (
                  <div
                    key={file.fileId}
                    className="group relative rounded-xl border border-main bg-node-bg overflow-hidden cursor-pointer transition-shadow hover:shadow-lg"
                    onClick={() => window.open(fileUrl, "_blank")}
                  >
                    {/* Thumbnail */}
                    <div className="h-40 flex items-center justify-center bg-secondary/5 overflow-hidden">
                      {isImage(file.contentType) ? (
                        <ImageThumbnail fileUrl={fileUrl} filename={file.filename} fileCategory={fileCategory} />
                      ) : (
                        <FileTypeIcon fileType={fileCategory} size={40} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <p className="text-sm font-medium text-primary truncate" title={file.filename}>
                        {file.filename}
                      </p>
                      <p className="text-xs text-secondary mt-1">
                        {formatFileSize(file.fileSize)} · {new Date(file.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-2.5 rounded-full bg-white/90 hover:bg-white text-gray-700 transition-colors cursor-pointer"
                        title="Download"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`${fileUrl}?download=true`, "_blank");
                        }}
                      >
                        <Download size={18} />
                      </button>
                      <button
                        className="p-2.5 rounded-full bg-white/90 hover:bg-white text-red-500 transition-colors cursor-pointer"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(file);
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-main text-sm text-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--node-bg) hover:border-(--accent)/50 hover:text-(--accent) active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>
                <span className="text-sm text-secondary">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-main text-sm text-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-(--node-bg) hover:border-(--accent)/50 hover:text-(--accent) active:scale-95 transition-all duration-200 cursor-pointer"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete File"
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-main text-sm text-primary hover:bg-node-bg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              disabled={isDeleting}
              onClick={() => deleteTarget && doDelete(deleteTarget.fileId)}
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        <p className="text-secondary">
          Are you sure you want to delete <span className="font-medium text-primary">{deleteTarget?.filename}</span>?
          This action cannot be undone. Any canvas nodes referencing this file will show as deleted.
        </p>
      </Modal>
    </div>
  );
}

function ImageThumbnail({ fileUrl, filename, fileCategory }: { fileUrl: string; filename: string; fileCategory: ReturnType<typeof getFileCategoryFromMime> }) {
  const [error, setError] = useState(false);

  if (error) {
    return <FileTypeIcon fileType={fileCategory} size={40} />;
  }

  return (
    <img
      src={fileUrl}
      alt={filename}
      loading="lazy"
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}
