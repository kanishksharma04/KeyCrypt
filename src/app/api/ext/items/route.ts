import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { extItemsQuery } from "@/schemas/server";
import { invalidInput, json, unauthorized } from "../respond";

// GET /api/ext/items[?type=LOGIN]: the session user's items as ciphertext, for
// the browser extension to decrypt locally. Names and URLs are inside the
// ciphertext, so matching items to the current site happens in the extension.

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = extItemsQuery.strict().safeParse(params);
  if (!parsed.success) return invalidInput();

  const session = await auth();
  if (!session) return unauthorized();

  const items = await db.vaultItem.findMany({
    where: { userId: session.user.id, ...(parsed.data.type && { type: parsed.data.type }) },
    select: { id: true, type: true, name: true, ciphertext: true, iv: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return json({ items });
}
