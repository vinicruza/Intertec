import { expect, test } from "@playwright/test";

test("carrega o login com os campos essenciais", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Intertech Surgical/);
  await expect(page.getByText("Intertech", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("redireciona rota protegida para o login", async ({ page }) => {
  await page.goto("/pedidos");
  await expect(page).toHaveURL(/\/login$/);
});

test("valida e-mail antes de autenticar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("email-invalido");
  await page.getByLabel("Senha").fill("x");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
});
