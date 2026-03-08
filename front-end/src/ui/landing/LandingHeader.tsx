import { useNavigate, Link } from "react-router";

export function LandingHeader() {
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 w-full z-50 h-16 bg-[#fdfbf7]/90 backdrop-blur-sm border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 font-extrabold tracking-tight text-xl"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
          </div>
          <span className="text-stone-800">
            Context<span className="text-orange-600">Canvas</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-stone-500" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          <Link
            to="#features"
            className="hover:text-orange-600 transition-colors relative group"
          >
            <span>Features</span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-orange-500 transition-[width] group-hover:w-full"></span>
          </Link>
          <Link
            to="#engine"
            className="hover:text-orange-600 transition-colors relative group"
          >
            <span>Engine</span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-orange-500 transition-[width] group-hover:w-full"></span>
          </Link>
          <Link
            to="#"
            className="hover:text-orange-600 transition-colors relative group"
          >
            <span>Docs</span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-orange-500 transition-[width] group-hover:w-full"></span>
          </Link>
        </div>

        <div className="flex items-center gap-4 text-sm" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
          <button
            onClick={() => navigate("/canvas")}
            className="cursor-pointer px-5 py-2 bg-stone-800 text-white rounded-lg font-semibold hover:bg-stone-700 transition-colors duration-300"
            style={{ boxShadow: '3px 3px 0px rgba(41, 37, 36, 0.15)' }}
          >
            Get Started &rarr;
          </button>
        </div>
      </div>
    </nav>
  );
}
