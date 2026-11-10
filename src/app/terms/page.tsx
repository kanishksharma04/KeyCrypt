import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, OperatorContactText } from "@/features/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using this KeyCrypt instance.",
};

export default function TermsPage() {
  return (
    <LegalPage
      label="Terms"
      title="Terms of use"
      updated="10 November 2026"
      intro={
        <p>
          These terms apply to this KeyCrypt instance, run by <OperatorContactText />. By creating
          an account you agree to them and to the <Link href="/privacy">privacy policy</Link>.
        </p>
      }
    >
      <LegalSection n="01" title="Your master password and recovery key">
        <p>
          Your vault is encrypted in your browser with a key that only your{" "}
          <strong>master password</strong> or your <strong>recovery key</strong> can unlock. Nobody
          else has either of them: not the operator, not the KeyCrypt project.
        </p>
        <ul>
          <li>You are responsible for choosing a strong master password and keeping it safe.</li>
          <li>You are responsible for keeping your recovery key safe, if you create one.</li>
          <li>
            <strong>
              If you lose both your master password and your recovery key, your vault can&apos;t be
              decrypted or recovered by anyone.
            </strong>{" "}
            Resetting your account password doesn&apos;t give access to it.
          </li>
        </ul>
        <p>Keep encrypted exports (Settings → Export) as your own backup.</p>
      </LegalSection>

      <LegalSection n="02" title="Provided as is">
        <p>
          KeyCrypt is open-source software under the{" "}
          <a
            href="https://github.com/kanishksharma04/KeyCrypt/blob/main/LICENSE"
            className="text-foreground underline underline-offset-4"
          >
            MIT license
          </a>
          . The software and this service are provided <strong>&ldquo;as is&rdquo;</strong>, without
          warranty of any kind, express or implied, including the warranties of merchantability,
          fitness for a particular purpose and non-infringement. The service may be unavailable,
          change or stop, and data may be lost.
        </p>
        <p>
          In no event shall the authors, copyright holders or the operator be liable for any claim,
          damages or other liability arising from, out of or in connection with the software or the
          service, or its use.
        </p>
      </LegalSection>

      <LegalSection n="03" title="Acceptable use">
        <ul>
          <li>Use the service only for your own data and only lawfully.</li>
          <li>
            Don&apos;t try to access other people&apos;s accounts, disrupt the service, or get
            around its rate limits or security controls.
          </li>
          <li>
            Report security issues as described in the{" "}
            <a
              href="https://github.com/kanishksharma04/KeyCrypt/blob/main/SECURITY.md"
              className="text-foreground underline underline-offset-4"
            >
              security policy
            </a>
            , and test only against your own account or your own instance.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n="04" title="Ending your account">
        <p>
          You can delete your account at any time from Settings; this permanently deletes your vault
          (see the <Link href="/privacy">privacy policy</Link>). The operator may suspend or close
          accounts that break these terms, or stop running the service.
        </p>
      </LegalSection>

      <LegalSection n="05" title="Contact and changes">
        <p>
          Questions about these terms go to <OperatorContactText />. If they change, the date above
          changes with it.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
