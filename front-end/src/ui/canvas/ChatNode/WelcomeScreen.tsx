import { Sparkles } from "lucide-react";
import { SUGGESTIONS } from "./types";

interface WelcomeScreenProps {
  onSuggestionClick: (suggestion: string) => void;
  children?: React.ReactNode;
}

function WelcomeScreen({ onSuggestionClick, children }: WelcomeScreenProps) {
  return (
    <div className="flex flex-col items-center h-full px-6 justify-center">
      <div className="flex flex-col items-center w-full -translate-y-1/5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: "var(--accent-light)" }}
        >
          <Sparkles size={20} style={{ color: "var(--accent)" }} />
        </div>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          How can I help you?
        </p>
        <p
          className="text-xs mb-5"
          style={{ color: "var(--text-secondary)" }}
        >
          Ask anything or try a suggestion below
        </p>
        {children && (
          <>
            {children}
          </>
        )}
        <div className="flex flex-wrap gap-2 justify-center">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="px-3 py-1.5 text-xs rounded-full border cursor-pointer transition-colors hover:opacity-80"
              style={{
                borderColor: "var(--border-main)",
                color: "var(--text-secondary)",
                backgroundColor: "transparent",
              }}
              onClick={() => onSuggestionClick(s)}
            >
              {s}
            </button>
          ))}
        </div>
        </div>
    </div>
  );
}

export default WelcomeScreen;
