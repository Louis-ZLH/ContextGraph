import { Github, Terminal } from "lucide-react";

export function SocialLogin() {
  return (
    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-px bg-white/10 flex-1"></div>
        <span className="text-xs text-slate-500 font-mono">
          Or continue with
        </span>
        <div className="h-px bg-white/10 flex-1"></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-lg text-sm text-slate-300 transition-colors"
        >
          <Github className="w-4 h-4" /> Github
        </button>
        <button
          type="button"
          className="flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-lg text-sm text-slate-300 transition-colors"
        >
          <Terminal className="w-4 h-4" /> SSO
        </button>
      </div>
    </div>
  );
}
