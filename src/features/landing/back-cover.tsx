import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowRight } from "./primitives";
import { type Cta, DISPLAY, WRAP } from "./styles";

/** The dark closing call to action. */
export function BackCover({ signedIn, cta }: { signedIn: boolean; cta: Cta }) {
  return (
    <section className="bg-foreground text-background">
      <div className={cn(WRAP, "grid gap-10 py-20 sm:py-28 lg:grid-cols-12 lg:gap-x-10")}>
        <h2
          className={cn(
            DISPLAY,
            "text-[clamp(44px,7vw,104px)] leading-[0.92] font-[440] tracking-[-0.04em] lg:col-span-8"
          )}
        >
          {signedIn ? (
            <>
              Your vault is <em className="text-[#d59a5d]">waiting.</em>
            </>
          ) : (
            <>
              Set up your vault in <em className="text-[#d59a5d]">under a minute.</em>
            </>
          )}
        </h2>

        <div className="flex flex-col justify-end gap-6 lg:col-span-4">
          <p className="text-[16px] leading-relaxed text-[rgb(250_248_243/0.7)]">
            No credit card. No lock-in. Export your vault any time, or run the whole thing on your
            own server.
          </p>
          <Link
            href={cta.href}
            className="bg-background text-foreground hover:bg-brand-soft inline-flex w-fit items-center gap-3 px-6 py-4 text-[15px] font-semibold transition-colors"
          >
            {cta.label}
            <ArrowRight />
          </Link>
          <p className="font-plex text-[12px] break-all text-[rgb(250_248_243/0.5)]">
            $ git clone github.com/kanishksharma04/KeyCrypt
          </p>
        </div>
      </div>
    </section>
  );
}
