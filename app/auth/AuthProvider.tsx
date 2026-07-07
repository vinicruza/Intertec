import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Perfil } from "../lib/roles";

export type PerfilUsuario = {
  id: string;
  nome: string;
  perfil: Perfil;
  tenantId: string;
};

type EstadoAuth = {
  session: Session | null;
  perfil: PerfilUsuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ erro: string | null }>;
  sair: () => Promise<void>;
};

const AuthContext = createContext<EstadoAuth | null>(null);

async function carregarPerfil(userId: string): Promise<PerfilUsuario | null> {
  // RLS (profiles_select_own) garante que cada um só lê o próprio perfil.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, nome: data.full_name, perfil: data.role as Perfil, tenantId: data.tenant_id };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<PerfilUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function sincronizar(s: Session | null) {
      if (!ativo) return;
      setSession(s);
      setPerfil(s ? await carregarPerfil(s.user.id) : null);
      if (ativo) setCarregando(false);
    }

    supabase.auth.getSession().then(({ data }) => sincronizar(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      void sincronizar(s);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const valor = useMemo<EstadoAuth>(
    () => ({
      session,
      perfil,
      carregando,
      entrar: async (email, senha) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        return { erro: error ? traduzErro(error.message) : null };
      },
      sair: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, perfil, carregando]
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}

function traduzErro(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "E-mail ainda não confirmado.";
  return msg;
}
