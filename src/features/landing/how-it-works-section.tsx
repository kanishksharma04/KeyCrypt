import { cn } from "@/lib/utils";
import { STEPS } from "./content";
import { SectionLabel } from "./primitives";
import { DISPLAY, MONO, WRAP } from "./styles";

/** § 01 — the five steps from master password to ciphertext. */
export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className={cn(WRAP, "grid scroll-mt-20 gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:gap-x-10")}
    >
      <div className="lg:col-span-4">
        <SectionLabel n="01" title="How it works">
          Encryption happens before anything leaves your browser. Five steps, in order.
        </SectionLabel>
      </div>

      <ol className="border-foreground border-t lg:col-span-8">
        {STEPS.map(({ title, body, spec }, i) => (
          <li
            key={title}
            className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-b py-7 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:gap-x-6"
          >
            <span className="font-plex text-brand-deep pt-2 text-sm">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h3
                className={cn(DISPLAY, "text-[28px] leading-tight font-[480] tracking-[-0.02em]")}
              >
                {title}
              </h3>
              <p className="text-muted-foreground mt-2 max-w-md text-[15px] leading-relaxed">
                {body}
              </p>
            </div>
            <span
              className={cn(
                MONO,
                "text-faint col-start-2 mt-3 sm:col-start-auto sm:mt-0 sm:pt-3 sm:text-right"
              )}
            >
              {spec}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
