import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { GET as getVaultMeta } from "@/app/api/ext/vault-meta/route";
import { GET as getItems } from "@/app/api/ext/items/route";
import { createTestUser, signInAs, signOutTestUser } from "@/test/integration/helpers";

type TestUser = Awaited<ReturnType<typeof createTestUser>>;

const req = (path: string) => new Request(`http://localhost${path}`);

async function vaultFor(userId: string) {
  await db.vaultMeta.create({
    data: {
      userId,
      cryptoVersion: 2,
      kdf: "argon2id",
      kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1, hashLength: 32 },
      salt: "c2FsdHNhbHRzYWx0c2FsdA==",
      verificationBlob: "dmVyaWZpZXI=",
      verificationIv: "aXYtaXYtaXYtaXYt",
      wrappedVaultKey: "d3JhcHBlZA==",
      wrapIv: "d3JhcC1pdi1pdi1p",
      recoveryWrappedKey: "cmVjb3Zlcnk=",
      recoveryIv: "cmVjLWl2LWl2LWl2",
    },
  });
  await db.vaultItem.createMany({
    data: [
      { userId, type: "LOGIN", ciphertext: `bG9naW4t${userId.slice(-4)}`, iv: "aXYtaXYtaXYtaXYt" },
      { userId, type: "SECURE_NOTE", ciphertext: "bm90ZQ==", iv: "aXYtaXYtaXYtaXYt" },
    ],
  });
}

describe("extension API (/api/ext/*)", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    alice = await createTestUser({ email: "alice@test.local" });
    bob = await createTestUser({ email: "bob@test.local" });
    await vaultFor(alice.id);
    await vaultFor(bob.id);
  });

  it("requires a session", async () => {
    signOutTestUser();
    for (const res of [await getVaultMeta(), await getItems(req("/api/ext/items"))]) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Not authenticated" });
    }
  });

  it("returns the session user's unlock material, not the recovery copy", async () => {
    signInAs(alice);
    const res = await getVaultMeta();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({
      userId: alice.id,
      cryptoVersion: 2,
      kdf: "argon2id",
      wrappedVaultKey: "d3JhcHBlZA==",
    });
    expect(body).not.toHaveProperty("recoveryWrappedKey");
  });

  it("returns 404 before a vault exists", async () => {
    const carol = await createTestUser({ email: "carol@test.local" });
    signInAs(carol);
    expect((await getVaultMeta()).status).toBe(404);
  });

  it("lists only the session user's items (ciphertext), optionally by type", async () => {
    signInAs(alice);
    const all = await (await getItems(req("/api/ext/items"))).json();
    expect(all.items).toHaveLength(2);
    const bobIds = (await db.vaultItem.findMany({ where: { userId: bob.id } })).map((i) => i.id);
    for (const item of all.items as Array<{ id: string }>) expect(bobIds).not.toContain(item.id);

    const res = await getItems(req("/api/ext/items?type=LOGIN"));
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { items } = await res.json();
    expect(items).toEqual([
      expect.objectContaining({ type: "LOGIN", ciphertext: `bG9naW4t${alice.id.slice(-4)}` }),
    ]);
    expect(Object.keys(items[0]).sort()).toEqual([
      "ciphertext",
      "id",
      "iv",
      "name",
      "type",
      "updatedAt",
    ]);
  });

  it("rejects invalid query parameters without echoing them", async () => {
    signInAs(alice);
    for (const q of ["?type=CREDIT_CARD", "?type=LOGIN&userId=someone", "?foo=<script>"]) {
      const res = await getItems(req(`/api/ext/items${q}`));
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(JSON.stringify({ error: "Invalid input" }));
    }
  });
});
