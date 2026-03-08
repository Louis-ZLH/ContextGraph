import { AlertCircle } from "lucide-react";

function ErrorBlock({ error }: { error: string }) {
  return (
    <div className="flex justify-center px-4 py-1">
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px]"
        style={{
          backgroundColor: "var(--error-bg, #fef2f2)",
          color: "var(--error-text, #dc2626)",
        }}
      >
        <AlertCircle size={12} className="shrink-0" />
        <span>{error}</span>
      </div>
    </div>
  );
}

export default ErrorBlock;
