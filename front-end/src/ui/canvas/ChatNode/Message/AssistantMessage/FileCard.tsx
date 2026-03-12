import { Download, FileText, FileImage, X, ZoomIn, Loader2 } from "lucide-react";
import { useEffect, useState, memo } from "react";
import { createPortal } from "react-dom";
import { BASE_URL } from "../../../../../util/api";

/** Reusable file card for all three states (base64 preview, stream-complete URL, history URL) */
const FileCard = memo(function FileCard({ src, filename, isPreview }: { src: string; filename?: string; isPreview?: boolean }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isImage = src.startsWith("data:image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename ?? "");
  const downloadUrl = !isPreview && !src.startsWith("data:") ? `${src}${src.includes("?") ? "&" : "?"}download=true` : undefined;
  const resolvedSrc = isPreview ? src : (/^\//.test(src) ? `${BASE_URL}${src}` : src);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen]);

  if (isPreview || isImage) {
    return (
      <>
        <div className="mt-2 rounded-lg overflow-hidden border border-main inline-block max-w-[280px] relative group">
          {isPreview && !imgLoaded && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--bg-secondary)" }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-secondary)" }} />
            </div>
          )}
          <div className="cursor-pointer relative" onClick={() => !isPreview && setLightboxOpen(true)}>
            <img
              src={resolvedSrc}
              alt={filename ?? "Generated image"}
              className={`max-w-[280px] max-h-[280px] object-contain transition-opacity duration-300 ${imgLoaded || !isPreview ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgLoaded(true)}
              draggable={false}
            />
            {!isPreview && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200">
                <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
              </div>
            )}
          </div>
          {(filename || downloadUrl) && (
            <div className="flex items-center justify-between px-2 py-1.5 gap-2" style={{ backgroundColor: "var(--bg-secondary)" }}>
              {filename && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileImage size={12} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
                  <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{filename}</span>
                </div>
              )}
              {downloadUrl && (
                <a href={`${/^\//.test(downloadUrl) ? BASE_URL : ""}${downloadUrl}`} className="shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity" title="Download">
                  <Download size={12} style={{ color: "var(--text-secondary)" }} />
                </a>
              )}
            </div>
          )}
        </div>
        {lightboxOpen && createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={() => setLightboxOpen(false)}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <img
              src={resolvedSrc}
              alt={filename ?? "Generated image"}
              className="relative max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
            <div className="absolute top-4 right-4 flex items-center gap-2">
              {downloadUrl && (
                <a
                  href={`${/^\//.test(downloadUrl) ? BASE_URL : ""}${downloadUrl}`}
                  className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                  title="Download"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={20} />
                </a>
              )}
              <button
                onClick={() => setLightboxOpen(false)}
                className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  // Non-image file card
  return (
    <div className="mt-2 rounded-lg border border-main inline-flex items-center gap-2 px-3 py-2 max-w-[280px]" style={{ backgroundColor: "var(--bg-secondary)" }}>
      <FileText size={16} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
      <span className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{filename}</span>
      {downloadUrl && (
        <a href={`${/^\//.test(downloadUrl) ? BASE_URL : ""}${downloadUrl}`} className="shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity" title="Download">
          <Download size={12} style={{ color: "var(--text-secondary)" }} />
        </a>
      )}
    </div>
  );
});

export default FileCard;
