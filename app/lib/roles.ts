// Perfis e navegação por perfil (docs/04-UX.md §2).
// O menu ESCONDE o que o perfil não pode ver; o RLS no banco é a garantia real.

export type Perfil = "admin" | "financeiro" | "comercial" | "producao";

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  comercial: "Comercial",
  producao: "Produção",
};

// O Super Administrador não é um quinto perfil: é um Administrador marcado como
// dono do sistema (ver a migração 20260729001400). Toda a segurança do banco
// está escrita sobre os quatro perfis acima, e continua valendo para ele.
export function nomePerfil(perfil: Perfil, superAdmin = false): string {
  return superAdmin ? "Super Administrador" : NOME_PERFIL[perfil];
}

// O menu é dividido em duas áreas. Administração reúne o que mexe em regra,
// parâmetro e acesso — dado sensível, que só o Administrador enxerga.
export type AreaMenu = "operacao" | "administracao";

export const NOME_AREA: Record<AreaMenu, string> = {
  operacao: "Operação",
  administracao: "Administração",
};

export type ItemMenu = {
  caminho: string;
  rotulo: string;
  icone: string;
  perfis: Perfil[]; // quem PODE acessar (guarda a rota, mesmo sem link no menu)
  area: AreaMenu;
  // Fica fora do menu lateral, mas continua acessível por URL direta a quem
  // está em `perfis` — não é uma restrição de acesso, só de navegação visível.
  oculto?: boolean;
};

export const MENU: ItemMenu[] = [
  { caminho: "/", rotulo: "Início", icone: "⌂", perfis: ["admin", "financeiro", "comercial"], area: "operacao" },
  { caminho: "/simulador", rotulo: "Simulador de pedido", icone: "＋", perfis: ["admin", "financeiro", "comercial"], area: "operacao" },
  { caminho: "/pedidos", rotulo: "Histórico de pedidos", icone: "≡", perfis: ["admin", "financeiro", "comercial"], area: "operacao" },
  { caminho: "/clientes", rotulo: "Clientes", icone: "◎", perfis: ["admin", "financeiro", "comercial"], area: "operacao" },
  { caminho: "/kits", rotulo: "Kits", icone: "◇", perfis: ["admin", "financeiro", "comercial", "producao"], area: "operacao" },
  { caminho: "/produtos", rotulo: "Produtos e fichas", icone: "□", perfis: ["admin", "financeiro", "comercial", "producao"], area: "operacao" },
  { caminho: "/insumos", rotulo: "Insumos", icone: "○", perfis: ["admin", "financeiro", "producao"], area: "operacao" },
  { caminho: "/vendas-consumo", rotulo: "Vendas do ERP e consumo", icone: "⇄", perfis: ["admin", "financeiro"], area: "operacao" },
  // Removida do menu lateral por decisão do cliente em 30/07/2026. A rota
  // continua existindo e protegida por perfil — só o link some da navegação.
  { caminho: "/dre", rotulo: "DRE mensal", icone: "↗", perfis: ["admin", "financeiro"], area: "operacao", oculto: true },
  { caminho: "/perfil", rotulo: "Meu perfil", icone: "●", perfis: ["admin", "financeiro", "comercial", "producao"], area: "operacao" },

  // Área restrita. Cadastros define as listas que classificam cliente e perda;
  // Configurações define alíquota, comissão, frete e faixa de margem — mexer
  // aqui muda o resultado de todo pedido. Usuários controla quem entra.
  // Integridade dos dados expõe a saúde da base inteira.
  { caminho: "/usuarios", rotulo: "Usuários", icone: "◍", perfis: ["admin"], area: "administracao" },
  { caminho: "/cadastros", rotulo: "Cadastros", icone: "☰", perfis: ["admin"], area: "administracao" },
  { caminho: "/configuracoes", rotulo: "Configurações", icone: "⚙", perfis: ["admin"], area: "administracao" },
  { caminho: "/integridade", rotulo: "Integridade dos dados", icone: "✓", perfis: ["admin"], area: "administracao" },
];

export function menuDoPerfil(perfil: Perfil): ItemMenu[] {
  return MENU.filter((item) => item.perfis.includes(perfil) && !item.oculto);
}

// Itens agrupados por área, sem devolver área vazia — quem não é Administrador
// não vê nem o título "Administração".
export function menuPorArea(perfil: Perfil): { area: AreaMenu; itens: ItemMenu[] }[] {
  const areas: AreaMenu[] = ["operacao", "administracao"];
  return areas
    .map((area) => ({ area, itens: menuDoPerfil(perfil).filter((i) => i.area === area) }))
    .filter((grupo) => grupo.itens.length > 0);
}

export function perfilPodeAcessar(perfil: Perfil, caminho: string): boolean {
  const item = MENU.find((m) => m.caminho === caminho);
  return item ? item.perfis.includes(perfil) : false;
}

export function perfilPodeEditarProduto(perfil: Perfil): boolean {
  return perfil === "admin" || perfil === "financeiro";
}
