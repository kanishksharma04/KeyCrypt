"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireRecentReauth } from "@/lib/reauth";
import type { ExportFormat } from "@/lib/vault-export";
import type { VaultItemRow } from "@/types/vault";
import { INVALID_INPUT, recordVaultExportInput } from "@/schemas/server";

// Settings → Export. The export itself is built in the browser (decrypt with
// the vault key, then encrypt under an export password, or write a CSV); the
// server only hands over ciphertext and records that an export happened.

/** Every item of the signed-in user, as ciphertext, for a full export. */
export async function getVaultItemsForExportAction(): Promise<VaultItemRow[] | { error: string }> {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const rows = await db.vaultItem.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      type: true,
      name: true,
      ciphertext: true,
      iv: true,
      favorite: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Called before a download is offered. Writes the "vault.export" audit entry
 * (format only). A plain-text CSV export additionally needs a recent
 * account-password confirmation.
 *
 * Note: the browser already holds the decrypted vault, so this cannot stop a
 * determined attacker who controls the unlocked page; it makes the plain export
 * a deliberate, confirmed and logged step.
 */
export async function recordVaultExportAction(format: ExportFormat): Promise<{ error?: string }> {
  const parsed = recordVaultExportInput.safeParse({ format });
  if (!parsed.success) return { error: INVALID_INPUT };

  const session = await auth();
  if (!session) return { error: "Not authenticated" };
  const userId = session.user.id;

  if (parsed.data.format === "csv") {
    const reauth = await requireRecentReauth(userId);
    if (!reauth.ok) return { error: reauth.error };
  }

  await db.auditLog.create({
    data: { userId, action: "vault.export", metadata: { format: parsed.data.format } },
  });
  return {};
}
