/**
 * Read and sanity-check DATABASE_URL_TEST.
 *
 * Integration tests truncate every table, so refuse to run unless the URL is
 * set, is a postgres URL, and names a database whose name contains "test".
 */
export function getTestDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL_TEST;
  if (!raw) {
    throw new Error(
      "DATABASE_URL_TEST is not set. Start the test database with " +
        "`docker compose -f docker-compose.test.yml up -d --wait` and export " +
        "DATABASE_URL_TEST=postgresql://keycrypt:keycrypt@localhost:54329/keycrypt_test"
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL_TEST is not a valid URL");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL_TEST must be a postgresql:// URL");
  }

  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing to run integration tests against database "${dbName}": ` +
        'its name must contain "test" because every table is truncated.'
    );
  }

  return raw;
}
