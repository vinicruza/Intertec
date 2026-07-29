import { supabase } from "../supabase";
import type { Perfil } from "../roles";

// ============================================================
// Gestão de acesso (Administrador)
// ============================================================
//
// A credencial em si (e-mail e senha) é criada no Supabase — por convite no
// painel ou cadastro do próprio usuário. Fazer isso pelo navegador exigiria a
// chave de serviço no front-end, o que daria a qualquer visitante poder total
// sobre o projeto.
//
// Aqui o Administrador faz o resto: define nome, perfil e libera o acesso.
// Enquanto o perfil está inativo, a pessoa entra e não enxerga nada, porque
// todas as políticas do banco dependem de current_user_role(), que devolve
// nulo para inativo.

export type UsuarioAdmin = {
  id: string;
  full_name: string;
  role: Perfil;
  active: boolean;
  email: string;
  last_sign_in_at: string | null;
  created_at: string;
};

export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  const { data, error } = await supabase.rpc("list_users_for_admin");
  if (error) throw error;
  return (data ?? []) as UsuarioAdmin[];
}

export async function salvarUsuario(
  id: string,
  nome: string,
  perfil: Perfil,
  ativo: boolean
): Promise<void> {
  const { error } = await supabase.rpc("save_user_profile", {
    p_id: id,
    p_full_name: nome,
    p_role: perfil,
    p_active: ativo,
  });
  if (error) throw error;
}
