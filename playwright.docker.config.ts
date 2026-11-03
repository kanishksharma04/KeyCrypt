import { defineConfig, devices } from "@playwright/test";

// Smoke test for the self-hosting image, against a RUNNING container:
//   docker compose up -d --build --wait
//   DOCKER_APP_URL=http://localhost:3000 pnpm test:docker
// It creates a throwaway account in that instance.

const baseURL = process.env.DOCKER_APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e/docker",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
  },
});
