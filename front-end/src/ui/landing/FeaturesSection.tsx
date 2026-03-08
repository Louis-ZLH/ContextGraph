import { GitBranch, Map, Archive } from "lucide-react";

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-stone-800">
            Let Your Mind{" "}
            <span className="text-orange-600">
              Branch Out.
            </span>
          </h2>
          <p className="text-stone-500 max-w-xl mx-auto" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            Traditional chatbots force you into a single lane. ContextCanvas lets
            you explore parallel paths of thought.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="paper-card paper-card-hover p-8 group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10">
              <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 mb-6 border border-orange-200">
                <GitBranch className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-stone-800">
                Context Flow
              </h3>
              <p className="text-stone-500 leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                Context isn't lost; it's inherited. Branch off any message, and
                the new node instantly understands everything that came before it.
              </p>
            </div>
          </div>

          <div className="paper-card paper-card-hover p-8 group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10">
              <div className="w-14 h-14 bg-amber-50 rounded-xl flex items-center justify-center text-amber-700 mb-6 border border-amber-200">
                <Map className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-stone-800">
                Spatial Canvas
              </h3>
              <p className="text-stone-500 leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                Visualize your conversation history as an interactive map. Zoom
                out to see the big picture, zoom in to focus on details.
              </p>
            </div>
          </div>

          <div className="paper-card paper-card-hover p-8 group relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-stone-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10">
              <div className="w-14 h-14 bg-stone-100 rounded-xl flex items-center justify-center text-stone-600 mb-6 border border-stone-200">
                <Archive className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-stone-800">
                Persistent Knowledge
              </h3>
              <p className="text-stone-500 leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                Your canvases are permanent knowledge bases. Export complex
                discussions to JSON or Markdown for documentation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
