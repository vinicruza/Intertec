// Gestão de acesso pela própria aplicação.
//
// POR QUE ISTO EXISTE
//
// Criar credencial, trocar senha de outra pessoa e apagar acesso são operações
// que só a chave de administração do projeto pode fazer. Essa chave NÃO pode
// ficar no navegador: qualquer visitante leria o código da página e passaria a
// ter poder total sobre a base. Então ela fica aqui, num serviço do lado do
// servidor, e o navegador só consegue pedir estas três coisas.
//
// COMO A PERMISSÃO É CONFERIDA
//
// O serviço não decide sozinho quem pode o quê. Ele repassa o pedido ao banco
// com o crachá de quem está pedindo (o token da sessão) e chama a função
// assert_can_manage_user. É o banco que diz "pode" ou "não pode", com a mesma
// regra usada em todos os outros caminhos:
//
//   * só Administrador gerencia usuários;
//   * o Super Administrador é invisível e intocável para os demais;
//   * ninguém remove o próprio acesso;
//   * a Intertech não pode ficar sem nenhum Administrador ativo.
//
// A chave de administração é usada só depois desse "pode", e só para a
// operação pedida.

import { createClient } from "jsr:@supabase/supabase-js@2";

type Acao = "criar" | "senha" | "remover";

const PERFIS = ["admin", "financeiro", "comercial", "producao"];
const SENHA_MINIMA = 8;

const cabecalhos = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
}

function erro(mensagem: string, status = 400): Response {
  return resposta({ erro: mensagem }, status);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return erro("Método não suportado", 405);

  const autorizacao = req.headers.get("Authorization");
  if (!autorizacao) return erro("Sessão não informada", 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const servico = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !servico) return erro("Serviço mal configurado", 500);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro("Pedido inválido");
  }

  const acao = String(corpo.acao ?? "") as Acao;
  if (!["criar", "senha", "remover"].includes(acao)) return erro("Ação inválida");

  const id = corpo.id ? String(corpo.id) : null;
  if (acao !== "criar" && !id) return erro("Informe o usuário");

  // Cliente com o crachá de quem pediu: tudo o que passar por aqui obedece às
  // regras do banco para aquela pessoa.
  const comoUsuario = createClient(url, anon, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const permissao = await comoUsuario.rpc("assert_can_manage_user", { p_id: id, p_acao: acao });
  if (permissao.error) return erro(permissao.error.message, 403);

  // Só a partir daqui a chave de administração entra em cena.
  const comoServico = createClient(url, servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (acao === "criar") {
    const nome = String(corpo.nome ?? "").trim();
    const email = String(corpo.email ?? "").trim().toLowerCase();
    const perfil = String(corpo.perfil ?? "");
    const senha = String(corpo.senha ?? "");

    if (!nome) return erro("Informe o nome da pessoa");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro("E-mail inválido");
    if (!PERFIS.includes(perfil)) return erro("Perfil inválido");
    if (senha.length < SENHA_MINIMA) {
      return erro(`A senha provisória precisa ter ao menos ${SENHA_MINIMA} caracteres`);
    }

    const criado = await comoServico.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true, // sem servidor de e-mail configurado, confirmar aqui
      user_metadata: { full_name: nome },
    });

    if (criado.error || !criado.data.user) {
      const msg = criado.error?.message ?? "Não foi possível criar o acesso";
      return erro(/already been registered|already exists/i.test(msg)
        ? "Já existe um acesso com este e-mail"
        : msg);
    }

    const novoId = criado.data.user.id;

    // O gatilho do banco já criou o perfil como inativo; aqui ele recebe nome,
    // perfil e liberação — pela mesma função que a tela usa, com o crachá de
    // quem pediu. Se falhar, a credencial recém-criada é desfeita: ficar com
    // login sem perfil liberado seria pior do que não ter criado nada.
    const perfilSalvo = await comoUsuario.rpc("save_user_profile", {
      p_id: novoId,
      p_full_name: nome,
      p_role: perfil,
      p_active: true,
    });

    if (perfilSalvo.error) {
      await comoServico.auth.admin.deleteUser(novoId);
      return erro(perfilSalvo.error.message);
    }

    await comoUsuario.rpc("log_user_access_event", {
      p_id: novoId,
      p_action: "create_access",
      p_detail: { email, role: perfil },
    });

    return resposta({ id: novoId, email });
  }

  if (acao === "senha") {
    const senha = String(corpo.senha ?? "");
    if (senha.length < SENHA_MINIMA) {
      return erro(`A senha provisória precisa ter ao menos ${SENHA_MINIMA} caracteres`);
    }

    const atualizado = await comoServico.auth.admin.updateUserById(id!, { password: senha });
    if (atualizado.error) return erro(atualizado.error.message);

    await comoUsuario.rpc("log_user_access_event", {
      p_id: id,
      p_action: "reset_password",
      p_detail: null,
    });

    return resposta({ id });
  }

  // remover
  const removido = await comoServico.auth.admin.deleteUser(id!);
  if (removido.error) return erro(removido.error.message);

  // O perfil vai embora junto com o usuário (on delete cascade), então a
  // auditoria é o único rastro que sobra de quem tinha acesso.
  await comoUsuario.rpc("log_user_access_event", {
    p_id: id,
    p_action: "delete_access",
    p_detail: null,
  });

  return resposta({ id });
});
