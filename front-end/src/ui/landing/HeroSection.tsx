import { useNavigate } from "react-router";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <header className="pt-32 pb-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel text-xs font-mono text-cyber-neon tracking-wider mb-8 border-cyber-neon/20">
            <svg
              className="w-3 h-3 animate-pulse-slow"
              fill="currentColor"
              viewBox="0 0 8 8"
            >
              <circle cx="4" cy="4" r="3" />
            </svg>
            SYSTEM STATUS: V2.0 CORE ONLINE
          </div>

          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            <span className="block text-slate-100">Non-Linear AI for</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyber-neon via-cyber-cyan to-cyber-purple animate-pulse-slow">
              Complex Thought.
            </span>
          </h1>

          <p className="text-lg text-slate-400 mb-10 max-w-lg leading-relaxed font-sans">
            Stop forcing branching thoughts into linear chat streams.
            ContextCanvas is a spatial interface for LLMs that maps your mind,
            remembering every fork in the road.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 font-mono">
            <button className="cursor-pointer px-8 py-4 bg-cyber-neon text-cyber-dark font-bold rounded-md transition-transform duration-300 hover:scale-105 shadow-neon-green flex items-center justify-center gap-2" onClick={() => navigate('/canvas')}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5"
              >
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
              DEPLOY CANVAS ENGINE
            </button>
            <button className="cursor-pointer px-8 py-4 glass-panel text-slate-300 font-bold rounded-md border-white/10 hover:border-white/30 hover:text-white transition-colors flex items-center justify-center gap-2">
              $ READ_MANIFESTO.md
            </button>
          </div>
        </div>

        <div className="relative h-[500px] flex items-center justify-center perspective-container animate-float lg:mt-0 mt-12">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-cyber-neon/20 rounded-full blur-[100px] animate-pulse-slow"></div>

          <div className="relative z-10 w-40 h-40 glass-panel rounded-2xl border-cyber-neon/50 flex items-center justify-center shadow-neon-green animate-pulse-slow">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-16 w-16 text-cyber-neon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
            <div className="absolute inset-[-20px] border border-cyber-cyan/30 rounded-full animate-spin-slow border-dashed"></div>
            <div className="absolute inset-[-40px] border border-cyber-purple/20 rounded-full animate-spin-slow animation-delay-2000 border-dotted"></div>
          </div>

          <div className="absolute top-[15%] right-[10%] glass-panel px-4 py-2 rounded text-xs font-mono text-cyber-cyan border-cyber-cyan/30 shadow-neon-cyan animate-float animation-delay-1000">
            -&gt; Branch: React_Hooks
          </div>
          <div className="absolute bottom-[20%] left-[5%] glass-panel px-4 py-2 rounded text-xs font-mono text-cyber-purple border-cyber-purple/30 shadow-[0_0_20px_rgba(139,92,246,0.3)] animate-float animation-delay-2000">
            &lt;- Context: Backend_API
          </div>

          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
          >
            <path
              d="M 300 250 L 450 150"
              stroke="url(#gradient1)"
              strokeWidth="2"
              strokeDasharray="4 4"
              className="opacity-60"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="20"
                to="0"
                dur="1s"
                repeatCount="indefinite"
              />
            </path>
            <path
              d="M 200 250 L 150 350"
              stroke="url(#gradient2)"
              strokeWidth="2"
              strokeDasharray="4 4"
              className="opacity-60"
            >
              <animate
                attributeName="stroke-dashoffset"
                from="20"
                to="0"
                dur="1.5s"
                repeatCount="indefinite"
              />
            </path>
            <defs>
              <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#06B6D4" />
              </linearGradient>
              <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </header>
  );
}
