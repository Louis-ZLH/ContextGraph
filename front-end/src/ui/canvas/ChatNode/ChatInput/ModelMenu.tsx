import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

function ModelMenu({
  models,
  selectedIndex,
  onSelect,
  expandUp,
}: {
  models: readonly string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  expandUp: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <div ref={menuRef} className="relative z-50">
      <button
        className="flex items-center gap-0.5 px-2.5 pb-1 pt-1.5 rounded-full cursor-pointer transition-colors hover:bg-black/5 text-[12px] whitespace-nowrap"
        style={{ color: "var(--text-secondary)" }}
        title="Switch model"
        onClick={() => setOpen((v) => !v)}
      >
        {models[selectedIndex]}
        <ChevronDown
          size={12}
          className="transition-transform duration-200"
          style={{
            color: "var(--text-secondary)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      <div
        className={`absolute right-0 ${expandUp ? "bottom-full mb-2 origin-bottom-right" : "top-full mt-2 origin-top-right"} flex flex-col rounded-xl border-[0.5px] shadow-lg transition-all duration-200 z-50 py-1`}
        style={{
          borderColor: "var(--border-main)",
          backgroundColor: "var(--node-bg)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1)" : "scale(0.95)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {models.map((model, i) => (
          <button
            key={model}
            className="flex items-center gap-3 px-5 py-2.5 text-[13px] whitespace-nowrap cursor-pointer transition-colors hover:bg-gray-500/10"
            style={{
              color: i === selectedIndex ? "var(--accent)" : "var(--text-primary)",
              fontWeight: i === selectedIndex ? 600 : 400,
            }}
            onClick={() => {
              onSelect(i);
              setOpen(false);
            }}
          >
            {model}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ModelMenu;
