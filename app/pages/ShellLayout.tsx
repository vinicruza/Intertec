import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import TrocaSenhaObrigatoria from "../auth/TrocaSenhaObrigatoria";
import { menuPorArea, NOME_AREA, nomePerfil } from "../lib/roles";
import { contarPedidosPendentesDeAprovacao, obterParametrosAprovacao, podeAprovar } from "../lib/db/aprovacao";
import { Badge, Button } from "@components/ui/primitives";
import { cn } from "@components/ui/cn";
import { IntertechLogo } from "@components/brand/IntertechLogo";

export default function ShellLayout() {
  const { perfil, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const local = useLocation();

  useEffect(() => setMenuAberto(false), [local.pathname]);

  // Aprovações não é um item fixo do menu: aparece para quem os parâmetros de
  // Configurações marcaram como aprovador — a mesma permissão que libera o
  // botão Aprovar/Recusar dentro do pedido, não uma lista separada que possa
  // ficar desalinhada dela. Hooks vêm antes de qualquer "return" condicional.
  const habilitado = Boolean(perfil) && !perfil?.trocaDeSenhaObrigatoria;
  const paramsQuery = useQuery({
    queryKey: ["paramsAprovacao"],
    queryFn: obterParametrosAprovacao,
    enabled: habilitado,
  });
  const souAprovador = habilitado && podeAprovar(perfil?.perfil, paramsQuery.data);
  const contagemQuery = useQuery({
    queryKey: ["pedidosPendentesAprovacaoContagem"],
    queryFn: contarPedidosPendentesDeAprovacao,
    enabled: souAprovador,
    refetchInterval: 60_000, // sinal de "chegou pedido novo" sem exigir recarregar a página
  });

  if (!perfil) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--cor-fundo)] p-6">
        <div className="max-w-md rounded-2xl border border-[var(--cor-borda)] bg-white p-6 shadow-[var(--sombra-cartao)]">
          <IntertechLogo />
          <h1 className="mt-6 text-lg font-semibold">Perfil não carregado</h1>
          <p className="mt-2 text-sm text-[var(--cor-texto-suave)]">
            Sua sessão existe, mas o perfil de acesso não foi encontrado. Entre novamente para recarregar as permissões.
          </p>
          <Button className="mt-5" onClick={() => void sair()}>Sair e entrar novamente</Button>
        </div>
      </div>
    );
  }

  // Senha provisória pendente: nenhuma tela do sistema antes da troca.
  if (perfil.trocaDeSenhaObrigatoria) return <TrocaSenhaObrigatoria />;

  const grupos = menuPorArea(perfil.perfil);
  if (souAprovador) {
    const operacao = grupos.find((g) => g.area === "operacao");
    const item = { caminho: "/aprovacoes", rotulo: "Aprovações", icone: "🗹", area: "operacao" as const, perfis: [] };
    // Logo depois de "Histórico de pedidos": é a mesma área de trabalho.
    const indice = operacao?.itens.findIndex((i) => i.caminho === "/pedidos") ?? -1;
    if (operacao) operacao.itens.splice(indice >= 0 ? indice + 1 : operacao.itens.length, 0, item);
  }
  if (perfil.superAdmin) {
    const administracao = grupos.find((g) => g.area === "administracao");
    const item = { caminho: "/monitoramento", rotulo: "Monitoramento", icone: "⌁", area: "administracao" as const, perfis: [] };
    if (administracao && !administracao.itens.some((i) => i.caminho === item.caminho)) {
      administracao.itens.push(item);
    }
  }
  const pendentes = contagemQuery.data ?? 0;
  const iniciais = perfil.nome.split(" ").slice(0, 2).map((parte) => parte[0]).join("").toUpperCase();

  const lateral = (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <IntertechLogo inverse />
        <div className="mt-4 rounded-xl bg-white/8 px-3 py-2 text-[0.68rem] font-medium uppercase tracking-[0.15em] text-indigo-100">
          CMV e Rentabilidade
        </div>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-4">
        {grupos.map((grupo) => (
          <div key={grupo.area} className="mb-4 space-y-1 last:mb-0">
            <div className="flex items-center gap-2 px-3 pb-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-indigo-300">
              {NOME_AREA[grupo.area]}
              {grupo.area === "administracao" && (
                <span aria-hidden="true" title="Área restrita ao Administrador">🔒</span>
              )}
            </div>
            {grupo.itens.map((item) => (
              <NavLink
                key={item.caminho}
                to={item.caminho}
                end={item.caminho === "/"}
                className={({ isActive }) => cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                  isActive ? "bg-white text-[var(--cor-primaria)] shadow-sm" : "text-indigo-50 hover:bg-white/10 hover:text-white"
                )}
              >
                <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-base group-[.active]:bg-indigo-50">
                  {item.icone}
                </span>
                <span className="flex-1">{item.rotulo}</span>
                {item.caminho === "/aprovacoes" && pendentes > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[0.65rem] font-bold text-amber-950">
                    {pendentes}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4 text-xs leading-relaxed text-indigo-200">
        Dados financeiros protegidos por perfil de acesso.
      </div>
    </>
  );

  return (
    <div className="flex h-full min-w-0 bg-[var(--cor-fundo)]">
      <aside className="no-print hidden w-[17rem] shrink-0 flex-col bg-[var(--cor-primaria)] lg:flex">{lateral}</aside>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setMenuAberto(false)} />
          <aside className="relative flex h-full w-[min(18rem,86vw)] flex-col bg-[var(--cor-primaria)] shadow-2xl">{lateral}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex min-h-16 items-center justify-between border-b border-[var(--cor-borda)] bg-white/95 px-4 backdrop-blur md:px-7">
          <div className="flex items-center gap-3">
            <button
              aria-label="Abrir menu"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--cor-borda)] text-xl text-[var(--cor-primaria)] lg:hidden"
              onClick={() => setMenuAberto(true)}
            >
              ☰
            </button>
            <div className="lg:hidden"><IntertechLogo compact /></div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-[var(--cor-texto)]">Painel de gestão</div>
              <div className="text-xs text-[var(--cor-texto-suave)]">Custos, margens e resultados confiáveis</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{perfil.nome}</div>
              <Badge>{nomePerfil(perfil.perfil, perfil.superAdmin)}</Badge>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cor-primaria-clara)] text-xs font-bold text-[var(--cor-primaria)]">{iniciais}</div>
            <Button className="min-h-9 border border-[var(--cor-borda)] bg-white px-4 text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]" onClick={() => void sair()}>
              Sair
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-7 lg:p-8">
          <div className="mx-auto w-full max-w-[100rem]"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
