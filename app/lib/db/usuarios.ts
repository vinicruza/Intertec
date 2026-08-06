import { supabase } from "../supabase";
import type { Perfil } from "../roles";

// ============================================================
// Gestão de acesso (Administrador)
// ============================================================
//
// Tudo acontece dentro do sistema: criar o acesso de uma pessoa, escolher o
// perfil dela, redefinir a senha e tirar o acesso. Ninguém precisa entrar no
// painel do banco de dados para nada disso.
//
// Criar credencial, trocar a senha de outra pessoa e apagar acesso exigem a
// chave de administração do projeto, que não pode ficar no navegador. Por isso
// essas três operações passam por um serviço do lado do servidor (a Edge
// Function `gestao-usuarios`), que confere a permissão no banco antes de agir.
// O resto — nome, perfil, ativar e desativar — vai direto pelas funções do
// banco, que já barram quem não é Administrador.

export type UsuarioAdmin = {
  id: string;
  full_name: string;
  role: Perfil;
  active: boolean;
  is_super_admin: boolean;
  must_change_password: boolean;
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

// ---------- Operações que precisam do serviço do servidor ----------

type RespostaGestao = { id?: string; email?: string; erro?: string };

async function chamarGestao(corpo: Record<string, unknown>): Promise<RespostaGestao> {
  const { data, error } = await supabase.functions.invoke<RespostaGestao>("gestao-usuarios", {
    body: corpo,
  });

  // Quando a função devolve erro (403, 400…), o supabase-js entrega um Error e
  // guarda o corpo da resposta. Sem ler esse corpo, a tela mostraria
  // "Edge Function returned a non-2xx status code" em vez do motivo real.
  if (error) {
    const detalhe = await extrairErro(error);
    throw new Error(detalhe ?? traduzFalhaDeRede(error.message));
  }
  if (data?.erro) throw new Error(data.erro);
  return data ?? {};
}

async function extrairErro(error: unknown): Promise<string | null> {
  const resposta = (error as { context?: unknown }).context;
  if (!(resposta instanceof Response)) return null;
  try {
    const corpo = (await resposta.clone().json()) as { erro?: string };
    return corpo.erro ?? null;
  } catch {
    return null;
  }
}

function traduzFalhaDeRede(msg: string): string {
  if (/Failed to send a request|Failed to fetch/i.test(msg)) {
    return "Não foi possível falar com o serviço de usuários. Verifique a conexão e tente de novo.";
  }
  return msg;
}

export async function criarUsuario(dados: {
  nome: string;
  email: string;
  perfil: Perfil;
  senha: string;
}): Promise<void> {
  await chamarGestao({ acao: "criar", ...dados });
}

export async function redefinirSenha(id: string, senha: string): Promise<void> {
  await chamarGestao({ acao: "senha", id, senha });
}

export async function removerUsuario(id: string): Promise<void> {
  await chamarGestao({ acao: "remover", id });
}
