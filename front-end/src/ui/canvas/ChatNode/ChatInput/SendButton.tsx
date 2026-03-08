import { ArrowUp } from "lucide-react";

function SendButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="relative group">
      <button
        className="p-1.5 rounded-full transition-colors"
        style={{
          backgroundColor: disabled ? "var(--text-secondary)" : "var(--accent)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
        onClick={disabled ? undefined : onClick}
      >
        <ArrowUp size={14} style={{ color: "#fff" }} />
      </button>
      {disabled && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[11px] whitespace-nowrap rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          style={{ backgroundColor: "var(--text-primary)", color: "var(--node-bg)" }}
        >
          Message too long
        </span>
      )}
    </div>
  );
}

export default SendButton;
