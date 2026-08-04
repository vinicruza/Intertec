// Nomenclatura de nota fiscal — regra combinada com o cliente em 04/08/2026.
//
// O catálogo tem UM nome por produto, e esse nome carrega detalhe de fabricação
// (gramatura GR30/GR40, matéria-prima TNT/SMS, origem "China"). Isso serve para
// custo e produção, mas não é o que deve sair impresso na nota fiscal.
//
// Aqui nasce o segundo nome, paralelo: a descrição de NF. O nome interno do
// catálogo NÃO muda — é ele que sustenta CMV, ficha técnica e histórico. Esta
// função só traduz o nome interno para o nome fiscal.
//
// Regra, em uma frase: troca o começo do nome pelo nome fiscal da família e
// apaga do resto o que não deve aparecer na nota. Tamanho, "+ Tape", "Estéril"
// e "Não Estéril" continuam — são a diferença real do que está sendo vendido.
//
// Esta rodada cobre só os Campos Cirúrgicos (categoria CC, 216 produtos), que
// foi o pedido: "começar pelos campos". Produto de outra família devolve null,
// e a tela deixa a descrição de NF em branco para alguém preencher à mão.

/** Nome fiscal de cada família, casado pelo começo do nome do catálogo. */
type RegraFamilia = {
  /** Começo do nome interno que identifica a família. */
  comeco: RegExp;
  /** Nome que passa a valer na nota fiscal. */
  nomeNF: string;
  /**
   * Steri Drape abrevia o tamanho por extenso ("Grande" → "G"), pedido do
   * cliente. As demais famílias trazem o tamanho em metros, que fica igual.
   */
  abreviarTamanho?: boolean;
};

// A ordem importa: a família genérica "Campo" tem de ficar por último, senão
// engoliria "Campo Simples", "Campo de Mesa" e todas as outras.
const FAMILIAS: RegraFamilia[] = [
  { comeco: /^campo\s+catarata\b/i, nomeNF: "Campo Cirúrgico com Adesivo e Bag" },
  { comeco: /^campo\s+com\s+fenestra\b/i, nomeNF: "Campo Cirúrgico com Fenestra" },
  { comeco: /^campo\s+com\s+adesivo\b/i, nomeNF: "Campo Cirúrgico com Adesivo" },
  { comeco: /^campo\s+de\s+mesa\b/i, nomeNF: "Campo Cirúrgico com Reforço" },
  { comeco: /^campo\s+lasik\b/i, nomeNF: "Campo Cirúrgico com Adesivo e 2 Bags" },
  { comeco: /^campo\s+simples\b/i, nomeNF: "Campo Cirúrgico Sem Fenestra" },
  { comeco: /^steri\s+drape\b/i, nomeNF: "Campo Cirúrgico Steri Drape", abreviarTamanho: true },
  // Campo Lateral, Superior, Inferior, de Mayo, Fenestra U, Laminado…: só
  // ganham a palavra "Cirúrgico", o resto do nome se mantém.
  { comeco: /^campo\b/i, nomeNF: "Campo Cirúrgico" },
];

/**
 * O que é apagado do resto do nome em TODOS os campos. Nenhum desses detalhes
 * pode variar a descrição da nota fiscal:
 *   - gramatura, escrita como "GR30", "GR 30", "GR40", "GR 40";
 *   - matéria-prima TNT e SMS;
 *   - origem do insumo ("China").
 */
const APAGAR: RegExp[] = [/\bGR\s?\d+\b/gi, /\bTNT\b/gi, /\bSMS\b/gi, /\bChina\b/gi];

/** "Grande" → "G", "Pequeno" → "P". Só vale para os Steri Drape. */
const TAMANHO_ABREVIADO: Array<[RegExp, string]> = [
  [/\bGrandes?\b/gi, "G"],
  [/\bPequenos?\b/gi, "P"],
];

function normalizarEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/**
 * Traduz o nome interno do catálogo para a descrição que sai na nota fiscal.
 * Devolve null quando o produto não é um campo cirúrgico — nesse caso não há
 * regra ainda e a descrição fica a cargo de quem cadastra.
 */
export function descricaoNFdoProduto(nomeDoCatalogo: string): string | null {
  const nome = normalizarEspacos(nomeDoCatalogo ?? "");
  if (!nome) return null;

  const familia = FAMILIAS.find((f) => f.comeco.test(nome));
  if (!familia) return null;

  let resto = nome.replace(familia.comeco, "");
  for (const padrao of APAGAR) resto = resto.replace(padrao, " ");
  if (familia.abreviarTamanho) {
    for (const [padrao, sigla] of TAMANHO_ABREVIADO) resto = resto.replace(padrao, sigla);
  }

  return normalizarEspacos(`${familia.nomeNF} ${resto}`);
}

/**
 * Como a descrição de NF de um produto foi escrita: pela regra acima ou à mão.
 * Existe para que uma nova rodada da regra — quando entrarem aventais, campos
 * novos etc. — nunca apague em silêncio um texto que a Intertech ajustou.
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
