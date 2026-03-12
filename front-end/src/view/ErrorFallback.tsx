import { Link, useRouteError, isRouteErrorResponse } from "react-router";
import { Home, ArrowLeft, AlertTriangle } from "lucide-react";

export default function ErrorFallback() {
  const error = useRouteError();
  const isNotFound = isRouteErrorResponse(error) && error.status === 404;

  const title = isNotFound ? "Page Not Found" : "Something went wrong";
  const description = isNotFound
    ? "The page you're looking for doesn't exist or has been moved."
    : "An unexpected error occurred. Please try again.";

  return (
    <div
      className="relative flex items-center justify-center h-dvh bg-[#fdfbf7] text-stone-800 overflow-hidden selection:bg-orange-200/40"
      style={{ fontFamily: "'Georgia', 'Cambria', 'Times New Roman', serif" }}
    >
      <div className="paper-texture fixed inset-0" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-orange-200/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {/* Icon */}
        <div
          className="bg-white w-20 h-20 rounded-2xl border-2 border-stone-200 flex items-center justify-center mb-6"
          style={{ boxShadow: "6px 6px 0px rgba(41, 37, 36, 0.1)" }}
        >
          <AlertTriangle className="w-9 h-9 text-orange-500" />
        </div>

        {/* Message card */}
        <div className="paper-card px-8 py-6 max-w-md">
          <h2 className="text-2xl font-bold text-stone-800 mb-2">{title}</h2>
          <p
            className="text-sm text-stone-500 leading-relaxed"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            {description}
          </p>
        </div>

        {/* Actions */}
        <div
          className="flex flex-col sm:flex-row gap-3 mt-8"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <Link
            to="/canvas"
            className="px-6 py-3 bg-stone-800 text-white font-semibold rounded-lg transition-transform duration-300 hover:scale-105 flex items-center justify-center gap-2 text-sm"
            style={{ boxShadow: "4px 4px 0px rgba(41, 37, 36, 0.15)" }}
          >
            <Home className="w-4 h-4" />
            Back to Canvas
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
      </div>
    </div>
  );
}
