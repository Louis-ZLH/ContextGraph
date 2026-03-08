import { Github, KeyRound } from "lucide-react";

export function SocialLogin() {
  return (
    <div className="mt-8 pt-6 border-t border-stone-200 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px bg-stone-200 flex-1"></div>
        <span className="text-xs text-stone-400" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          Or continue with
        </span>
        <div className="h-px bg-stone-200 flex-1"></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="flex items-center justify-center gap-2 py-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-lg text-sm text-stone-600 transition-colors"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <Github className="w-4 h-4" /> Github
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-2 py-2.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-lg text-sm text-stone-600 transition-colors"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <KeyRound className="w-4 h-4" /> SSO
        </button>
      </div>
    </div>
  );
}
