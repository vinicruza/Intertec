// Nomenclatura de nota fiscal — regra combinada com o cliente em 04/08/2026,
// em duas rodadas: primeiro os campos cirúrgicos, depois o resto do catálogo.
//
// O catálogo tem UM nome por produto, e esse nome carrega detalhe de fabricação
// (gramatura, matéria-prima TNT/SMS, origem "China"). Isso serve para custo e
// produção, mas não é o que deve sair impresso na nota fiscal.
//
// Aqui nasce o segundo nome, paralelo: a descrição de NF. O nome interno do
// catálogo NÃO muda — é ele que sustenta CMV, ficha técnica e histórico. Esta
// função só traduz o nome interno para o nome fiscal.
//
// Regra, em uma frase: troca o começo do nome pelo nome fiscal da família e
// apaga do resto o que não deve aparecer na nota. Tamanho, "+ Tape", "Estéril"
// e "Não Estéril" continuam — são a diferença real do que está sendo vendido.
//
// Produto sem família mapeada sai na nota **com o próprio nome do catálogo**
// ("o restante se mantém igual"), e não em branco.

/** Gramatura escrita como "GR30", "GR 40" — o formato dos campos. */
const GRAMATURA_GR = /\bGR\s?\d+\b/gi;
/** Gramatura escrita como "30g", "40 g" — o formato dos aventais. */
const GRAMATURA_G = /\b\d+\s?g\b/gi;
const TNT = /\bTNT\b/gi;
const SMS = /\bSMS\b/gi;
/** Origem do insumo, que aparece só nos Campos Catarata. */
const ORIGEM = /\bChina\b/gi;

/** Nome fiscal de cada família, casado pelo começo do nome do catálogo. */
type RegraFamilia = {
  /** Começo do nome interno que identifica a família. */
  comeco: RegExp;
  /** Nome que passa a valer na nota fiscal. */
  nomeNF: string;
  /** O que é apagado do resto do nome nesta família. */
  apagar?: RegExp[];
  /** Trocas de palavra no resto do nome, aplicadas depois das remoções. */
  trocar?: Array<[RegExp, string]>;
};

// Campos: nem TNT nem SMS podem variar a nota, nem a gramatura, nem a origem.
const APAGAR_CAMPO = [GRAMATURA_GR, TNT, SMS, ORIGEM];

// Aventais: some a gramatura (nos dois formatos) e o TNT. O SMS **fica** —
// pedido explícito do cliente, ao contrário dos campos. E "Tag" vira "Toalha".
const APAGAR_AVENTAL = [GRAMATURA_GR, GRAMATURA_G, TNT];
const TROCAR_AVENTAL: Array<[RegExp, string]> = [[/\bTags?\b/gi, "Toalha"]];

/** "Grande" → "G", "Pequeno" → "P". Só vale para os Steri Drape. */
const TROCAR_STERI_DRAPE: Array<[RegExp, string]> = [
  [/\bGrandes?\b/gi, "G"],
  [/\bPequenos?\b/gi, "P"],
];

// A ordem importa: a família genérica de cada linha ("Campo", "Avental") tem de
// vir depois das específicas, senão engoliria todas elas.
const FAMILIAS: RegraFamilia[] = [
  // ── Campos cirúrgicos (categoria CC, 216 produtos) ──
  { comeco: /^campo\s+catarata\b/i, nomeNF: "Campo Cirúrgico com Adesivo e Bag", apagar: APAGAR_CAMPO },
  { comeco: /^campo\s+com\s+fenestra\b/i, nomeNF: "Campo Cirúrgico com Fenestra", apagar: APAGAR_CAMPO },
  { comeco: /^campo\s+com\s+adesivo\b/i, nomeNF: "Campo Cirúrgico com Adesivo", apagar: APAGAR_CAMPO },
  { comeco: /^campo\s+de\s+mesa\b/i, nomeNF: "Campo Cirúrgico com Reforço", apagar: APAGAR_CAMPO },
  { comeco: /^campo\s+lasik\b/i, nomeNF: "Campo Cirúrgico com Adesivo e 2 Bags", apagar: APAGAR_CAMPO },
  { comeco: /^campo\s+simples\b/i, nomeNF: "Campo Cirúrgico Sem Fenestra", apagar: APAGAR_CAMPO },
  {
    comeco: /^steri\s+drape\b/i,
    nomeNF: "Campo Cirúrgico Steri Drape",
    apagar: APAGAR_CAMPO,
    trocar: TROCAR_STERI_DRAPE,
  },
  // Campo Lateral, Superior, Inferior, de Mayo, Fenestra U…: só ganham a
  // palavra "Cirúrgico", o resto do nome se mantém.
  { comeco: /^campo\b/i, nomeNF: "Campo Cirúrgico", apagar: APAGAR_CAMPO },

  // ── Paramentação e acessórios (segunda rodada) ──
  // Gineco é o mesmo produto que o mercado chama de avental sem manga.
  {
    comeco: /^avental\s+gineco\b/i,
    nomeNF: "Avental Cirúrgico Sem Manga",
    apagar: APAGAR_AVENTAL,
    trocar: TROCAR_AVENTAL,
  },
  { comeco: /^avental\b/i, nomeNF: "Avental Cirúrgico", apagar: APAGAR_AVENTAL, trocar: TROCAR_AVENTAL },
  // A Wiper não é compressa cirúrgica; na nota ela é toalha de mão. As demais
  // compressas (Cremer, P, G, Pré-Lavada) continuam com o nome do catálogo.
  { comeco: /^compressa\s+wiper\b/i, nomeNF: "Toalha de Mão" },
];

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Traduz o nome interno do catálogo para a descrição que sai na nota fiscal.
 * Produto de família sem regra própria sai com o próprio nome do catálogo.
 * Devolve null só para nome vazio — aí não há o que descrever.
 */
export function descricaoNFdoProduto(nomeDoCatalogo: string): string | null {
  const nome = normalizarEspacos(nomeDoCatalogo ?? "");
  if (!nome) return null;

  const familia = FAMILIAS.find((f) => f.comeco.test(nome));
  if (!familia) return nome;

  let resto = nome.replace(familia.comeco, "");
  for (const padrao of familia.apagar ?? []) resto = resto.replace(padrao, " ");
  for (const [padrao, troca] of familia.trocar ?? []) resto = resto.replace(padrao, troca);

  return normalizarEspacos(`${familia.nomeNF} ${resto}`);
}

/**
 * Como a descrição de NF de um produto foi escrita: pela regra acima ou à mão.
 * Existe para que uma próxima rodada da regra nunca apague em silêncio um texto
 * que a Intertech tenha ajustado.
 */
export type OrigemDescricaoNF = "regra" | "manual";

/**
 * Classifica o texto que o usuário está salvando: igual ao que a regra produz
 * é "regra"; diferente é "manual" e passa a ser intocável para a regra.
 * Texto vazio não tem origem (null) — é uma descrição que ainda não existe.
 */
export function origemDaDescricaoNF(
  nomeDoCatalogo: string,
  descricaoInformada: string
): OrigemDescricaoNF | null {
  const informada = normalizarEspacos(descricaoInformada ?? "");
  if (!informada) return null;
  return informada === descricaoNFdoProduto(nomeDoCatalogo) ? "regra" : "manual";
}
