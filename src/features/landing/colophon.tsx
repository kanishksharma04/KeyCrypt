import { cn } from "@/lib/utils";
import { ExternalLink, Wordmark } from "./primitives";
import { MONO, REPO, WRAP } from "./styles";

/** The page footer. */
export function Colophon() {
  return (
    <footer className={cn(WRAP, "pt-14 pb-10")}>
      <div className="border-foreground grid gap-10 border-t-[3px] border-double pt-10 sm:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Wordmark />
          <p className="text-muted-foreground mt-4 max-w-xs text-sm leading-relaxed">
            A zero-knowledge password manager. Encrypted in your browser, on your terms.
          </p>
        </div>

        <div className="lg:col-span-2">
          <p className={cn(MONO, "text-faint mb-4")}>Product</p>
          <ul className="space-y-2.5 text-sm">
            <li>
              <a href="#contents" className="hover:text-brand-deep transition-colors">
                Contents
              </a>
            </li>
            <li>
              <a href="#security" className="hover:text-brand-deep transition-colors">
                Security
              </a>
            </li>
            <li>
              <ExternalLink href={`${REPO}/tree/main/extension`}>Browser extension</ExternalLink>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-2">
          <p className={cn(MONO, "text-faint mb-4")}>Resources</p>
          <ul className="space-y-2.5 text-sm">
            <li>
              <ExternalLink href={`${REPO}#readme`}>Documentation</ExternalLink>
            </li>
            <li>
              <ExternalLink href={`${REPO}/blob/main/docs/threat-model.md`}>
                Threat model
              </ExternalLink>
            </li>
            <li>
              <ExternalLink href={REPO}>Source on GitHub</ExternalLink>
            </li>
          </ul>
        </div>

        <div className="lg:col-span-3">
          <p className={cn(MONO, "text-faint mb-4")}>Colophon</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Set in Fraunces and IBM Plex Mono. Built on Next.js, Argon2id and AES-256-GCM.
          </p>
        </div>
      </div>

      <div
        className={cn(MONO, "text-faint mt-12 flex flex-wrap justify-between gap-3 border-t pt-5")}
      >
        <span>© {new Date().getFullYear()} KeyCrypt · Open source, MIT</span>
        {/* Vulnerability disclosure (RFC 9116). */}
        <span className="flex gap-4">
          <ExternalLink href={`${REPO}/blob/main/SECURITY.md`}>Security policy</ExternalLink>
          <a href="/.well-known/security.txt" className="hover:text-brand-deep transition-colors">
            security.txt
          </a>
        </span>
      </div>
    </footer>
  );
}
