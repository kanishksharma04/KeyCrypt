import { PadlockIcon } from "@/components/shared/design-icons";
import { cn } from "@/lib/utils";
import { SERVER_NEVER_SEES, SERVER_SEES } from "./content";
import { SectionLabel } from "./primitives";
import { MONO, WRAP } from "./styles";

/**
 * § 02 — "What the server can see today". Keep in sync with CLAUDE.md "Security model",
 * README's security table and docs/threat-model.md.
 */
export function ServerSeesSection() {
  return (
    <section
      id="security"
      className={cn(WRAP, "grid scroll-mt-20 gap-12 py-20 sm:py-28 lg:grid-cols-12 lg:gap-x-10")}
    >
      <div className="lg:col-span-4">
        <SectionLabel n="02" title="What the server can see">
          A short, honest list, as of today: exactly what leaves your browser in the clear.
        </SectionLabel>
      </div>

      <div className="lg:col-span-8">
        <div className="border-foreground grid border-t sm:grid-cols-2">
          <div className="sm:border-r sm:pr-8">
            <p className={cn(MONO, "text-faint border-b py-3")}>In the clear</p>
            <ul>
              {SERVER_SEES.map((item) => (
                <li key={item} className="text-muted-foreground border-b py-4 text-[15.5px]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="sm:pl-8">
            <p className={cn(MONO, "text-brand-deep border-b py-3")}>Never, in any form</p>
            <ul>
              {SERVER_NEVER_SEES.map((item) => (
                <li key={item} className="flex gap-3 border-b py-4 text-[15.5px]">
                  <PadlockIcon className="text-brand mt-0.5 size-4 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="text-faint mt-6 max-w-2xl text-[12.5px] leading-relaxed">
          <span className="text-brand-deep">*</span> Also stored: your name, and an activity log of
          account events with the IP address and browser for each, kept for 180 days. From the
          ciphertext the server can tell how many items you have and roughly how large each one is.
          The optional breached-password check talks to Have I Been Pwned from your browser and
          sends only the first 5 characters of each password&apos;s SHA-1 hash.
        </p>
      </div>
    </section>
  );
}
