import type { ReactNode } from "react";
import { Link } from "react-router";
import { Network, Share2, Database, ShieldCheck, Zap } from "lucide-react";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex bg-cyber-dark text-slate-200 font-sans selection:bg-cyber-neon/30 overflow-hidden">
      {/* Left Panel - Visuals (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between relative bg-slate-900 border-r border-white/5 p-12 overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[image:var(--image-cyber-gradient)] opacity-60 pointer-events-none"></div>
        <div className="perspective-grid absolute inset-0 opacity-30"></div>
        
        {/* Logo Area */}
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3 group w-fit">
            <div className="relative flex h-8 w-8 items-center justify-center bg-cyber-neon/10 rounded-lg border border-cyber-neon/20 group-hover:border-cyber-neon/50 transition-colors">
               <Network className="w-5 h-5 text-cyber-neon" />
            </div>
            <span className="font-extrabold text-2xl tracking-tight text-white">
              Context<span className="text-cyber-neon">Canvas</span>
            </span>
          </Link>
        </div>

        {/* Center Visual */}
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center">
            {/* Abstract Canvas Visualization */}
            <div className="relative w-full max-w-sm aspect-square mb-8">
                {/* Center Node */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-cyber-neon/5 rounded-full border border-cyber-neon/20 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)] animate-pulse-slow">
                    <Database className="w-12 h-12 text-cyber-neon opacity-80" />
                </div>
                
                {/* Orbiting Nodes */}
                {[
                  { icon: Share2, delay: "0s", pos: "top-0 left-1/2 -translate-x-1/2", animation: "animate-float" },
                  { icon: ShieldCheck, delay: "2s", pos: "bottom-12 right-0", animation: "animate-float" },
                  { icon: Zap, delay: "4s", pos: "bottom-12 left-0", animation: "animate-float" },
                ].map((item, idx) => (
                    <div key={idx} className={`absolute ${item.pos} ${item.animation}`} style={{ animationDelay: item.delay }}>
                         <div className="w-14 h-14 bg-slate-800/80 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-center shadow-xl ring-1 ring-white/5">
                            <item.icon className="w-6 h-6 text-cyber-purple" />
                         </div>
                    </div>
                ))}
                
                 {/* Connecting Lines (Decorative SVG) */}
                 <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20 text-cyber-neon" viewBox="0 0 100 100">
                    <path d="M50 50 L50 15" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                    <path d="M50 50 L80 80" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                    <path d="M50 50 L20 80" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                    <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="0.2" fill="none" />
                    <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="0.1" fill="none" strokeDasharray="2 2" className="animate-spin-slow origin-center" />
                 </svg>
            </div>

            <div className="text-center max-w-md">
                <h3 className="text-3xl font-bold text-white mb-4 tracking-tight">Neural Knowledge Mapping</h3>
                <p className="text-slate-400 leading-relaxed text-lg">
                    Transform unstructured data into intelligent context canvases. Experience the next generation of knowledge management.
                </p>
            </div>
        </div>

        {/* Footer / Copyright */}
        <div className="relative z-10 flex justify-between items-end text-xs text-slate-500 font-mono">
           <span>© 2026 ContextCanvas Inc.</span>
           <span>SYS_READY // v2.0.4</span>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex flex-col relative overflow-y-auto bg-cyber-dark/50">
        {/* Mobile Header (only visible on small screens) */}
         <div className="lg:hidden p-6 flex justify-between items-center absolute top-0 left-0 w-full z-20">
            <Link to="/" className="flex items-center gap-2">
               <div className="h-6 w-6 bg-cyber-neon/20 rounded-md flex items-center justify-center">
                 <Network className="w-4 h-4 text-cyber-neon" />
               </div>
               <span className="font-bold text-lg text-white">Context<span className="text-cyber-neon">Canvas</span></span>
            </Link>
         </div>

        {/* Top Navigation (Desktop) */}
        <div className="hidden lg:flex justify-end p-8 absolute top-0 right-0 w-full z-20">
            <Link to="/" className="group flex items-center gap-2 text-sm font-mono text-slate-400 hover:text-white transition-colors px-4 py-2 rounded-full hover:bg-white/5 border border-transparent hover:border-white/10">
                <span>TERMINAL_EXIT</span>
                <span className="text-[10px] border border-slate-700 group-hover:border-slate-500 rounded px-1.5 py-0.5 transition-colors">ESC</span>
            </Link>
        </div>

        <main className="flex-1 flex items-center justify-center p-6 lg:p-12 relative z-10">
           <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
             {children}
           </div>
        </main>
        
        {/* Mobile footer note */}
        <div className="lg:hidden p-6 text-center text-[10px] text-slate-600 font-mono">
          SECURE_CONNECTION: TLS_1.3
        </div>
      </div>
    </div>
  );
}
