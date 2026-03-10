import { BookOpen, MessageSquare } from "lucide-react";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 32 32">
      <path fillRule="evenodd" clipRule="evenodd" d="M16 0C7.16 0 0 7.16 0 16C0 23.08 4.58 29.06 10.94 31.18C11.74 31.32 12.04 30.84 12.04 30.42C12.04 30.04 12.02 28.78 12.02 27.44C8 28.18 6.96 26.46 6.64 25.56C6.46 25.1 5.68 23.68 5 23.3C4.44 23 3.64 22.26 4.98 22.24C6.24 22.22 7.14 23.4 7.44 23.88C8.88 26.3 11.18 25.62 12.1 25.2C12.24 24.16 12.66 23.46 13.12 23.06C9.56 22.66 5.84 21.28 5.84 15.16C5.84 13.42 6.46 11.98 7.48 10.86C7.32 10.46 6.76 8.82 7.64 6.62C7.64 6.62 8.98 6.2 12.04 8.26C13.32 7.9 14.68 7.72 16.04 7.72C17.4 7.72 18.76 7.9 20.04 8.26C23.1 6.18 24.44 6.62 24.44 6.62C25.32 8.82 24.76 10.46 24.6 10.86C25.62 11.98 26.24 13.4 26.24 15.16C26.24 21.3 22.5 22.66 18.94 23.06C19.52 23.56 20.02 24.52 20.02 26.02C20.02 28.16 20 29.88 20 30.42C20 30.84 20.3 31.34 21.1 31.18C27.42 29.06 32 23.06 32 16C32 7.16 24.84 0 16 0Z" />
    </svg>
  );
}

const resources = [
  {
    icon: BookOpen,
    title: "Quick Start Guide",
    description:
      "Create your first canvas in under 2 minutes. Learn branching, context flow, and spatial navigation.",
    link: "/guide",
    linkText: "Read the guide",
    iconColor: "text-orange-600",
    iconBg: "bg-orange-50",
    iconBorder: "border-orange-200",
  },
  {
    icon: GitHubIcon,
    title: "Open Source",
    description:
      "ContextCanvas is open source. Browse the code, report issues, or contribute new features.",
    link: "https://github.com/Louis-ZLH/ContextGraph",
    linkText: "View on GitHub",
    iconColor: "text-stone-700",
    iconBg: "bg-stone-100",
    iconBorder: "border-stone-200",
    external: true,
  },
  {
    icon: MessageSquare,
    title: "Contact Us",
    description:
      "Have questions or feedback? Reach out to our team — we'd love to hear from you.",
    link: "https://github.com/Louis-ZLH",
    linkText: "Get in touch",
    iconColor: "text-violet-600",
    iconBg: "bg-violet-50",
    iconBorder: "border-violet-200",
    external: true,
  },
];

export function DocsSection() {
  return (
    <section
      id="docs"
      className="py-24 relative border-t border-stone-200 bg-stone-50/50"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-stone-800">
            Learn, Build,{" "}
            <span className="text-orange-600">Contribute.</span>
          </h2>
          <p
            className="text-stone-500 max-w-xl mx-auto"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Everything you need to master ContextCanvas — from getting started
            to extending the platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {resources.map((resource) => (
            <a
              key={resource.title}
              href={resource.link}
              {...(resource.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="paper-card p-6 group relative overflow-hidden transition-transform duration-300 hover:-translate-y-1 block"
              style={{
                boxShadow: "3px 3px 0px rgba(41, 37, 36, 0.08)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-orange-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="relative z-10">
                <div
                  className={`w-11 h-11 ${resource.iconBg} rounded-xl flex items-center justify-center ${resource.iconColor} mb-5 border ${resource.iconBorder}`}
                >
                  <resource.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-stone-800 mb-2">
                  {resource.title}
                </h3>
                <p
                  className="text-stone-500 text-sm leading-relaxed mb-4"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  {resource.description}
                </p>
                <span
                  className="text-orange-600 text-sm font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-[gap]"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  {resource.linkText}
                  <span>&rarr;</span>
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
