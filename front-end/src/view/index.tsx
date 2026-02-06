import { LandingHeader } from "../ui/landing/LandingHeader";
import { HeroSection } from "../ui/landing/HeroSection";
import { FeaturesSection } from "../ui/landing/FeaturesSection";
import { EngineSection } from "../ui/landing/EngineSection";
import { Footer } from "../ui/landing/Footer";

export default function LandingPage() {
  return (
    <div className="relative antialiased overflow-x-hidden font-sans bg-cyber-dark selection:bg-cyber-neon/30 h-screen overflow-y-auto text-slate-200 CyberScroller">
      {/* Background Effects */}
      {/* 1. 新增：超大纯色底板，由它来遮挡回弹时的白边，设为 -inset-[100vh] 足够大 */}
      <div className="fixed -inset-[100vh] bg-cyber-dark -z-10 pointer-events-none"></div>

      {/* 2. 原有的光效层保持 inset-0 不变，确保光效位置在屏幕四周 */}
      <div className="fixed inset-0 bg-[image:var(--image-cyber-gradient)] opacity-80 pointer-events-none"></div>
      <div className="perspective-grid"></div>

      <LandingHeader />

      <main className="relative z-10">
        <HeroSection />
        <FeaturesSection />
        <EngineSection />
        <Footer />
      </main>
    </div>
  );
}
