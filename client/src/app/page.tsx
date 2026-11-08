import { Closing } from '@/components/landing/closing';
import { CloudDefs } from '@/components/landing/clouds';
import { ScrollEffects } from '@/components/landing/scroll-effects';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { PlansSection } from '@/components/landing/plans-section';
import { PlatformSection } from '@/components/landing/platform-section';
import { ProblemSection } from '@/components/landing/problem-section';
import { SecuritySection } from '@/components/landing/security-section';
import { SiteHeader } from '@/components/landing/site-header';

/**
 * Marketing landing page. It uses a fixed palette instead of the app theme tokens so it looks the same in light and
 * dark mode; `--accent` is overridden only so the global focus ring stays visible on the photo and navy sections.
 */
export default function LandingPage() {
  return (
    // overflow-x-clip: elements waiting to slide in from the side must never widen the page.
    <div data-arrow-stage className="relative min-h-full overflow-x-clip bg-[#08131F] font-sans text-[#F5F1E8] [--accent:#F5F1E8]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#F5F1E8] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0B1724]"
      >
        Skip to content
      </a>
      <CloudDefs />
      <ScrollEffects />
      <SiteHeader />
      <main id="main">
        <Hero />
        <ProblemSection />
        <PlatformSection />
        <HowItWorks />
        <PlansSection />
        <SecuritySection />
      </main>
      <Closing />
    </div>
  );
}
