import { Square } from "lucide-react";

function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="p-1.5 rounded-full cursor-pointer transition-colors"
      style={{ backgroundColor: "var(--error-text, #dc2626)" }}
      title="Stop"
      onClick={onClick}
    >
      <Square size={14} fill="#fff" style={{ color: "#fff" }} />
    </button>
  );
}

export default StopButton;
