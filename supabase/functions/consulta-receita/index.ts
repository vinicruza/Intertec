// Consulta de CNPJ e CEP pelo servidor.
//
// POR QUE ISTO EXISTE
//
// Até 24/08/2026 o navegador de cada vendedora chamava a consulta pública
// direto. Três problemas nasciam daí:
//
//   1. o limite de consultas do serviço público é por IP — cada máquina
//      gastava o próprio limite, e quem consultava demais era barrada;
//   2. quando o serviço barra, a resposta vem sem os cabeçalhos que o
//      navegador exige, e a busca morre como "sem conexão" — foi exatamente o
//      que apareceu na tela da cliente;
//   3. firewall de empresa, antivírus e extensão de navegador cortam esse tipo
//      de chamada mesmo com a internet perfeita.
//
// Aqui a chamada sai de um lugar só, com tempo limite, com cache e com o erro
// traduzido. O navegador fala apenas com o nosso próprio serviço.
//
// Quem pode chamar: só sessão autenticada (`verify_jwt` ligado, e o cabeçalho
// é conferido de novo aqui). Não é um proxy aberto para a internet.
//
// Publicar: `supabase functions deploy consulta-receita`.

type Alvo = "cnpj" | "cep";

type Motivo = "invalido" | "nao_encontrado" | "limite" | "tempo" | "rede" | "servico";

const cabecalhos = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TEMPO_LIMITE_MS = 8000;

const BASE: Record<Alvo, string> = {
  cnpj: "https://brasilapi.com.br/api/cnpj/v1/",
  cep: "https://brasilapi.com.br/api/cep/v2/",
};

// Quanto tempo a resposta vale. Razão social e endereço de CNPJ mudam de ano em
// ano; rua de CEP, quase nunca. O cache é o que segura o limite do serviço
// público quando várias vendedoras consultam o mesmo hospital no mesmo dia.
const VALIDADE_MS: Record<Alvo, number> = {
  cnpj: 24 * 60 * 60 * 1000,
  cep: 7 * 24 * 60 * 60 * 1000,
};

const LIMITE_DE_ITENS = 500;

type EmCache = { dados: unknown; expiraEm: number };
const cache = new Map<string, EmCache>();

function resposta(corpo: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: cabecalhos });
}

const FRASES: Record<Motivo, string> = {
  invalido: "Documento inválido para consulta.",
  nao_encontrado: "Não encontrado na base pública.",
  limite: "A consulta pública está limitando o número de pedidos neste momento.",
  tempo: "A consulta pública demorou demais para responder.",
  rede: "Não foi possível falar com a consulta pública.",
  servico: "A consulta pública respondeu com erro.",
};

// O status devolvido ao navegador acompanha o motivo para o supabase-js
// entregar o corpo; a frase que a vendedora lê é montada na tela.
function falha(motivo: Motivo, status = 502): Response {
  return resposta({ erro: FRASES[motivo], motivo }, status);
}

function guardar(chave: string, dados: unknown, alvo: Alvo): void {
  if (cache.size >= LIMITE_DE_ITENS) {
    // Isolate pequeno: em vez de uma estrutura de descarte sofisticada, limpa o
    // que já venceu e, se ainda estiver cheio, descarta o item mais antigo.
    const agora = Date.now();
    for (const [k, v] of cache) if (v.expiraEm <= agora) cache.delete(k);
    if (cache.size >= LIMITE_DE_ITENS) cache.delete(cache.keys().next().value as string);
  }
  cache.set(chave, { dados, expiraEm: Date.now() + VALIDADE_MS[alvo] });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cabecalhos });
  if (req.method !== "POST") return resposta({ erro: "Método não suportado" }, 405);
  if (!req.headers.get("Authorization")) return resposta({ erro: "Sessão não informada" }, 401);

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return falha("invalido", 400);
  }

  const alvo = String(corpo.alvo ?? "") as Alvo;
  if (alvo !== "cnpj" && alvo !== "cep") return falha("invalido", 400);

  // Só dígitos, e no tamanho exato. É o que impede alguém de usar esta função
  // para chamar outro endereço qualquer pendurando texto na URL.
  const documento = String(corpo.documento ?? "").replace(/\D/g, "");
  const tamanho = alvo === "cnpj" ? 14 : 8;
  if (documento.length !== tamanho) return falha("invalido", 400);

  const chave = `${alvo}:${documento}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.expiraEm > Date.now()) {
    return resposta({ dados: guardado.dados, cache: true });
  }
  if (guardado) cache.delete(chave);

  let publica: Response;
  try {
    publica = await fetch(`${BASE[alvo]}${documento}`, {
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      headers: { Accept: "application/json", "User-Agent": "intertech-cmv/1.0" },
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    return falha(nome === "TimeoutError" || nome === "AbortError" ? "tempo" : "rede", 504);
  }

  if (publica.status === 404) return falha("nao_encontrado", 404);
  if (publica.status === 429) return falha("limite", 429);
  if (!publica.ok) return falha("servico", 502);

  let dados: unknown;
  try {
    dados = await publica.json();
  } catch {
    return falha("servico", 502);
  }

  guardar(chave, dados, alvo);
  return resposta({ dados, cache: false });
});
