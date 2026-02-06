import React from "react";

export function Footer() {
  return (
    <footer className="py-12 border-t border-white/5 text-center text-slate-500 font-mono text-sm relative z-10 bg-black/60">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 text-cyber-neon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-3.293 3.293l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-3.293-3.293L16.586 10l-2.293-2.293a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          <span>Built for non-linear minds.</span>
        </div>
        <p>
          &copy; 2026 ContextCanvas Labs.{" "}
          <span className="text-cyber-neon">SYSTEM_READY</span>
        </p>
      </div>
    </footer>
  );
}
