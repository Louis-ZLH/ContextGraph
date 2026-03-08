import type { LucideIcon } from "lucide-react";
import type { InputHTMLAttributes } from "react";

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
        <label className="text-xs font-semibold text-stone-600 uppercase tracking-wider" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          {label}
        </label>
        {rightElement}
      </div>
      <div className="relative group/input">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within/input:text-orange-600 transition-colors">
          <Icon className="w-5 h-5" />
        </div>
        <input
          className={`w-full bg-white border border-stone-200 rounded-lg py-3 pl-10 ${endAdornment ? "pr-12" : "pr-4"} text-stone-800 placeholder:text-stone-300 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 transition-colors text-sm`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          {...props}
        />
        {endAdornment && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors">
            {endAdornment}
          </div>
        )}
      </div>
    </div>
  );
}
