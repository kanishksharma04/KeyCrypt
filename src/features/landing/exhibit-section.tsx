import { cn } from "@/lib/utils";
import { RECORD } from "./content";
import { DISPLAY, MONO, WRAP } from "./styles";

/** Fig. 1 — a VaultItem row, printed as the database keeps it. */
export function ExhibitSection() {
  return (
    <section id="exhibit" className="bg-muted border-foreground scroll-mt-20 border-y">
      <figure className={cn(WRAP, "grid gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:gap-x-10")}>
        <figcaption className="lg:col-span-4">
          <p className={cn(MONO, "text-brand-deep")}>Fig. 1</p>
          <p
            className={cn(
              DISPLAY,
              "mt-3 text-[clamp(28px,3vw,38px)] leading-[1.05] font-[460] tracking-[-0.02em]"
            )}
          >
            A login called &ldquo;GitHub&rdquo;, exactly as our database keeps it.
          </p>
          <p className="text-muted-foreground mt-5 text-[15px] leading-relaxed">
            The name, username, password and notes are sealed into one ciphertext in your browser.
            The rest is the bookkeeping a server needs to sort and sync. Values here are
            illustrative; the shape is real.
          </p>
        </figcaption>

        <div className="min-w-0 lg:col-span-8">
          <div className="bg-background border-foreground border shadow-[6px_6px_0_0_var(--foreground)]">
            <div
              className={cn(
                MONO,
                "text-faint border-foreground flex items-center justify-between border-b px-4 py-2.5"
              )}
            >
              <span>table · VaultItem</span>
              <span>1 row</span>
            </div>
            <dl className="font-plex divide-y divide-dashed px-4 text-[13px] sm:text-[13.5px]">
              {RECORD.map(({ key, value, note, secret }) => (
                <div
                  key={key}
                  className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 py-2.5 sm:grid-cols-[7.5rem_minmax(0,1fr)] md:grid-cols-[7.5rem_minmax(0,1fr)_15.5rem]"
                >
                  <dt className="text-faint">{key}</dt>
                  <dd className={cn("truncate", secret ? "text-brand-deep" : "text-foreground")}>
                    {value}
                  </dd>
                  {note && (
                    <dd className="text-muted-foreground col-start-2 text-[11.5px] md:col-start-auto md:text-right">
                      ← {note}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        </div>
      </figure>
    </section>
  );
}
