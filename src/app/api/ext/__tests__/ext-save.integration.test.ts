import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST as postItem } from "@/app/api/ext/items/route";
import { MAX_VAULT_ITEMS } from "@/schemas/server";
import { createTestUser, signInAs, signOutTestUser } from "@/test/integration/helpers";

// POST /api/ext/items: the extension saves a login it encrypted itself.

const CIPHER = { ciphertext: "Y2lwaGVydGV4dA==", iv: "aXYtaXYtaXYtaXYt" };
const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

function post(body: unknown, headers: Record<string, string> = {}) {
  return postItem(
    new Request("http://localhost/api/ext/items", {
      method: "POST",
      headers: { "content-type": "application/json", origin: EXTENSION_ORIGIN, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

let alice: TestUser;

beforeEach(async () => {
  alice = await createTestUser({ email: "alice@test.local" });
  signInAs(alice);
});

describe("POST /api/ext/items", () => {
  it("stores the ciphertext for the session user and records the event", async () => {
    const id = randomUUID();
    const res = await post({ id, type: "LOGIN", ...CIPHER });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id });

    expect(await db.vaultItem.findUniqueOrThrow({ where: { id } })).toMatchObject({
      userId: alice.id,
      type: "LOGIN",
      name: null,
      ...CIPHER,
      deletedAt: null,
    });
    expect(
      await db.auditLog.findFirstOrThrow({ where: { action: "vault.item.create" } })
    ).toMatchObject({ userId: alice.id, metadata: { type: "LOGIN", source: "extension" } });
  });

  it("requires a session", async () => {
    signOutTestUser();
    const res = await post({ id: randomUUID(), type: "LOGIN", ...CIPHER });
    expect(res.status).toBe(401);
    expect(await db.vaultItem.count()).toBe(0);
  });

  it("validates the body without echoing it", async () => {
    for (const body of [
      "not json",
      {},
      { id: "not-an-id", type: "LOGIN", ...CIPHER },
      { id: randomUUID(), type: "SECURE_NOTE", ...CIPHER }, // logins only
      { id: randomUUID(), type: "LOGIN", ...CIPHER, userId: "someone-else" }, // strict
      { id: randomUUID(), type: "LOGIN", ciphertext: "<script>", iv: CIPHER.iv },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid input" });
    }
    expect(await db.vaultItem.count()).toBe(0);
  });

  it("refuses cross-site writers: a web page's Origin, or a non-JSON body", async () => {
    const body = { id: randomUUID(), type: "LOGIN", ...CIPHER };
    expect((await post(body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post(body, { "content-type": "text/plain" })).status).toBe(403);
    expect((await post(body, { "content-type": "application/x-www-form-urlencoded" })).status).toBe(
      403
    );
    expect(await db.vaultItem.count()).toBe(0);
    // Same-origin and extension callers are fine.
    expect((await post(body, { origin: "http://localhost" })).status).toBe(201);
  });

  it("never overwrites an existing item, whoever owns it", async () => {
    const bob = await createTestUser({ email: "bob@test.local" });
    const { id } = await db.vaultItem.create({
      data: { userId: bob.id, type: "LOGIN", ...CIPHER },
      select: { id: true },
    });
    const res = await post({ id, type: "LOGIN", ciphertext: "b3RoZXI=", iv: CIPHER.iv });
    expect(res.status).toBe(409);
    expect(await db.vaultItem.findUniqueOrThrow({ where: { id } })).toMatchObject({
      userId: bob.id,
      ...CIPHER,
    });
  });

  it("enforces the item cap, Trash included", async () => {
    await db.vaultItem.createMany({
      data: Array.from({ length: MAX_VAULT_ITEMS }, (_, i) => ({
        userId: alice.id,
        type: "SECURE_NOTE" as const,
        ...CIPHER,
        deletedAt: i === 0 ? new Date() : null,
      })),
    });
    const res = await post({ id: randomUUID(), type: "LOGIN", ...CIPHER });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: `A vault can hold up to ${MAX_VAULT_ITEMS.toLocaleString("en")} items.`,
    });
  });
});
