import { descricaoNFdoProduto, type FamiliaNF, type OrigemDescricaoNF } from "./descricaoNF";

// Prévia da nomenclatura: o que aconteceria com o catálogo se estas famílias
// fossem aplicadas agora.
//
// Existe porque mudar UMA família mexe em dezenas de produtos de uma vez —
// trocar "Campo Cirúrgico com Reforço" reescreve os 44 Campos de Mesa. Quem
// edita a regra precisa ver isso antes de salvar, não depois de a nota sair.

export type ProdutoParaPrevia = {
  id: string;
  nome: string;
  descricaoAtual: string | null;
  origem: OrigemDescricaoNF | null;
};

export type MudancaNF = {
  id: string;
  nome: string;
  de: string | null;
  para: string | null;
};

export type PreviaNF = {
  /** Produtos cuja descrição mudaria. */
  mudam: MudancaNF[];
  /** Produtos que a regra recalcula e chegam no mesmo texto de hoje. */
  inalterados: number;
  /** Produtos ajustados à mão — a regra não encosta neles. */
  protegidos: number;
  total: number;
};

/**
 * Compara o que está gravado hoje com o que as famílias produziriam.
 * Produto com descrição ajustada à mão é contado à parte e nunca entra em
 * `mudam` — essa é a garantia dada ao cliente e é aqui que ela se cumpre,
 * antes mesmo de o banco recusar a escrita.
 */
export function previaDaNomenclatura(
  produtos: ProdutoParaPrevia[],
  familias: FamiliaNF[]
): PreviaNF {
  const mudam: MudancaNF[] = [];
  let inalterados = 0;
  let protegidos = 0;

  for (const p of produtos) {
    if (p.origem === "manual") {
      protegidos++;
      continue;
    }
    const nova = descricaoNFdoProduto(p.nome, familias);
    if (nova === p.descricaoAtual) inalterados++;
    else mudam.push({ id: p.id, nome: p.nome, de: p.descricaoAtual, para: nova });
  }

  return { mudam, inalterados, protegidos, total: produtos.length };
}
