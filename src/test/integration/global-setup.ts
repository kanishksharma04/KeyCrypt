import { execFileSync } from "node:child_process";
import { getTestDatabaseUrl } from "./database-url";

// Runs once before the integration suite: bring the test database up to the
// latest migration, exactly as production does.
export default function globalSetup(): void {
  const url = getTestDatabaseUrl();
  execFileSync("pnpm", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
