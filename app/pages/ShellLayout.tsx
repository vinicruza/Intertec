import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { menuDoPerfil, NOME_PERFIL } from "../lib/roles";
import { Badge, Button } from "@components/ui/primitives";
import { cn } from "@components/ui/cn";

// Casca da aplicação: barra lateral com o menu já filtrado pelo perfil
// (docs/04-UX.md §2) e cabeçalho com o usuário logado.
//
// No celular a barra lateral vira uma "gaveta" que abre pelo botão de menu
// (☰) do cabeçalho; no computador ela fica fixa à esquerda como antes.
export default function ShellLayout() {
  const { perfil, sair } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);

  if (!perfil) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--cor-fundo)] p-6">
        <div className="max-w-md rounded-md border border-[var(--cor-borda)] bg-white p-5 text-sm shadow-sm">
          <h1 className="text-lg font-semibold">Perfil nao carregado</h1>
          <p className="mt-2 text-[var(--cor-texto-suave)]">
            Sua sessao existe, mas o perfil de acesso nao foi encontrado. Entre novamente para recarregar as permissoes.
          </p>
          <Button className="mt-4" onClick={() => void sair()}>Sair e entrar novamente</Button>
        </div>
      </div>
    );
  }
  const itens = menuDoPerfil(perfil.perfil);

  return (
    <div className="flex h-full">
      {/* Fundo escurecido no celular quando a gaveta está aberta. */}
      {menuAberto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[var(--cor-borda)] bg-white transition-transform",
          "md:static md:z-auto md:translate-x-0",
          menuAberto ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--cor-borda)] px-4 py-4">
          <div>
            <div className="text-lg font-semibold">Intertec</div>
            <div className="text-xs text-[var(--cor-texto-suave)]">CMV e Rentabilidade</div>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)] md:hidden"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {itens.map((item) => (
            <NavLink
              key={item.caminho}
              to={item.caminho}
              end={item.caminho === "/"}
              onClick={() => setMenuAberto(false)}
              className={({ isActive }) =>
                cn(
                  "block rounded-md px-3 py-2 text-sm",
                  isActive
                    ? "bg-[var(--cor-primaria)] text-white"
                    : "text-[var(--cor-texto)] hover:bg-[var(--cor-fundo)]"
                )
              }
            >
              {item.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--cor-borda)] bg-white px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-md p-1 text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)] md:hidden"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{perfil.nome}</span>
              <Badge>{NOME_PERFIL[perfil.perfil]}</Badge>
            </div>
          </div>
          <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => void sair()}>
            Sair
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
