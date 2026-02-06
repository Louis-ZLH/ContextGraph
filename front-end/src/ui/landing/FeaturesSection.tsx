import React from "react";

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="font-mono text-cyber-neon">// </span> Let Your Mind
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyber-neon to-cyber-cyan">
              Branch Out.
            </span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto font-sans">
            Traditional chatbots force you into a single lane. ContextCanvas lets
            you explore parallel universes of thought.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="glass-panel p-8 rounded-2xl border-white/5 group hover:border-cyber-neon/50 transition-[transform,border-color] duration-500 hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyber-neon/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="w-14 h-14 bg-cyber-neon/10 rounded-xl flex items-center justify-center text-cyber-neon mb-6 group-hover:shadow-neon-green transition-shadow">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-white font-mono">
              Quantum Context Flow
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Context isn't lost; it's inherited. Branch off any message, and
              the new node instantly understands everything that came before it.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-2xl border-white/5 group hover:border-cyber-cyan/50 transition-[transform,border-color] duration-500 hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyber-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="w-14 h-14 bg-cyber-cyan/10 rounded-xl flex items-center justify-center text-cyber-cyan mb-6 group-hover:shadow-neon-cyan transition-shadow">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 4"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-white font-mono">
              The Spatial Canvas
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Visualize your conversation history as an interactive map. Zoom
              out to see the big picture, zoom in to focus on details.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-2xl border-white/5 group hover:border-cyber-purple/50 transition-[transform,border-color] duration-500 hover:-translate-y-2 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-cyber-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="w-14 h-14 bg-cyber-purple/10 rounded-xl flex items-center justify-center text-cyber-purple mb-6 group-hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] transition-shadow">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-white font-mono">
              Artifact Persistence
            </h3>
            <p className="text-slate-400 leading-relaxed">
              Your canvases are permanent knowledge bases. Export complex
              discussions to JSON or Markdown for documentation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
