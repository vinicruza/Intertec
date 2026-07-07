// Perfis e navegação por perfil (docs/04-UX.md §2).
// O menu ESCONDE o que o perfil não pode ver; o RLS no banco é a garantia real.

export type Perfil = "admin" | "financeiro" | "comercial" | "producao";

export const NOME_PERFIL: Record<Perfil, string> = {
  admin: "Administrador",
  financeiro: "Financeiro",
  comercial: "Comercial",
  producao: "Produção",
};

export type ItemMenu = {
  caminho: string;
  rotulo: string;
  perfis: Perfil[]; // quem enxerga este item
};

// Áreas do sistema. As telas de conteúdo chegam nas próximas sprints; aqui
// entram os itens de menu já filtrados por perfil, conforme a matriz do UX.
export const MENU: ItemMenu[] = [
  { caminho: "/", rotulo: "Início", perfis: ["admin", "financeiro", "comercial"] },
  { caminho: "/simulador", rotulo: "Simulador de pedido", perfis: ["admin", "financeiro", "comercial"] },
  { caminho: "/pedidos", rotulo: "Histórico de pedidos", perfis: ["admin", "financeiro", "comercial"] },
  { caminho: "/kits", rotulo: "Kits", perfis: ["admin", "financeiro", "comercial", "producao"] },
  { caminho: "/produtos", rotulo: "Produtos e fichas", perfis: ["admin", "financeiro", "comercial", "producao"] },
  { caminho: "/insumos", rotulo: "Insumos", perfis: ["admin", "financeiro", "producao"] },
  { caminho: "/alocacao", rotulo: "Alocação de despesas", perfis: ["admin", "financeiro"] },
  { caminho: "/dre", rotulo: "DRE mensal", perfis: ["admin", "financeiro"] },
  { caminho: "/configuracoes", rotulo: "Configurações", perfis: ["admin", "financeiro"] },
  { caminho: "/perfil", rotulo: "Meu perfil", perfis: ["admin", "financeiro", "comercial", "producao"] },
];

export function menuDoPerfil(perfil: Perfil): ItemMenu[] {
  return MENU.filter((item) => item.perfis.includes(perfil));
}

export function perfilPodeAcessar(perfil: Perfil, caminho: string): boolean {
  const item = MENU.find((m) => m.caminho === caminho);
  return item ? item.perfis.includes(perfil) : false;
}
