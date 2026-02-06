import { useNavigate, Link } from "react-router";

export function LandingHeader() {
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 w-full z-50 h-16 glass-panel border-b-0 border-b-white/5">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 font-extrabold tracking-tight text-xl"
        >
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyber-neon opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyber-neon"></span>
          </div>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Context<span className="text-cyber-neon">Canvas</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 font-mono text-sm text-slate-400">
          <Link
            to="#features"
            className="hover:text-cyber-neon transition-colors relative group"
          >
            <span>// Features</span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyber-neon transition-[width] group-hover:w-full"></span>
          </Link>
          <Link
            to="#engine"
            className="hover:text-cyber-cyan transition-colors relative group"
          >
            <span>// Engine</span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyber-cyan transition-[width] group-hover:w-full"></span>
          </Link>
          <Link
            to="#"
            className="hover:text-cyber-purple transition-colors relative group"
          >
            <span>// Docs</span>
            <span className="absolute -bottom-1 left-0 w-0 h-px bg-cyber-purple transition-[width] group-hover:w-full"></span>
          </Link>
        </div>

        <div className="flex items-center gap-4 font-mono text-sm">
          {/* <Link
            to="/login"
            className="text-slate-400 hover:text-white transition"
          >
            Login
          </Link> */}
          <button
            onClick={() => navigate("/canvas")}
            className="cursor-pointer px-5 py-2 bg-cyber-neon/10 border border-cyber-neon/50 text-cyber-neon rounded font-bold hover:bg-cyber-neon hover:text-cyber-dark transition-[color,background-color,box-shadow] duration-300 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-neon-green"
          >
            Initialize_Canvas &gt;_
          </button>
        </div>
      </div>
    </nav>
  );
}
