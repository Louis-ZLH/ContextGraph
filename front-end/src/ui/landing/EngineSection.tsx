export function EngineSection() {
  return (
    <section
      id="engine"
      className="py-24 relative border-t border-stone-200 bg-stone-50/50"
    >
      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-5 gap-12 items-center">
        <div className="lg:col-span-2">
          <h2 className="text-3xl font-bold mb-6 text-stone-800">
            Powered by <br />
            <span className="text-orange-600">
              Model-Agnostic Intelligence.
            </span>
          </h2>
          <p className="text-stone-500 mb-8 leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            ContextCanvas is the interface layer; you choose the brain. Switch
            seamlessly between state-of-the-art models depending on your task's
            needs.
          </p>
          <div className="flex items-center gap-4 text-xs text-stone-400" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>{" "}
              Low Latency
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>{" "}
              Secure API
            </div>
          </div>
        </div>
        <div className="lg:col-span-3">
          <div className="paper-card rounded-xl overflow-hidden" style={{ boxShadow: '5px 5px 0px rgba(41, 37, 36, 0.1)' }}>
            <div className="h-8 bg-stone-50 flex items-center px-4 gap-2 border-b border-stone-200">
              <div className="w-3 h-3 rounded-full bg-stone-300"></div>
              <div className="w-3 h-3 rounded-full bg-stone-300"></div>
              <div className="w-3 h-3 rounded-full bg-stone-300"></div>
              <span className="ml-4 text-xs text-stone-400" style={{ fontFamily: "'Fira Code', 'Menlo', monospace" }}>
                ~/config/models.json
              </span>
            </div>
            <div className="p-6 text-sm text-stone-600 leading-7 bg-white" style={{ fontFamily: "'Fira Code', 'Menlo', monospace" }}>
              <div>
                <span className="text-purple-600">"models"</span>: [
              </div>
              <div className="pl-4">
                {"{"} <span className="text-blue-600">"id"</span>:{" "}
                <span className="text-green-700">"gpt-5.2"</span>,{" "}
                <span className="text-blue-600">"provider"</span>:{" "}
                <span className="text-orange-600">"OpenAI"</span> {"}"},
              </div>
              <div className="pl-4">
                {"{"} <span className="text-blue-600">"id"</span>:{" "}
                <span className="text-green-700">"claude-opus-4.5"</span>,{" "}
                <span className="text-blue-600">"provider"</span>:{" "}
                <span className="text-orange-600">"Anthropic"</span> {"}"},
              </div>
              <div className="pl-4">
                {"{"} <span className="text-blue-600">"id"</span>:{" "}
                <span className="text-green-700">"gemini-3.1-preview"</span>,{" "}
                <span className="text-blue-600">"provider"</span>:{" "}
                <span className="text-orange-600">"Google"</span> {"}"},
              </div>
              <div className="pl-4 opacity-40">// More models available...</div>
              <div>]</div>
              <div className="mt-4 flex gap-2">
                <span className="text-orange-600">&gt;</span> cursor{" "}
                <span className="animate-pulse">_</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
