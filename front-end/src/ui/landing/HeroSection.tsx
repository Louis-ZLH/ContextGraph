import { useNavigate } from "react-router";
import { PenTool, BookOpen, Sparkles } from "lucide-react";

export function HeroSection() {
  const navigate = useNavigate();

  return (
    <header className="pt-32 pb-24 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-xs text-orange-700 tracking-wider mb-8" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <svg
              className="w-3 h-3"
              fill="currentColor"
              viewBox="0 0 8 8"
            >
              <circle cx="4" cy="4" r="3" />
            </svg>
            Now in beta &mdash; try it free
          </div>

          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            <span className="block text-stone-800">Non-Linear AI for</span>
            <span className="text-orange-600">
              Complex Thought.
            </span>
          </h1>

          <p className="text-lg text-stone-500 mb-10 max-w-lg leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            Stop forcing branching thoughts into linear chat streams.
            ContextCanvas is a spatial interface for LLMs that maps your mind,
            remembering every fork in the road.
          </p>

          <div className="flex flex-col sm:flex-row gap-4" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <button
              className="cursor-pointer px-8 py-4 bg-stone-800 text-white font-bold rounded-lg transition-transform duration-300 hover:scale-105 flex items-center justify-center gap-2"
              style={{ boxShadow: '4px 4px 0px rgba(41, 37, 36, 0.15)' }}
              onClick={() => navigate('/canvas')}
            >
              <PenTool className="w-5 h-5" />
              Start Creating
            </button>
            <button className="cursor-pointer px-8 py-4 bg-white text-stone-700 font-bold rounded-lg border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors flex items-center justify-center gap-2" style={{ boxShadow: '3px 3px 0px rgba(41, 37, 36, 0.08)' }}>
              Learn More
            </button>
          </div>
        </div>

        <div className="relative h-[500px] flex items-center justify-center animate-float lg:mt-0 mt-12">
          {/* Warm glow background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-orange-200/30 rounded-full blur-[100px]"></div>

          {/* Center node - paper style */}
          <div className="relative z-10 w-40 h-40 bg-white rounded-2xl border-2 border-stone-200 flex items-center justify-center" style={{ boxShadow: '6px 6px 0px rgba(41, 37, 36, 0.1)' }}>
            <BookOpen className="h-16 w-16 text-orange-600" />
            <div className="absolute inset-[-20px] border border-stone-200 rounded-full border-dashed opacity-40"></div>
            <div className="absolute inset-[-40px] border border-stone-200 rounded-full border-dotted opacity-20"></div>
          </div>

          {/* Floating label cards */}
          <div className="absolute top-[15%] right-[10%] bg-white px-4 py-2 rounded-lg text-xs text-stone-600 border border-stone-200 animate-float" style={{ animationDelay: '1s', boxShadow: '3px 3px 0px rgba(41, 37, 36, 0.08)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <span className="flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-orange-500" /> Branch: React Hooks</span>
          </div>
          <div className="absolute bottom-[20%] left-[5%] bg-white px-4 py-2 rounded-lg text-xs text-stone-600 border border-stone-200 animate-float" style={{ animationDelay: '2s', boxShadow: '3px 3px 0px rgba(41, 37, 36, 0.08)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            <span className="flex items-center gap-1.5"><BookOpen className="w-3 h-3 text-orange-500" /> Context: Backend API</span>
          </div>

          {/* Connecting lines */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
          >
            <path
              d="M 300 250 L 450 150"
              stroke="#d6d3d1"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              className="opacity-60"
            />
            <path
              d="M 200 250 L 150 350"
              stroke="#d6d3d1"
              strokeWidth="1.5"
              strokeDasharray="5 5"
              className="opacity-60"
            />
          </svg>
        </div>
      </div>
    </header>
  );
}
