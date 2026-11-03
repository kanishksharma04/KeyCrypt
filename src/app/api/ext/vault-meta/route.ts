import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, unauthorized } from "../respond";

// GET /api/ext/vault-meta: what the browser extension needs to unlock the vault
// locally (salt, KDF parameters, wrapped vault key, verifier) plus the user id
// for the items' AAD. Authenticated by the existing session cookie.

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session) return unauthorized();
  const userId = session.user.id;

  const meta = await db.vaultMeta.findUnique({
    where: { userId },
    select: {
      cryptoVersion: true,
      kdf: true,
      kdfParams: true,
      salt: true,
      verificationBlob: true,
      verificationIv: true,
      wrappedVaultKey: true,
      wrapIv: true,
    },
  });
  if (!meta) return json({ error: "No vault yet" }, 404);

  return json({ userId, ...meta });
}
