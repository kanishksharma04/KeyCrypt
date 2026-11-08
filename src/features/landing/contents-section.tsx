import { cn } from "@/lib/utils";
import { CONTENTS } from "./content";
import { SectionLabel } from "./primitives";
import { DISPLAY, MONO, WRAP } from "./styles";

/** § 03 — what a vault can hold. */
export function ContentsSection() {
  return (
    <section id="contents" className="bg-muted border-foreground scroll-mt-20 border-y">
      <div className={cn(WRAP, "grid gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:gap-x-10")}>
        <div className="lg:col-span-4">
          <SectionLabel n="03" title="Contents">
            One place for every secret you hold.
          </SectionLabel>
        </div>

        <ol className="border-foreground border-t lg:col-span-8">
          {CONTENTS.map(({ title, short, body }, i) => (
            <li key={title} className="group border-b py-5">
              <div className="flex items-baseline gap-3">
                <span className="font-plex text-faint w-7 shrink-0 text-xs">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3
                  className={cn(
                    DISPLAY,
                    "group-hover:text-brand-deep text-[22px] font-[500] tracking-[-0.015em] transition-colors sm:text-[26px]"
                  )}
                >
                  {title}
                </h3>
                <span
                  aria-hidden="true"
                  className="border-foreground/30 mb-1.5 hidden flex-1 border-b border-dotted sm:block"
                />
                <span className={cn(MONO, "text-muted-foreground hidden sm:inline")}>{short}</span>
              </div>
              <p className="text-muted-foreground mt-1.5 pl-10 text-[14.5px] leading-relaxed">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
