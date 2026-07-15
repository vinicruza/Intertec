import { defineConfig, devices } from "@playwright/test";

const externo = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: externo ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externo ? undefined : {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/login",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "e2e-public-key",
    },
  },
});
