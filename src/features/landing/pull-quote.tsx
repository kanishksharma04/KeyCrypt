import { cn } from "@/lib/utils";
import { DISPLAY, WRAP } from "./styles";

export function PullQuote() {
  return (
    <section className="border-foreground border-y">
      <blockquote className={cn(WRAP, "py-16 sm:py-24")}>
        <p
          className={cn(
            DISPLAY,
            "max-w-5xl text-[clamp(30px,4.6vw,64px)] leading-[1.05] font-[380] tracking-[-0.025em] italic"
          )}
        >
          <span className="text-brand-deep">“</span>No vendor can promise a vault is unbreakable.
          Ours is a narrower promise, and you can check it.
          <span className="text-brand-deep">”</span>
        </p>
      </blockquote>
    </section>
  );
}
