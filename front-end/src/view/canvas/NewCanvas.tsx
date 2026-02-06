import { Plus, LayoutTemplate, ArrowRight, Sparkles } from "lucide-react";

export default function NewCanvas() {
  return (
    <div className="w-full h-full bg-canvas flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className="max-w-4xl w-full space-y-12">
        {/* Header Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3 bg-accent/10 rounded-full mb-4">
            <Sparkles className="w-6 h-6 text-accent" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-primary tracking-tight">
            Start Your Creation
          </h1>
          <p className="text-secondary text-lg md:text-xl max-w-2xl mx-auto">
            Choose a way to start your journey of thought and capture moments of inspiration.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-4">
          {/* Create Empty Card */}
          <button className="group relative flex flex-col items-start p-8 h-80 rounded-3xl border-2 border-dashed border-main hover:border-accent bg-node-bg/50 hover:bg-node-bg transition-[transform,box-shadow,border-color,background-color] duration-300 cursor-pointer text-left hover:-translate-y-1 hover:shadow-xl">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-300 transform translate-x-2 group-hover:translate-x-0">
              <ArrowRight className="w-6 h-6 text-accent" />
            </div>

            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-auto group-hover:scale-110 transition-transform duration-300">
              <Plus className="w-8 h-8 text-accent" />
            </div>

            <div className="space-y-2 mt-auto">
              <h3 className="text-2xl font-bold text-primary group-hover:text-accent transition-colors">
                Blank Canvas
              </h3>
              <p className="text-secondary text-base leading-relaxed group-hover:text-primary/80 transition-colors">
                Start from a blank slate and unleash your creativity.
                <br />
                Suitable for brainstorming and free drawing.
              </p>
            </div>
          </button>

          {/* Templates Card */}
          <button className="group relative flex flex-col items-start p-8 h-80 rounded-3xl border border-main hover:border-accent bg-node-bg shadow-sm hover:shadow-xl transition-[transform,box-shadow,border-color,background-color] duration-300 cursor-pointer text-left hover:-translate-y-1">
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-[opacity,transform] duration-300 transform translate-x-2 group-hover:translate-x-0">
              <ArrowRight className="w-6 h-6 text-accent" />
            </div>

            <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-auto group-hover:scale-110 transition-transform duration-300">
              <LayoutTemplate className="w-8 h-8 text-primary group-hover:text-accent transition-colors" />
            </div>

            <div className="space-y-2 mt-auto">
              <h3 className="text-2xl font-bold text-primary group-hover:text-accent transition-colors">
                Use Templates
              </h3>
              <p className="text-secondary text-base leading-relaxed group-hover:text-primary/80 transition-colors">
                Quick start based on mature thinking models.
                <br />
                Includes flowcharts, architecture diagrams, and more.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
