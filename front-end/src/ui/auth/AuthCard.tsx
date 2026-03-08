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
    <div className="paper-card p-8 relative overflow-hidden">
      {/* Decoration - warm accent top line */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-40"></div>

      <div className="mb-8 text-center">
        {Icon && (
          <div className="mx-auto w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center text-orange-600 mb-4 border border-orange-200">
            <Icon className="w-6 h-6" />
          </div>
        )}
        <h2 className="text-2xl font-bold text-stone-800 mb-2 tracking-tight">
          {title}
        </h2>
        <p className="text-stone-500 text-sm">{subtitle}</p>
      </div>

      {children}
    </div>
  );
}
