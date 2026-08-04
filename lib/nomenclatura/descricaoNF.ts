// Nomenclatura de nota fiscal — regra combinada com o cliente em 04/08/2026.
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
//
// As famílias NÃO moram mais aqui: vêm da tabela `nf_naming_rules`, editável
// em Cadastros → Nomenclatura NF. Esta função continua pura — recebe a
// configuração por parâmetro e não sabe que existe banco de dados.

/** Uma família: o começo do nome no catálogo e o nome que vale na nota. */
export type FamiliaNF = {
  /** Começo do nome no catálogo, texto puro. Ex.: "Campo de Mesa". */
  comeco: string;
  /** Nome que passa a valer na nota fiscal. Ex.: "Campo Cirúrgico com Reforço". */
  nomeNF: string;
  /** Apaga gramatura, nos dois formatos que o catálogo usa: "GR30" e "30g". */
  apagarGramatura: boolean;
  apagarTNT: boolean;
  apagarSMS: boolean;
  /** Apaga a origem do insumo — hoje só "China", nos Campos Catarata. */
  apagarOrigem: boolean;
  /** Trocas de palavra: "Tag" → "Toalha", "Grande" → "G". */
  trocas: Array<{ de: string; para: string }>;
  /**
   * Ordem em que as famílias são testadas. A genérica ("Campo", "Avental")
   * precisa vir DEPOIS das específicas, senão engole todas elas.
   */
  ordem: number;
};

const GRAMATURA_GR = /\bGR\s?\d+\b/gi; // GR30, GR 40 — formato dos campos
const GRAMATURA_G = /\b\d+\s?g\b/gi; //  30g, 40 g   — formato dos aventais
const TNT = /\bTNT\b/gi;
const SMS = /\bSMS\b/gi;
const ORIGEM = /\bChina\b/gi;

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Transforma o começo digitado ("Campo de Mesa") no padrão que casa com o nome
 * do catálogo. Espaço vira "um ou mais espaços" porque o catálogo tem nomes com
 * espaço duplo, e a comparação ignora maiúsculas — "Campo de mesa" e
 * "Campo de Mesa" são a mesma família.
 */
function padraoDoComeco(comeco: string): RegExp {
  const palavras = comeco.trim().split(/\s+/).map(escaparRegex).join("\\s+");
  return new RegExp(`^${palavras}\\b`, "i");
}

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Traduz o nome interno do catálogo para a descrição que sai na nota fiscal.
 * Produto de família sem regra própria sai com o próprio nome do catálogo.
 * Devolve null só para nome vazio — aí não há o que descrever.
 */
export function descricaoNFdoProduto(nomeDoCatalogo: string, familias: FamiliaNF[]): string | null {
  const nome = normalizarEspacos(nomeDoCatalogo ?? "");
  if (!nome) return null;

  const ordenadas = [...familias].sort((a, b) => a.ordem - b.ordem);
  const familia = ordenadas.find((f) => f.comeco.trim() && padraoDoComeco(f.comeco).test(nome));
  if (!familia) return nome;

  let resto = nome.replace(padraoDoComeco(familia.comeco), "");
  if (familia.apagarGramatura) resto = resto.replace(GRAMATURA_GR, " ").replace(GRAMATURA_G, " ");
  if (familia.apagarTNT) resto = resto.replace(TNT, " ");
  if (familia.apagarSMS) resto = resto.replace(SMS, " ");
  if (familia.apagarOrigem) resto = resto.replace(ORIGEM, " ");
  for (const t of familia.trocas) {
    if (!t.de.trim()) continue;
    resto = resto.replace(new RegExp(`\\b${escaparRegex(t.de.trim())}\\b`, "gi"), t.para);
  }

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
  descricaoInformada: string,
  familias: FamiliaNF[]
): OrigemDescricaoNF | null {
  const informada = normalizarEspacos(descricaoInformada ?? "");
  if (!informada) return null;
  return informada === descricaoNFdoProduto(nomeDoCatalogo, familias) ? "regra" : "manual";
}
