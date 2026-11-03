import { execFileSync } from "child_process";
import { createHash, generateKeyPairSync } from "crypto";
import { resolve } from "path";

// Build a test copy of the extension and work out its id.

export const TEST_PAGE_ORIGIN = "http://127.0.0.1:4599";

/** Chrome's extension id: SHA-256 of the public key, first 16 bytes, hex digits → a–p. */
function extensionId(publicKeyDer: Buffer): string {
  return createHash("sha256")
    .update(publicKeyDer)
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
}

export default function globalSetup() {
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const der = publicKey.export({ type: "spki", format: "der" });
  const outDir = resolve(__dirname, "../../extension/dist-e2e");

  execFileSync(
    "pnpm",
    ["--filter", "@keycrypt/extension", "exec", "vite", "build", "--outDir", "dist-e2e"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        KEYCRYPT_APP_URL: process.env.KEYCRYPT_E2E_APP_URL,
        KEYCRYPT_EXTRA_HOST_PERMISSIONS: `${TEST_PAGE_ORIGIN}/*`,
        KEYCRYPT_MANIFEST_KEY: der.toString("base64"),
      },
    }
  );

  process.env.KEYCRYPT_E2E_EXTENSION_DIR = outDir;
  process.env.KEYCRYPT_E2E_EXTENSION_ID = extensionId(der);
}
