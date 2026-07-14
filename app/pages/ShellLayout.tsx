import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { menuDoPerfil, NOME_PERFIL } from "../lib/roles";
import { Badge, Button } from "@components/ui/primitives";
import { cn } from "@components/ui/cn";

// Casca da aplicação: barra lateral com o menu já filtrado pelo perfil
// (docs/04-UX.md §2) e cabeçalho com o usuário logado.
export default function ShellLayout() {
  const { perfil, sair } = useAuth();
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
      <aside className="flex w-60 flex-col border-r border-[var(--cor-borda)] bg-white">
        <div className="border-b border-[var(--cor-borda)] px-4 py-4">
          <div className="text-lg font-semibold">Intertec</div>
          <div className="text-xs text-[var(--cor-texto-suave)]">CMV e Rentabilidade</div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {itens.map((item) => (
            <NavLink
              key={item.caminho}
              to={item.caminho}
              end={item.caminho === "/"}
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

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--cor-borda)] bg-white px-6 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{perfil.nome}</span>
            <Badge>{NOME_PERFIL[perfil.perfil]}</Badge>
          </div>
          <Button className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => void sair()}>
            Sair
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
