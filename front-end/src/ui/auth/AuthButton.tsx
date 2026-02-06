import { ArrowRight } from "lucide-react";
import { ButtonHTMLAttributes } from "react";

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
      className={`w-full bg-cyber-neon text-cyber-dark font-bold py-3 px-4 rounded-lg hover:bg-emerald-400 transition-colors duration-300 shadow-neon-green flex items-center justify-center gap-2 group/btn disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="w-4 h-4 border-2 border-cyber-dark/30 border-t-cyber-dark rounded-full animate-spin"></span>
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
