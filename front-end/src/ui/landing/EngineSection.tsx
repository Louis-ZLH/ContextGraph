import React from "react";

export function EngineSection() {
  return (
    <section
      id="engine"
      className="py-24 relative border-t border-white/5 bg-black/40"
    >
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-5 gap-12 items-center">
        <div className="lg:col-span-2">
          <h2 className="text-3xl font-bold mb-6">
            Powered by <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyber-cyan to-cyber-purple">
              Model-Agnostic Intelligence.
            </span>
          </h2>
          <p className="text-slate-400 mb-8 font-sans leading-relaxed">
            ContextCanvas is the interface layer; you choose the brain. Switch
            seamlessly between state-of-the-art models depending on your task's
            needs.
          </p>
          <div className="flex items-center gap-4 font-mono text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyber-neon animate-pulse"></div>{" "}
              Low Latency
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyber-cyan animate-pulse"></div>{" "}
              Secure API
            </div>
          </div>
        </div>
        <div className="lg:col-span-3">
          <div className="glass-panel rounded-xl overflow-hidden border-white/10 shadow-2xl">
            <div className="h-8 bg-slate-900/80 flex items-center px-4 gap-2 border-b border-white/5">
              <div className="w-3 h-3 rounded-full bg-slate-600"></div>
              <div className="w-3 h-3 rounded-full bg-slate-600"></div>
              <div className="w-3 h-3 rounded-full bg-slate-600"></div>
              <span className="ml-4 font-mono text-xs text-slate-500">
                ~/config/models.json
              </span>
            </div>
            <div className="p-6 font-mono text-sm text-slate-300 leading-7">
              <div>
                <span className="text-cyber-purple">"models"</span>: [
              </div>
              <div className="pl-4">
                {"{"} <span className="text-cyber-cyan">"id"</span>:{" "}
                <span className="text-cyber-neon">"gpt-4o"</span>,{" "}
                <span className="text-cyber-cyan">"provider"</span>:{" "}
                <span className="text-green-400">"OpenAI"</span> {"}"},
              </div>
              <div className="pl-4">
                {"{"} <span className="text-cyber-cyan">"id"</span>:{" "}
                <span className="text-cyber-neon">"claude-3.5-sonnet"</span>,{" "}
                <span className="text-cyber-cyan">"provider"</span>:{" "}
                <span className="text-orange-400">"Anthropic"</span> {"}"},
              </div>
              <div className="pl-4 opacity-50">// More models available...</div>
              <div>]</div>
              <div className="mt-4 flex gap-2">
                <span className="text-cyber-neon">$</span> cursor{" "}
                <span className="animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
