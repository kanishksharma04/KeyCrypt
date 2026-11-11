import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { ITEM_CAP_ERROR, wouldExceedItemCap } from "@/lib/item-cap";
import { extCreateItemInput, extItemsQuery } from "@/schemas/server";
import { invalidInput, json, unauthorized } from "../respond";

// GET /api/ext/items[?type=LOGIN]: the session user's items as ciphertext, for
// the browser extension to decrypt locally. Names and URLs are inside the
// ciphertext, so matching items to the current site happens in the extension.
//
// POST /api/ext/items: save a login the extension encrypted (ciphertext only).

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = extItemsQuery.strict().safeParse(params);
  if (!parsed.success) return invalidInput();

  const session = await auth();
  if (!session) return unauthorized();

  const items = await db.vaultItem.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null, // never offer items in Trash
      ...(parsed.data.type && { type: parsed.data.type }),
    },
    select: { id: true, type: true, name: true, ciphertext: true, iv: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return json({ items });
}

/**
 * Only the extension (or a same-origin caller) may write. A web page could try
 * a cross-site POST with the user's cookies: it can't send a JSON content type
 * or a foreign Origin without a CORS preflight, which this API never answers,
 * and requests that carry a web page's Origin are refused outright.
 */
function isAllowedWriter(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return true;
  if (/^(chrome|moz)-extension:\/\//.test(origin)) return true;
  return origin === new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedWriter(request)) return json({ error: "Forbidden" }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidInput();
  }
  const parsed = extCreateItemInput.safeParse(body);
  if (!parsed.success) return invalidInput();
  const data = parsed.data;

  const session = await auth();
  if (!session) return unauthorized();
  const userId = session.user.id;

  if (await wouldExceedItemCap(userId, 1)) return json({ error: ITEM_CAP_ERROR }, 409);

  try {
    await db.vaultItem.create({
      data: {
        id: data.id,
        userId,
        type: data.type,
        name: null, // encrypted inside the ciphertext
        ciphertext: data.ciphertext,
        iv: data.iv,
      },
    });
  } catch (err) {
    // The id comes from the extension: never overwrite an existing item.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return json({ error: "An item with this id already exists." }, 409);
    }
    throw err;
  }

  await logAudit(userId, "vault.item.create", { type: data.type, source: "extension" });
  return json({ id: data.id }, 201);
}
