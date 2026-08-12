import { expect, test } from "@playwright/test";

// Teste de tela com login de verdade: sobe o app, entra no sistema e passa por
// TODAS as telas conferindo que nenhuma quebrou depois de uma publicação.
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

// As 14 rotas de app/lib/roles.ts, com o título que cada uma tem de desenhar.
// A conta do E2E é Administrador, então enxerga todas — inclusive as quatro do
// bloco Administração e o DRE, que existe mas não tem link no menu.
const TELAS: Array<{ rota: string; titulo: RegExp }> = [
  { rota: "/", titulo: /./ },
  { rota: "/simulador", titulo: /Simulador de pedido/ },
  // Atenção: o menu diz "Histórico de pedidos", mas o título da tela é
  // "Cotações e pedidos". Aqui vale o que a tela desenha.
  { rota: "/pedidos", titulo: /Cota[çc][õo]es e pedidos/ },
  { rota: "/clientes", titulo: /Clientes/ },
  { rota: "/kits", titulo: /Kits/ },
  { rota: "/produtos", titulo: /Produtos/ },
  { rota: "/insumos", titulo: /Insumos/ },
  { rota: "/vendas-consumo", titulo: /Vendas|Consumo/ },
  { rota: "/dre", titulo: /DRE/ },
  { rota: "/perfil", titulo: /Meu perfil|Perfil/ },
  { rota: "/aprovacoes", titulo: /Aprova/ },
  { rota: "/usuarios", titulo: /Usu[áa]rios/ },
  { rota: "/cadastros", titulo: /Cadastros/ },
  { rota: "/configuracoes", titulo: /Configura/ },
  { rota: "/integridade", titulo: /Integridade dos dados/ },
];

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

// Uma tela que quebra no navegador não aparece nos testes de cálculo: eles não
// abrem navegador nenhum. Este é o teste que pega "a tela não abre mais".
for (const { rota, titulo } of TELAS) {
  test(`abre ${rota} sem quebrar`, async ({ page }) => {
    const errosDeConsole: string[] = [];
    page.on("pageerror", (e) => errosDeConsole.push(String(e)));

    await page.goto(rota);

    // Espera a tela terminar de carregar. Sem isto, a conferência do título
    // acontecia enquanto a página ainda mostrava "Carregando…" e falhava por
    // pressa, não por defeito.
    const conteudo = page.locator("main");
    await expect(conteudo).not.toContainText("Carregando", { timeout: 20_000 });

    // O ErrorBoundary do app desenha esta frase quando um componente estoura.
    await expect(page.getByText("Nao foi possivel abrir esta tela")).toHaveCount(0);
    await expect(conteudo).toContainText(titulo, { timeout: 15_000 });
    expect(errosDeConsole, `Erro de JavaScript em ${rota}`).toEqual([]);
  });
}

test("o menu lateral leva a todas as telas do Administrador", async ({ page }) => {
  // Rota certa, link quebrado: o laço acima não pegaria. Este pega.
  for (const rotulo of ["Simulador de pedido", "Histórico de pedidos", "Kits", "Produtos e fichas", "Insumos", "Usuários", "Configurações"]) {
    await page.goto("/");
    const link = page.getByRole("link", { name: new RegExp(rotulo) }).first();
    await expect(link, `Link "${rotulo}" não está no menu`).toBeVisible();
    await link.click();
    await expect(page.getByText("Nao foi possivel abrir esta tela")).toHaveCount(0);
  }
});

test("auditoria de kits mostra indicadores, filtros e dados de rastreabilidade", async ({ page }) => {
  const errosDeConsole: string[] = [];
  page.on("pageerror", (e) => errosDeConsole.push(String(e)));

  await page.goto("/kits");
  const conteudo = page.locator("main");
  await expect(conteudo).not.toContainText("Carregando", { timeout: 20_000 });
  await expect(page.getByText("Nao foi possivel abrir esta tela")).toHaveCount(0);

  if (await page.getByText("Nenhum kit ainda").isVisible()) {
    test.skip(true, "Ambiente sem kits cadastrados para auditar.");
  }

  await expect(page.getByText("Kits no catálogo")).toBeVisible();
  await expect(page.getByText("Sem composição")).toBeVisible();
  await expect(page.getByText("CMV pendente")).toBeVisible();
  await expect(page.getByText("Usados em pedidos")).toBeVisible();
  await expect(page.getByText("Nunca usados")).toBeVisible();

  await expect(page.getByPlaceholder("Código, kit, produto, cliente, orçamento ou pedido...")).toBeVisible();
  const filtro = page.locator("select").filter({ hasText: "Com risco" }).first();
  await filtro.selectOption("risco");
  await expect(filtro).toHaveValue("risco");
  await filtro.selectOption("todos");

  await expect(conteudo).toContainText("Auditoria");
  await expect(conteudo).toContainText("Composição e CMV");
  await expect(conteudo).toContainText("Uso em pedidos");
  expect(errosDeConsole, "Erro de JavaScript na auditoria de kits").toEqual([]);
});

test("histórico usa a linguagem de orçamento e pedido operacional", async ({ page }) => {
  await page.goto("/pedidos");
  const conteudo = page.locator("main");
  await expect(conteudo).not.toContainText("Carregando", { timeout: 20_000 });
  await expect(page.getByText("Nao foi possivel abrir esta tela")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Cotações e pedidos" })).toBeVisible();
  await expect(conteudo).toContainText("Orçamento / pedido");
  await expect(page.locator("select").filter({ hasText: "Prontos para gerar pedido" }).first()).toBeVisible();

  const primeiraLinha = page.locator("tbody tr").first();
  if ((await primeiraLinha.count()) === 0) {
    test.skip(true, "Ambiente sem cotações/pedidos para abrir o detalhe.");
  }

  await primeiraLinha.click();
  await expect(page.getByRole("heading", { name: /Orçamento \/ Pedido/ })).toBeVisible({ timeout: 20_000 });
  await expect(conteudo).toContainText("Orçamento:");
  await expect(conteudo).toContainText("Pedido:");
  await expect(conteudo).toContainText(/Gerar Pedido|Pedido gerado|Aguardando aprovação|Orçamento em aberto/);
});
