import type { Metadata } from "next";
import Link from "next/link";
import { AUDIT_RETENTION_DAYS } from "@/lib/audit";
import { LegalPage, LegalSection, OperatorContactText } from "@/features/legal/legal-page";

// Keep in step with docs/threat-model.md ("What the server sees"), README's
// security table and the landing page's "What the server can see" note.

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What KeyCrypt stores, what it never sees, and how to delete your account.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      label="Privacy"
      title="Privacy policy"
      updated="10 November 2026"
      intro={
        <p>
          KeyCrypt is a zero-knowledge password manager: your vault is encrypted and decrypted in
          your browser, and the server stores it only as ciphertext. This page lists everything the
          server stores or sees, and what it never receives. This KeyCrypt instance is run by{" "}
          <OperatorContactText />.
        </p>
      }
    >
      <LegalSection n="01" title="What the server never receives">
        <ul>
          <li>
            Your <strong>master password</strong>. It never leaves your browser, not even hashed.
          </li>
          <li>
            Your <strong>vault key</strong> and your <strong>recovery key</strong>.
          </li>
          <li>
            Your <strong>decrypted data</strong>: item names, usernames, passwords, URLs, notes, API
            keys, Wi-Fi passwords, authenticator (TOTP) secrets and folder names. All of these are
            encrypted in your browser with AES-256-GCM before they are uploaded.
          </li>
        </ul>
      </LegalSection>

      <LegalSection n="02" title="What the server stores">
        <ul>
          <li>
            <strong>Your account:</strong> your email address and name, and an Argon2id hash of your
            account password. The account password itself reaches the server only while you sign up,
            sign in, reset it or confirm it, and is not stored.
          </li>
          <li>
            <strong>Your vault, as ciphertext:</strong> the encrypted contents and names of your
            items and folders with their random IVs, plus the vault&apos;s salt, key-derivation
            settings, wrapped vault key (a second copy if you created a recovery key) and a
            verification blob.
          </li>
          <li>
            <strong>Plain-text metadata:</strong> each item&apos;s type (for example &ldquo;a
            login&rdquo;), whether it is a favourite, which folder it is in (not the folder&apos;s
            name), and when it was created and last updated. From the ciphertext the server can also
            tell how many items you have and roughly how large each one is.
          </li>
          <li>
            <strong>Two-factor sign-in</strong> (if you turn it on): your authenticator secret,
            encrypted with a key the server holds, and hashes of your backup codes.
          </li>
          <li>
            <strong>An activity log</strong> of account events (for example sign-ins, item changes,
            exports) with the time, your <strong>IP address</strong> and your{" "}
            <strong>browser</strong> (user agent), the item type when an item is created and the
            format of an export. It is kept for <strong>{AUDIT_RETENTION_DAYS} days</strong> and you
            can see it under Settings → Recent activity.
          </li>
          <li>
            <strong>Rate-limit keys:</strong> IP addresses, email addresses and account ids are used
            to count sign-in, sign-up, password-reset and confirmation attempts, and are kept only
            for the length of each limit&apos;s window (at most an hour).
          </li>
          <li>
            <strong>Sessions and logs:</strong> a session cookie while you are signed in, normal
            request logs kept by the hosting infrastructure, and one line per failed server request
            (the route, an error name and a message with emails, tokens and ciphertext redacted;
            never request bodies, cookies or form data).
          </li>
        </ul>
      </LegalSection>

      <LegalSection n="03" title="Breached-password check">
        <p>
          The &ldquo;Check for breached passwords&rdquo; button in vault health is{" "}
          <strong>opt-in</strong>. When you use it, your browser asks{" "}
          <a
            href="https://haveibeenpwned.com/Passwords"
            className="text-foreground underline underline-offset-4"
          >
            Have I Been Pwned
          </a>{" "}
          directly, using k-anonymity: each password is hashed with SHA-1 in your browser and only
          the first 5 characters of the hash are sent. Have I Been Pwned sees those prefixes and
          your IP address; your passwords and their full hashes never leave your browser, and
          KeyCrypt&apos;s server is not involved.
        </p>
      </LegalSection>

      <LegalSection n="04" title="No analytics, no ads">
        <p>
          KeyCrypt has no analytics, no advertising and no third-party trackers, and it doesn&apos;t
          sell or share your data. The only cookies are the ones needed to keep you signed in and to
          confirm sensitive actions. Your theme choice is stored in your browser. Errors that happen
          in your browser are never reported anywhere, since they could contain decrypted data.
          Emails (address verification and password resets) are sent through the operator&apos;s
          email provider, which sees your email address.
        </p>
      </LegalSection>

      <LegalSection n="05" title="Exporting and deleting your data">
        <p>
          You can export your vault at any time from Settings → Export, as an encrypted file or a
          plain CSV. You can <strong>delete your account</strong> from Settings: this immediately
          and permanently deletes your account, your vault and folders, your activity log and any
          pending email links. It can&apos;t be undone. Database backups kept by the operator may
          still contain your data until they are replaced; your vault stays encrypted in them.
        </p>
      </LegalSection>

      <LegalSection n="06" title="Contact and changes">
        <p>
          Questions about your data go to <OperatorContactText />. Security issues can be reported
          as described in the{" "}
          <a
            href="https://github.com/kanishksharma04/KeyCrypt/blob/main/SECURITY.md"
            className="text-foreground underline underline-offset-4"
          >
            security policy
          </a>
          . If this policy changes, the date above changes with it. The technical details are in the{" "}
          <a
            href="https://github.com/kanishksharma04/KeyCrypt/blob/main/docs/threat-model.md"
            className="text-foreground underline underline-offset-4"
          >
            threat model
          </a>
          ; see also the <Link href="/terms">terms of use</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
