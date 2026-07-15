import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const senha = process.env.E2E_PASSWORD;
test.skip(!email || !senha, "E2E_EMAIL e E2E_PASSWORD não configurados");

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(senha!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
});

test("abre dashboard, histórico, DRE e integridade sem erro de tela", async ({ page }) => {
  for (const rota of ["/", "/pedidos", "/dre", "/integridade"]) {
    await page.goto(rota);
    await expect(page.getByText("Nao foi possivel abrir esta tela")).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Integridade dos dados" })).toBeVisible();
});
