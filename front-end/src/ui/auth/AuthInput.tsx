import type { LucideIcon } from "lucide-react";
import { InputHTMLAttributes } from "react";

interface AuthInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  rightElement?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

export function AuthInput({
  label,
  icon: Icon,
  rightElement,
  endAdornment,
  className,
  ...props
}: AuthInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center ml-1">
        <label className="text-xs font-mono text-cyber-neon/80 uppercase tracking-wider">
          {label}
        </label>
        {rightElement}
      </div>
      <div className="relative group/input">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-cyber-neon transition-colors">
          <Icon className="w-5 h-5" />
        </div>
        <input
          className={`w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 ${endAdornment ? "pr-12" : "pr-4"} text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyber-neon/50 focus:ring-1 focus:ring-cyber-neon/50 transition-colors font-mono text-sm`}
          {...props}
        />
        {endAdornment && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
            {endAdornment}
          </div>
        )}
      </div>
    </div>
  );
}
