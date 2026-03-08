import { ArrowRight } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  className?: string;
}

export function AuthButton({
  children,
  isLoading,
  loadingText = "Loading...",
  className = "",
  ...props
}: AuthButtonProps) {
  return (
    <button
      disabled={isLoading || props.disabled}
      className={`w-full bg-stone-800 text-white font-bold py-3 px-4 rounded-lg hover:bg-stone-700 transition-colors duration-300 flex items-center justify-center gap-2 group/btn disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
      style={{ fontFamily: "'Inter', system-ui, sans-serif", boxShadow: '3px 3px 0px rgba(41, 37, 36, 0.15)' }}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          {loadingText}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
        </>
      )}
    </button>
  );
}
