import { defineConfig, devices } from "@playwright/test";

// Segredo que não existe no GitHub chega como texto VAZIO, não como ausente —
// e `??` só troca o ausente. Sem esta função o app subiria com endereço de
// banco vazio, quebraria na partida e derrubaria até os testes públicos, que
// nada têm a ver com login.
const valorOuPadrao = (valor: string | undefined, padrao: string) =>
  valor && valor.trim() !== "" ? valor : padrao;

const externo = valorOuPadrao(process.env.E2E_BASE_URL, "");
const browserChannel = valorOuPadrao(process.env.E2E_BROWSER_CHANNEL, "");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: valorOuPadrao(externo, "http://127.0.0.1:4173"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: browserChannel ? `chromium-${browserChannel}` : "chromium",
    use: {
      ...devices["Desktop Chrome"],
      channel: browserChannel || undefined,
    },
  }],
  webServer: externo ? undefined : {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173/login",
    reuseExistingServer: !process.env.CI,
    env: {
      // Valores de faz de conta: sem os segredos do banco real, os testes
      // públicos ainda precisam de um app que sobe e desenha a tela de login.
      VITE_SUPABASE_URL: valorOuPadrao(process.env.VITE_SUPABASE_URL, "http://127.0.0.1:54321"),
      VITE_SUPABASE_ANON_KEY: valorOuPadrao(process.env.VITE_SUPABASE_ANON_KEY, "e2e-public-key"),
    },
  },
});
