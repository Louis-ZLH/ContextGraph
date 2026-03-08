import { useState, useRef, useEffect, memo } from "react";
import { Plus, Upload, Search, BookOpen } from "lucide-react";

const modeItems = [
  { icon: BookOpen, label: "Study & Learn" },
  { icon: Search, label: "Web Search" },
] as const;

function PlusMenu({ position, expandUp = true, onSelectMode, onUploadFile }: { position: "inline" | "absolute"; expandUp?: boolean; onSelectMode?: (mode: "Study & Learn" | "Web Search") => void; onUploadFile?: (files: File[]) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      ref={menuRef}
      className={
        position === "absolute"
          ? "absolute left-2 top-1/2 -translate-y-1/2 z-50"
          : "relative z-50"
      }
    >
      <button
        className="p-1.5 rounded-full hover:bg-gray-500/10 cursor-pointer transition-colors hover:opacity-70"
        title="More options"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus
          size={14}
          className="transition-transform duration-200"
          style={{
            color: "var(--text-secondary)",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        />
      </button>
      <div
        className={`absolute left-0 ${expandUp ? "bottom-full mb-2 origin-bottom-left" : "top-full mt-2 origin-top-left"} flex flex-col rounded-xl border-[0.5px] shadow-lg transition-all duration-200 z-50 py-1`}
        style={{
          borderColor: "var(--border-main)",
          backgroundColor: "var(--node-bg)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.95)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {!expandUp && (
          <button
            className="flex items-center gap-3 px-5 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors hover:bg-gray-500/10"
            style={{ color: "var(--text-primary)" }}
            onClick={() => { fileInputRef.current?.click(); setOpen(false); }}
          >
            <Upload size={14} style={{ color: "var(--text-secondary)" }} strokeWidth={3} />
            Upload File
          </button>
        )}
        {modeItems.map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-3 px-5 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors hover:bg-gray-500/10"
            style={{ color: "var(--text-primary)" }}
            onClick={() => { onSelectMode?.(label); setOpen(false); }}
          >
            <Icon size={14} style={{ color: "var(--text-secondary)" }} strokeWidth={3} />
            {label}
          </button>
        ))}
        {expandUp && (
          <button
            className="flex items-center gap-3 px-5 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors hover:bg-gray-500/10"
            style={{ color: "var(--text-primary)" }}
            onClick={() => { fileInputRef.current?.click(); setOpen(false); }}
          >
            <Upload size={14} style={{ color: "var(--text-secondary)" }} strokeWidth={3} />
            Upload File
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.svg,.txt,.md,.docx,.xlsx,.pptx,.csv,.json"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onUploadFile?.(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default memo(PlusMenu);
