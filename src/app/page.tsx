import { auth } from "@/lib/auth";
import { BackCover } from "@/features/landing/back-cover";
import { Colophon } from "@/features/landing/colophon";
import { ContentsSection } from "@/features/landing/contents-section";
import { ExhibitSection } from "@/features/landing/exhibit-section";
import { HowItWorksSection } from "@/features/landing/how-it-works-section";
import { Masthead } from "@/features/landing/masthead";
import { PremiseSection } from "@/features/landing/premise-section";
import { PullQuote } from "@/features/landing/pull-quote";
import { ServerSeesSection } from "@/features/landing/server-sees-section";
import { GRAIN } from "@/features/landing/styles";

// The landing page, laid out like a technical journal: a masthead, numbered
// sections, margin notes and a printed exhibit of what the database stores.
// Always in the light palette (`.theme-light` in globals.css). Each section
// lives in src/features/landing.

export default async function HomePage() {
  const session = await auth();
  const signedIn = !!session;
  const cta = signedIn
    ? { href: "/vault", label: "Open your vault" }
    : { href: "/auth/signup", label: "Start your vault" };

  return (
    <div className="theme-light bg-background text-foreground relative flex min-h-dvh flex-col selection:bg-[#f1e6d7]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.07] mix-blend-multiply"
        style={{ backgroundImage: GRAIN }}
      />

      <Masthead signedIn={signedIn} />

      <main className="flex-1">
        <PremiseSection cta={cta} />
        <ExhibitSection />
        <HowItWorksSection />
        <PullQuote />
        <ServerSeesSection />
        <ContentsSection />
        <BackCover signedIn={signedIn} cta={cta} />
      </main>

      <Colophon />
    </div>
  );
}
