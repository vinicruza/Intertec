import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { perfilPodeAcessar } from "../lib/roles";

// Exige usuário logado; senão manda para o login (guardando de onde veio).
export function ExigirLogin({ children }: { children: ReactNode }) {
  const { session, carregando } = useAuth();
  const local = useLocation();
  if (carregando) return <TelaCarregando />;
  if (!session) return <Navigate to="/login" state={{ de: local.pathname }} replace />;
  return <>{children}</>;
}

// Exige que o perfil possa acessar a rota atual (defesa na navegação;
// o RLS no banco é a defesa real dos dados).
export function ExigirAcesso({ caminho, children }: { caminho: string; children: ReactNode }) {
  const { perfil, session, carregando, sair } = useAuth();
  if (carregando) return <TelaCarregando />;
  // Logado, mas sem perfil ativo: o Administrador ainda não liberou o acesso.
  // Mandar para o login aqui criaria um vaivém sem fim, já que a sessão existe.
  if (session && !perfil) return <AguardandoLiberacao aoSair={sair} />;
  if (!perfil) return <Navigate to="/login" replace />;
  if (!perfilPodeAcessar(perfil.perfil, caminho)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export function ExigirSuperAdmin({ children }: { children: ReactNode }) {
  const { perfil, session, carregando, sair } = useAuth();
  if (carregando) return <TelaCarregando />;
  if (session && !perfil) return <AguardandoLiberacao aoSair={sair} />;
  if (!perfil) return <Navigate to="/login" replace />;
  if (!perfil.superAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AguardandoLiberacao({ aoSair }: { aoSair: () => Promise<void> }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md space-y-3 rounded-lg border border-[var(--cor-borda)] p-6 text-center">
        <h1 className="text-lg font-semibold">Acesso não liberado</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Seu login funciona, mas o acesso está desativado — por isso nenhum dado aparece. Peça a um
          Administrador para reativar o seu perfil na tela de Usuários.
        </p>
        <button
          type="button"
          className="text-sm font-medium text-[var(--cor-primaria)] hover:underline"
          onClick={() => void aoSair()}
        >
          Sair
        </button>
      </div>
    </div>
  );
}

function TelaCarregando() {
  return (
    <div className="flex h-full items-center justify-center text-[var(--cor-texto-suave)]">
      Carregando…
    </div>
  );
}
