import Link from "next/link";
import { cn } from "@/lib/utils";
import { MARGIN_NOTES } from "./content";
import { ArrowRight } from "./primitives";
import { type Cta, DISPLAY, INK_BUTTON, MONO, WRAP } from "./styles";

const FACTS = [
  ["Cipher", "AES-256-GCM"],
  ["Key derivation", "Argon2id"],
  ["Plaintext secrets stored", "0"],
] as const;

/** § 00 — the headline, margin notes, opening paragraph and the main call to action. */
export function PremiseSection({ cta }: { cta: Cta }) {
  return (
    <section className={cn(WRAP, "pt-12 pb-16 sm:pt-16 lg:pt-20")}>
      <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-10">
        <div className="lg:col-span-9">
          <p className={cn(MONO, "text-brand-deep")}>§ 00 — The premise</p>
          <h1
            className={cn(
              DISPLAY,
              "mt-6 text-[clamp(52px,9.4vw,150px)] leading-[0.9] font-[440] tracking-[-0.045em]"
            )}
          >
            Your passwords are{" "}
            <em className="text-brand-deep font-[380] [font-variation-settings:'SOFT'_100,'WONK'_1]">
              none of our business.
            </em>
          </h1>
        </div>

        <ol className="border-foreground/80 self-end border-t pt-4 lg:col-span-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          {MARGIN_NOTES.map((note, i) => (
            <li
              key={note}
              className="text-muted-foreground flex gap-3 py-2 text-[13.5px] leading-snug"
            >
              <sup className="font-plex text-brand-deep mt-2 text-[10px]">{i + 1}</sup>
              {note}
            </li>
          ))}
        </ol>
      </div>

      <div className="border-foreground mt-14 grid gap-10 border-t pt-8 lg:grid-cols-12 lg:gap-x-10">
        <p className="first-letter:text-brand-deep font-serif text-[20px] leading-[1.5] tracking-[-0.005em] first-letter:float-left first-letter:mt-1.5 first-letter:mr-3 first-letter:font-serif first-letter:text-[72px] first-letter:leading-[0.8] first-letter:font-semibold lg:col-span-6">
          Every vault is encrypted and decrypted on your own device. KeyCrypt&apos;s servers hold
          ciphertext, wrapped keys and a handful of plain-text housekeeping fields, and nothing that
          would let anyone, including us, read what you keep there.
        </p>

        <div className="flex flex-col items-start gap-4 lg:col-span-3">
          <Link href={cta.href} className={INK_BUTTON}>
            {cta.label}
            <ArrowRight />
          </Link>
          <a
            href="#exhibit"
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 transition-colors"
          >
            See what we actually store ↓
          </a>
        </div>

        <dl className="font-plex divide-y self-start border-y text-[12.5px] lg:col-span-3">
          {FACTS.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5">
              <dt className="text-faint">{k}</dt>
              <dd className="text-foreground text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
