import { Link, useLocation } from "react-router";
import { Home, ArrowLeft, Search } from "lucide-react";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div
      className="relative flex items-center justify-center h-dvh bg-[#fdfbf7] text-stone-800 overflow-hidden selection:bg-orange-200/40"
      style={{ fontFamily: "'Georgia', 'Cambria', 'Times New Roman', serif" }}
    >
      {/* Paper texture overlay */}
      <div className="paper-texture fixed inset-0" />

      {/* Warm glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-200/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Decorative dashed circles */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-dashed border-stone-200 rounded-full opacity-40 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] border border-dotted border-stone-200 rounded-full opacity-25 pointer-events-none" />

      {/* Floating decorative cards */}
      <div
        className="absolute top-[12%] right-[15%] bg-white px-4 py-2.5 rounded-lg text-xs text-stone-400 border border-stone-200 animate-float hidden md:block"
        style={{ animationDelay: "0.5s", boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)", fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <span className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-orange-400" />
          Route not found
        </span>
      </div>
      <div
        className="absolute bottom-[18%] left-[12%] bg-white px-4 py-2.5 rounded-lg text-xs text-stone-400 border border-stone-200 animate-float hidden md:block"
        style={{ animationDelay: "1.5s", boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)", fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange-400" />
          Lost in the canvas
        </span>
      </div>

      {/* Main content card */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* 404 number */}
        <div className="relative mb-6">
          <span className="text-[10rem] sm:text-[12rem] font-extrabold leading-none tracking-tighter text-stone-100">
            404
          </span>
          <div
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="bg-white w-32 h-32 rounded-2xl border-2 border-stone-200 flex items-center justify-center"
              style={{ boxShadow: "6px 6px 0px rgba(41, 37, 36, 0.1)" }}
            >
              <img src="/icon.svg" alt="ContextCanvas" className="h-14 w-14 opacity-60" />
            </div>
          </div>
        </div>

        {/* Paper card with message */}
        <div
          className="paper-card px-8 py-6 max-w-md"
        >
          <h2 className="text-2xl font-bold text-stone-800 mb-2">
            Page Not Found
          </h2>
          <p
            className="text-sm text-stone-500 leading-relaxed mb-1"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            The page you're looking for doesn't exist or has been moved.
          </p>
          <p
            className="text-xs text-stone-400 font-mono bg-stone-50 rounded px-2 py-1 inline-block"
          >
            {location.pathname}
          </p>
        </div>

        {/* Action buttons */}
        <div
          className="flex flex-col sm:flex-row gap-3 mt-8"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <Link
            to="/"
            className="px-6 py-3 bg-stone-800 text-white font-semibold rounded-lg transition-transform duration-300 hover:scale-105 flex items-center justify-center gap-2 text-sm"
            style={{ boxShadow: "4px 4px 0px rgba(41, 37, 36, 0.15)" }}
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="cursor-pointer px-6 py-3 bg-white text-stone-700 font-semibold rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors flex items-center justify-center gap-2 text-sm"
            style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        {/* Footer hint */}
        <p
          className="mt-10 text-xs text-stone-400"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          Lost? Try starting from the{" "}
          <Link to="/canvas" className="text-orange-600 hover:underline font-medium">
            Canvas
          </Link>
        </p>
      </div>
    </div>
  );
}
