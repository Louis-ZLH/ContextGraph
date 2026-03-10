import { Check, Zap, Crown } from "lucide-react";
import { useNavigate } from "react-router";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for exploring spatial AI conversations.",
    icon: Zap,
    iconColor: "text-stone-600",
    iconBg: "bg-stone-100",
    iconBorder: "border-stone-200",
    features: [
      "3 active canvases",
      "GPT-4o mini model",
      "Basic context branching",
      "Export to Markdown",
      "Community support",
    ],
    cta: "Get Started Free",
    ctaStyle:
      "bg-white text-stone-800 border border-stone-200 hover:border-stone-300 hover:bg-stone-50",
    shadow: "3px 3px 0px rgba(41, 37, 36, 0.08)",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$12",
    period: "/month",
    description: "For power users who think in parallel.",
    icon: Crown,
    iconColor: "text-orange-600",
    iconBg: "bg-orange-50",
    iconBorder: "border-orange-200",
    features: [
      "Unlimited canvases",
      "All models (GPT-4o, Claude, Gemini)",
      "Advanced context flow",
      "Export to JSON & Markdown",
      "Priority support",
      "Canvas collaboration (coming soon)",
    ],
    cta: "Start Free Trial",
    ctaStyle:
      "bg-stone-800 text-white hover:bg-stone-700",
    shadow: "5px 5px 0px rgba(41, 37, 36, 0.12)",
  },
];

export function PricingSection() {
  const navigate = useNavigate();

  return (
    <section id="pricing" className="py-24 relative border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-stone-800">
            Simple,{" "}
            <span className="text-orange-600">Transparent Pricing.</span>
          </h2>
          <p
            className="text-stone-500 max-w-xl mx-auto"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Start free, upgrade when you need more power. No hidden fees, no
            surprise charges.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`paper-card p-8 relative overflow-hidden transition-transform duration-300 hover:-translate-y-1 flex flex-col ${
                plan.highlight ? "ring-2 ring-orange-400" : ""
              }`}
              style={{ boxShadow: plan.shadow }}
            >
              {plan.highlight && (
                <div
                  className="absolute top-0 right-0 px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-bl-lg"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  POPULAR
                </div>
              )}

              <div
                className={`w-12 h-12 ${plan.iconBg} rounded-xl flex items-center justify-center ${plan.iconColor} mb-6 border ${plan.iconBorder}`}
              >
                <plan.icon className="h-6 w-6" />
              </div>

              <h3 className="text-2xl font-bold text-stone-800 mb-1">
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold text-stone-800">
                  {plan.price}
                </span>
                <span
                  className="text-stone-400 text-sm"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                  }}
                >
                  {plan.period}
                </span>
              </div>
              <p
                className="text-stone-500 text-sm mb-8"
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                }}
              >
                {plan.description}
              </p>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-3 text-sm text-stone-600"
                    style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    <Check className="h-4 w-4 text-orange-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => navigate("/canvas")}
                className={`cursor-pointer w-full py-3 rounded-lg font-semibold text-sm transition-colors duration-300 ${plan.ctaStyle}`}
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  boxShadow: plan.shadow,
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
