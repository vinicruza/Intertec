import { expect, test } from "@playwright/test";

// Teste de tela com login de verdade: sobe o app, entra no sistema e passa
// pelas telas conferindo que nenhuma quebrou depois de uma publicação.
//
// Só roda se os quatro valores existirem. Faltando qualquer um, o teste se
// pula sozinho em vez de falhar — CI vermelho por falta de configuração não
// avisa nada a ninguém, só ensina o time a ignorar a bolinha vermelha.
// Como configurar: docs/06-Carga-e-Deploy.md §5.3.
const email = process.env.E2E_EMAIL;
const senha = process.env.E2E_PASSWORD;
const bancoConfigurado = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);

test.skip(
  !email || !senha || !bancoConfigurado,
  "Faltam segredos do E2E (E2E_EMAIL, E2E_PASSWORD, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)",
);

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email!);
  await page.getByLabel("Senha").fill(senha!);
  await page.getByRole("button", { name: "Entrar" }).click();

  // Conta com senha provisória para na tela de definir senha e nunca chega ao
  // sistema. Sem esta conferência o sintoma seria um tempo esgotado sem
  // explicação; com ela, o CI diz exatamente o que fazer.
  const definirSenha = page.getByRole("heading", { name: "Defina a sua senha" });
  await expect
    .poll(
      async () =>
        (await definirSenha.isVisible()) ? "troca-obrigatoria" : new URL(page.url()).pathname,
      {
        timeout: 20_000,
        message:
          "O login não saiu da tela de entrada. Confira E2E_EMAIL e E2E_PASSWORD: a conta precisa existir, estar ativa e ter perfil Administrador.",
      },
    )
    .not.toBe("/login");

  expect(
    await definirSenha.isVisible(),
    "A conta usada no E2E ainda está com senha provisória: entre com ela uma vez e defina a senha definitiva, senão o sistema não passa da tela de troca.",
  ).toBe(false);

  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
});

test("abre dashboard, histórico, DRE e integridade sem erro de tela", async ({ page }) => {
  for (const rota of ["/", "/pedidos", "/dre", "/integridade"]) {
    await page.goto(rota);
    await expect(page.getByText("Nao foi possivel abrir esta tela")).toHaveCount(0);
  }
  await expect(page.getByRole("heading", { name: "Integridade dos dados" })).toBeVisible();
});
