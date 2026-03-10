import { useEffect, useRef, useState } from "react";
import {
  Rocket,
  LayoutGrid,
  GitBranch,
  Move,
  Download,
  ChevronRight,
} from "lucide-react";

const sections = [
  { id: "getting-started", label: "Getting Started", icon: Rocket },
  { id: "create-canvas", label: "Create a Canvas", icon: LayoutGrid },
  { id: "branching", label: "Context Branching", icon: GitBranch },
  { id: "spatial-navigation", label: "Spatial Navigation", icon: Move },
  { id: "export", label: "Export Your Work", icon: Download },
];

function useActiveSection() {
  const [activeId, setActiveId] = useState(sections[0].id);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
  }, []);

  return activeId;
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function TableOfContents({ activeId }: { activeId: string }) {
  return (
    <nav className="space-y-1">
      <p
        className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        On this page
      </p>
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className={`cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
            activeId === s.id
              ? "bg-orange-50 text-orange-700 font-semibold border border-orange-200"
              : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
          }`}
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          <s.icon className="h-4 w-4 shrink-0" />
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-sm font-bold shrink-0"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          {number}
        </div>
        <div className="w-px flex-1 bg-stone-200 mt-2"></div>
      </div>
      <div className="pb-8">
        <h4
          className="font-semibold text-stone-800 mb-2"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          {title}
        </h4>
        <div
          className="text-stone-500 text-sm leading-relaxed space-y-2"
          style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-2xl font-bold text-stone-800">{title}</h3>
      </div>
      <p
        className="text-stone-500 leading-relaxed"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="px-1.5 py-0.5 text-xs bg-stone-100 border border-stone-200 rounded font-mono text-stone-600"
    >
      {children}
    </kbd>
  );
}

export function GuideContent() {
  const activeId = useActiveSection();

  return (
    <div className="max-w-7xl mx-auto px-6 pt-12 pb-24">
      {/* Mobile TOC */}
      <div className="lg:hidden mb-8 overflow-x-auto">
        <div className="flex gap-2 pb-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`cursor-pointer whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-colors ${
                activeId === s.id
                  ? "bg-orange-500 text-white font-semibold"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              <s.icon className="h-3 w-3" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-12">
        {/* Sticky TOC (desktop) */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24">
            <TableOfContents activeId={activeId} />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-16">
          {/* Getting Started */}
          <section id="getting-started">
            <SectionHeader
              icon={Rocket}
              title="Getting Started"
              subtitle="From zero to your first AI conversation in under 2 minutes."
            />
            <div className="paper-card p-6" style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}>
              <Step number={1} title="Create an account">
                <p>
                  Click <strong>Get Started</strong> on the homepage. Sign up with your email or use Google / GitHub OAuth.
                </p>
              </Step>
              <Step number={2} title="Enter the Canvas workspace">
                <p>
                  After signing in you'll land on the Canvas dashboard. This is your home base for all canvases.
                </p>
              </Step>
              <Step number={3} title="Start your first conversation">
                <p>
                  Click <strong>New Canvas</strong> and choose one of the three modes — you're ready to go!
                </p>
              </Step>
            </div>
          </section>

          {/* Create a Canvas */}
          <section id="create-canvas">
            <SectionHeader
              icon={LayoutGrid}
              title="Create a Canvas"
              subtitle="Three ways to begin, each tailored to a different workflow."
            />
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                {
                  title: "Blank Canvas",
                  desc: "Start with an empty spatial workspace. Ideal for brainstorming sessions where you want full freedom.",
                  color: "bg-stone-100 border-stone-200 text-stone-600",
                },
                {
                  title: "Ask a Question",
                  desc: "Jump straight into a conversation with AI. Your question becomes the root node of a new canvas.",
                  color: "bg-orange-50 border-orange-200 text-orange-600",
                },
                {
                  title: "Begin with Resources",
                  desc: "Upload documents or paste links to give the AI context before your first interaction.",
                  color: "bg-amber-50 border-amber-200 text-amber-700",
                },
              ].map((mode) => (
                <div
                  key={mode.title}
                  className="paper-card paper-card-hover p-5 group relative overflow-hidden"
                  style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <div className="relative z-10">
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border mb-3 ${mode.color}`}
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                      <ChevronRight className="h-3 w-3" />
                      {mode.title}
                    </div>
                    <p
                      className="text-stone-500 text-sm leading-relaxed"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                      {mode.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Branching */}
          <section id="branching">
            <SectionHeader
              icon={GitBranch}
              title="Context Branching"
              subtitle="The core superpower — fork any conversation node to explore parallel paths."
            />
            <div className="paper-card p-6 space-y-6" style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}>
              <div>
                <h4
                  className="font-semibold text-stone-800 mb-2"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  How it works
                </h4>
                <ul
                  className="space-y-2 text-sm text-stone-500 leading-relaxed"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 mt-1">•</span>
                    Every message in a canvas is a <strong>node</strong>. Nodes form a tree structure — each child inherits the full context of its ancestors.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 mt-1">•</span>
                    Click the <strong>branch</strong> button on any node to create a fork. The new branch starts with all prior context intact.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-orange-500 mt-1">•</span>
                    Explore multiple "what-if" scenarios simultaneously without losing your original thread.
                  </li>
                </ul>
              </div>
              <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200/60">
                <p
                  className="text-sm text-orange-800 font-medium"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Pro tip: Use branching for A/B comparisons — ask the same question with different prompts to see how the AI responds differently.
                </p>
              </div>
            </div>
          </section>

          {/* Spatial Navigation */}
          <section id="spatial-navigation">
            <SectionHeader
              icon={Move}
              title="Spatial Navigation"
              subtitle="Your canvas is an infinite 2D workspace. Navigate it like a map."
            />
            <div className="paper-card p-6" style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}>
              <div className="grid sm:grid-cols-2 gap-6">
                {[
                  {
                    action: "Pan",
                    shortcut: "Click + Drag",
                    desc: "Hold down the mouse button on the background and drag to move around the canvas.",
                  },
                  {
                    action: "Zoom",
                    shortcut: "Scroll / Pinch",
                    desc: "Use the mouse wheel or trackpad pinch gesture to zoom in and out.",
                  },
                  {
                    action: "Fit View",
                    shortcut: "Double-click background",
                    desc: "Double-click the canvas background to auto-fit all nodes into view.",
                  },
                  {
                    action: "Select Node",
                    shortcut: "Click node",
                    desc: "Click any node to select it, view its content, and see available actions.",
                  },
                ].map((item) => (
                  <div key={item.action}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4
                        className="font-semibold text-stone-800 text-sm"
                        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                      >
                        {item.action}
                      </h4>
                      <Kbd>{item.shortcut}</Kbd>
                    </div>
                    <p
                      className="text-stone-500 text-sm leading-relaxed"
                      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                    >
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Export */}
          <section id="export">
            <SectionHeader
              icon={Download}
              title="Export Your Work"
              subtitle="Turn your canvas into portable documents for sharing and archiving."
            />

            {/* How to export — step-by-step */}
            <div className="paper-card p-6 mb-6" style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}>
              <Step number={1} title="Open the export menu">
                <p>
                  Click the <strong>Export</strong> button in the top-right toolbar of any canvas. You'll see a list of available formats.
                </p>
              </Step>
              <Step number={2} title="Choose a format">
                <p>
                  Select <strong>Markdown</strong> for human-readable documents or <strong>JSON</strong> for structured data. Each format preserves the full conversation tree.
                </p>
              </Step>
              <Step number={3} title="Download or copy">
                <p>
                  Your file will be generated instantly. You can download it directly or copy the content to your clipboard for pasting into other tools.
                </p>
              </Step>
            </div>

            {/* Format cards */}
            <div className="grid sm:grid-cols-2 gap-4 mb-6">
              <div
                className="paper-card p-5"
                style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}
              >
                <div
                  className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Markdown
                </div>
                <p
                  className="text-stone-500 text-sm leading-relaxed"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Export the entire conversation tree as a structured Markdown file. Great for documentation, blog posts, or pasting into other tools.
                </p>
              </div>
              <div
                className="paper-card p-5"
                style={{ boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)" }}
              >
                <div
                  className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  JSON
                </div>
                <p
                  className="text-stone-500 text-sm leading-relaxed"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  Download the full canvas data as JSON — nodes, edges, metadata, and content. Perfect for backups or programmatic analysis.
                </p>
              </div>
            </div>

            {/* Pro tip */}
            <div className="p-4 bg-orange-50/50 rounded-xl border border-orange-200/60">
              <p
                className="text-sm text-orange-800 font-medium"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Pro tip: Use JSON export to create backups of important canvases. You can re-import JSON files later to restore your entire workspace, including all branches and context history.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
