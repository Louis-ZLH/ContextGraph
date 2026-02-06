import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AuthCardProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  icon?: LucideIcon;
}

export function AuthCard({
  children,
  title,
  subtitle,
  icon: Icon,
}: AuthCardProps) {
  return (
    <div className="glass-panel p-8 rounded-2xl border-white/10 shadow-2xl relative overflow-hidden group">
      {/* Decoration */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-neon to-transparent opacity-50"></div>

      <div className="mb-8 text-center">
        {Icon && (
          <div className="mx-auto w-12 h-12 bg-cyber-neon/10 rounded-full flex items-center justify-center text-cyber-neon mb-4 shadow-neon-green">
            <Icon className="w-6 h-6" />
          </div>
        )}
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">
          {title}
        </h2>
        <p className="text-slate-400 text-sm font-mono">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}
