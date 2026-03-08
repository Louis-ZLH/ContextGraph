import { BookOpen } from "lucide-react";

export function Footer() {
  return (
    <footer className="py-12 border-t border-stone-200 text-center text-stone-500 text-sm relative z-10 bg-stone-50/50" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-orange-600" />
          <span>Built for creative minds.</span>
        </div>
        <p>
          &copy; 2026 ContextCanvas Labs.
        </p>
      </div>
    </footer>
  );
}
