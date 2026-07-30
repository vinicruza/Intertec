import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Perfil } from "../lib/roles";

export type PerfilUsuario = {
  id: string;
  nome: string;
  perfil: Perfil;
  tenantId: string;
  superAdmin: boolean;
  // Senha definida por outra pessoa (cadastro ou redefinição): trocar é o único
  // caminho para o resto do sistema.
  trocaDeSenhaObrigatoria: boolean;
};

type EstadoAuth = {
  session: Session | null;
  perfil: PerfilUsuario | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ erro: string | null }>;
  trocarSenha: (senhaAtual: string, novaSenha: string) => Promise<{ erro: string | null }>;
  sair: () => Promise<void>;
};

const AuthContext = createContext<EstadoAuth | null>(null);

async function carregarPerfil(userId: string): Promise<PerfilUsuario | null> {
  // RLS (profiles_select_own) garante que cada um só lê o próprio perfil.
  // O filtro por `active` espelha current_user_role() no banco: perfil inativo
  // não tem papel nem tenant, então não enxergaria dado nenhum de qualquer
  // forma. Filtrando aqui, a tela consegue dizer isso com clareza em vez de
  // parecer quebrada.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, tenant_id, is_super_admin, must_change_password")
    .eq("id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    nome: data.full_name,
    perfil: data.role as Perfil,
    tenantId: data.tenant_id,
    superAdmin: Boolean(data.is_super_admin),
    trocaDeSenhaObrigatoria: Boolean(data.must_change_password),
  };
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
      // Trocar a própria senha. Confere a senha atual antes: sem isso, quem
      // passasse por um computador destravado assumiria a conta.
      trocarSenha: async (senhaAtual, novaSenha) => {
        const email = session?.user.email;
        if (!email) return { erro: "Sessão sem e-mail; entre novamente." };
        const conferencia = await supabase.auth.signInWithPassword({
          email,
          password: senhaAtual,
        });
        if (conferencia.error) return { erro: "A senha atual está incorreta." };
        const { error } = await supabase.auth.updateUser({ password: novaSenha });
        if (error) return { erro: traduzErro(error.message) };

        // A senha agora é só dela: a obrigação de trocar acabou. O perfil é
        // recarregado para a tela de troca obrigatória sair da frente na hora.
        await supabase.rpc("clear_must_change_password");
        if (session) setPerfil(await carregarPerfil(session.user.id));
        return { erro: null };
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
  if (/should be different from the old password/i.test(msg)) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (/password should be at least/i.test(msg)) return "A nova senha é curta demais.";
  return msg;
}
