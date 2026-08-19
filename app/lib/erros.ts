// Tradução de erro de autenticação para o que a pessoa lê na tela.
//
// Regra: nunca devolver o texto cru do servidor quando ele não for uma frase.
// Quando o serviço de autenticação falha por dentro, a resposta vem com corpo
// vazio e a biblioteca entrega a mensagem como "{}" — que apareceu na tela de
// login exatamente assim, sem dizer nada a ninguém.

// Parece uma frase para uma pessoa? Sobra do serializador (JSON vazio, colchete
// solto, string em branco) não é frase — vira o texto genérico.
function pareceFrase(msg: string): boolean {
  const limpo = msg.trim();
  if (limpo.length < 4) return false;
  if (/^[[{("']*[\]})"']*$/.test(limpo)) return false;
  return /\p{L}/u.test(limpo);
}

const GENERICO =
  "Não foi possível entrar agora. Tente de novo em alguns instantes; se continuar, avise o administrador.";

export function traduzErro(msg: string | null | undefined): string {
  if (!msg) return GENERICO;
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "E-mail ainda não confirmado.";
  if (/should be different from the old password/i.test(msg)) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (/password should be at least/i.test(msg)) return "A nova senha é curta demais.";
  // Falha interna do serviço de autenticação (HTTP 5xx). Dizer "e-mail ou senha
  // incorretos" aqui mandaria a pessoa tentar a senha certa a noite inteira.
  if (/unexpected_failure|database error|internal (server )?error/i.test(msg)) {
    return "O serviço de acesso falhou ao consultar esta conta. Não é a sua senha — avise o administrador.";
  }
  if (/failed to fetch|network|timeout/i.test(msg)) {
    return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  }
  return pareceFrase(msg) ? msg : GENERICO;
}

// Mensagem legível para um erro que veio de qualquer lugar.
//
// O Supabase rejeita RPC com um PostgrestError: um objeto simples com `message`,
// e NÃO uma instância de Error. Quem testa só `e instanceof Error` cai no texto
// padrão e joga fora a única frase que explicava a falha — foi o que aconteceu
// em 19/08/2026, quando "Fechamento rejeitado: totais enviados não reconciliam
// com os dados do pedido" virou "Erro ao gerar pedido." na tela do vendedor, e
// a causa (uma migração pendente) só apareceu no log do banco.
export function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error && pareceFrase(e.message)) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string" && pareceFrase(e.message)) {
    return e.message;
  }
  return padrao;
}
