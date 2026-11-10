// Who runs this KeyCrypt instance, for the privacy policy and terms. Set
// OPERATOR_CONTACT to an email address or an https:// URL; self-hosted
// instances without it show a neutral placeholder.

export type OperatorContact =
  | { kind: "email"; value: string; href: string }
  | { kind: "url"; value: string; href: string }
  | { kind: "text"; value: string }
  | { kind: "unset" };

const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}$/i;

export function operatorContact(
  raw: string | undefined = process.env.OPERATOR_CONTACT
): OperatorContact {
  const value = raw?.trim().slice(0, 200) ?? "";
  if (!value) return { kind: "unset" };
  if (EMAIL.test(value)) return { kind: "email", value, href: `mailto:${value}` };
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return { kind: "url", value, href: url.href };
  } catch {
    // Not a URL: shown as plain text.
  }
  return { kind: "text", value };
}
