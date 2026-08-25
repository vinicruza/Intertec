// ============================================================
// Versão em execução × versão publicada
// ============================================================
//
// O problema, relatado em 25/08/2026: uma aba aberta guarda o código que
// baixou quando foi carregada. Publicar corrige o sistema para quem entra
// depois — quem já estava dentro continua com o código velho até recarregar.
// Uma vendedora passou a manhã vendo o DIFAL zerado por isso, e a única saída
// era alguém avisar "aperte Ctrl+Shift+R".
//
// O `recarregarChunk.ts` já cobre metade disso, mas só a metade barulhenta:
// quando a aba tenta abrir uma tela cujo arquivo sumiu, ele recarrega sozinho.
// Quem fica parado na MESMA tela nunca dispara aquilo — e é justamente o caso
// de quem monta um pedido a manhã inteira.
//
// Aqui a pergunta é feita de propósito: o build carimba um número no código e
// deixa o mesmo número num `version.json` ao lado. Diferentes, saiu versão
// nova.

const VERSION_JSON = "/version.json";

// O número desta aba, gravado pelo Vite no build (ver vite.config.ts).
export function versaoEmExecucao(): string {
  return typeof __VERSAO_DO_BUILD__ === "string" ? __VERSAO_DO_BUILD__ : "desconhecida";
}

// O número que está publicado agora. Devolve null quando não dá para saber —
// servidor de desenvolvimento, internet caída, resposta estranha. Null nunca
// significa "tem versão nova": na dúvida, não se mexe na tela de ninguém.
export async function buscarVersaoPublicada(): Promise<string | null> {
  try {
    // `cache: no-store` e a query variável: sem os dois, o navegador responde
    // com a cópia que ele mesmo guardou e a comparação nunca muda de ideia.
    const r = await fetch(`${VERSION_JSON}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const corpo: unknown = await r.json();
    if (corpo && typeof corpo === "object" && "id" in corpo && typeof corpo.id === "string") {
      return corpo.id;
    }
    return null;
  } catch {
    return null;
  }
}

// Decisão pura, isolada para ter teste próprio.
//
// Só é "versão nova" quando os dois números são conhecidos E diferentes. Todo
// resto é não. O caso perigoso é o falso positivo: recarregar a página de
// alguém no meio de um pedido por causa de uma resposta malformada seria pior
// do que o problema que isto resolve.
export function haVersaoNova(emUso: string, publicada: string | null): boolean {
  if (publicada === null || publicada === "") return false;
  if (emUso === "" || emUso === "desconhecida") return false;
  return emUso !== publicada;
}

// Quando a versão nova pode entrar sozinha, sem ninguém pedir.
//
// A regra é conservadora por um motivo simples: recarregar apaga o que estiver
// digitado e não salvo. Trocar de tela já é o momento em que a pessoa
// abandonou o que estava fazendo — ali a troca não custa nada.
//
// A ficha fica de fora: ela é aberta para imprimir, e recarregar no meio da
// impressão estraga a folha.
export function podeRecarregarSozinho(entrada: {
  temVersaoNova: boolean;
  rotaMudou: boolean;
  caminho: string;
}): boolean {
  if (!entrada.temVersaoNova) return false;
  if (!entrada.rotaMudou) return false;
  if (entrada.caminho.includes("/ficha")) return false;
  return true;
}
