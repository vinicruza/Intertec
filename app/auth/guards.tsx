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
  const { perfil, carregando } = useAuth();
  if (carregando) return <TelaCarregando />;
  if (!perfil) return <Navigate to="/login" replace />;
  if (!perfilPodeAcessar(perfil.perfil, caminho)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function TelaCarregando() {
  return (
    <div className="flex h-full items-center justify-center text-[var(--cor-texto-suave)]">
      Carregando…
    </div>
  );
}
