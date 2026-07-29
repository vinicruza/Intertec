import { Decimal, dec } from "./decimal";
import { ErroCalculoBloqueante, type EntradaDecimal } from "./types";

// ============================================================
// Assinatura única de kit (PRD §6.5 + golden test T10)
// ============================================================
//
// A assinatura identifica uma composição: os mesmos produtos nas mesmas
// quantidades geram SEMPRE a mesma assinatura, independentemente da ordem
// em que foram adicionados. Formato: "id:qtd|id:qtd", ordenado pelo id.
// Ao salvar, se a assinatura já existe, o sistema oferece reutilizar o kit
// existente em vez de duplicar (dedupe).

export type ItemKit = {
  produtoId: string;
  quantidade: EntradaDecimal;
};

export function assinaturaKit(itens: ItemKit[]): string {
  if (itens.length === 0) {
    throw new ErroCalculoBloqueante("Kit sem itens não tem assinatura.");
  }

  // Consolida itens repetidos do mesmo produto (2 + 3 do produto X = 5 de X).
  const porProduto = new Map<string, Decimal>();
  for (const item of itens) {
    const qtd = dec(item.quantidade);
    if (qtd.lte(0)) {
      throw new ErroCalculoBloqueante(`Quantidade inválida para o produto "${item.produtoId}".`);
    }
    porProduto.set(item.produtoId, (porProduto.get(item.produtoId) ?? new Decimal(0)).plus(qtd));
  }

  return [...porProduto.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    // toString() do Decimal é canônico: "2", "2.5" — nunca "2.0"
    .map(([id, qtd]) => `${id}:${qtd.toString()}`)
    .join("|");
}

// Custo do kit = soma ponderada dos componentes (Calculations.md §4):
// recebe o custo unitário vigente de cada produto (CMV ou despesa unitária).
export function custoKit(
  itens: ItemKit[],
  custoUnitarioPorProduto: Map<string, EntradaDecimal>
): Decimal {
  return itens.reduce((soma, item) => {
    const custo = custoUnitarioPorProduto.get(item.produtoId);
    if (custo === undefined) {
      throw new ErroCalculoBloqueante(
        `Produto "${item.produtoId}" sem custo vigente — kit não pode ser calculado (nunca zero silencioso).`
      );
    }
    return soma.plus(dec(custo).times(dec(item.quantidade)));
  }, new Decimal(0));
}

// ============================================================
// Embalagem e esterilização do kit (reunião Intertech 16/07/2026)
// ============================================================
//
// O erro que a empresa apontou: hoje a rentabilidade usa um "kit aleatório"
// com um valor aproximado de embalagem. Mas o envelope é UM só e a caixa de
// esterilização é UMA só POR KIT — não por produto dentro dele. Somar isso
// produto a produto multiplica um custo que na prática ocorre uma vez.
//
//   CMV_kit = Σ (CMV_produto × qtd)  +  Σ (preço_sem_imposto × qtd_por_kit)
//                    produtos                    embalagem/esterilização
//
// Na reunião também foi pedido que esse custo apareça DESTACADO, não diluído
// no total — por isso o resultado devolve as duas parcelas separadas.

export type EmbalagemKit = {
  nome: string;
  // Preço sem imposto do insumo (Camada 1), já calculado.
  custoUnitario: EntradaDecimal;
  // Quantidade consumida POR KIT (ex.: 1 envelope, 2 caixas).
  quantidade: EntradaDecimal;
  maoDeObra?: boolean;
};

// Item de embalagem para efeito de ASSINATURA (identidade do kit).
export type ItemEmbalagem = {
  insumoId: string;
  quantidade: EntradaDecimal;
};

// Assinatura completa: composição de produtos + embalagem/esterilização.
//
// Por que a embalagem entra na identidade do kit: dois kits com os mesmos
// produtos mas com 1 ou 2 caixas de esterilização têm CMV diferente. Se
// compartilhassem assinatura, colidiriam no índice único e o segundo herdaria
// o custo do primeiro — exatamente o tipo de erro silencioso que o sistema
// existe para impedir.
//
// Kits sem embalagem produzem a MESMA assinatura de antes desta mudança, então
// os kits já cadastrados seguem válidos (T10 continua valendo).
export function assinaturaKitCompleta(itens: ItemKit[], embalagem: ItemEmbalagem[] = []): string {
  const base = assinaturaKit(itens);
  if (embalagem.length === 0) return base;

  const porInsumo = new Map<string, Decimal>();
  for (const e of embalagem) {
    const qtd = dec(e.quantidade);
    if (qtd.lte(0)) {
      throw new ErroCalculoBloqueante(`Quantidade inválida para o insumo "${e.insumoId}" na embalagem.`);
    }
    porInsumo.set(e.insumoId, (porInsumo.get(e.insumoId) ?? new Decimal(0)).plus(qtd));
  }

  const parte = [...porInsumo.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, qtd]) => `${id}:${qtd.toString()}`)
    .join("|");

  return `${base}#emb:${parte}`;
}

export type LinhaEmbalagem = EmbalagemKit & { custo: Decimal };

// Custo vigente de um produto nas duas leituras (ver cascade.ts).
export type CustoProdutoKit = {
  cmv: EntradaDecimal;
  // Opcional: quando ausente, assume-se que o produto não tem mão de obra.
  cmvSemMaoDeObra?: EntradaDecimal;
};

export type ResultadoCustoKit = {
  custoProdutos: Decimal;
  custoEmbalagem: Decimal;
  custoTotal: Decimal;
  custoTotalSemMaoDeObra: Decimal;
  custoMaoDeObra: Decimal;
  linhasEmbalagem: LinhaEmbalagem[];
};

export function custoKitCompleto(
  itens: ItemKit[],
  custoPorProduto: Map<string, CustoProdutoKit>,
  embalagem: EmbalagemKit[] = []
): ResultadoCustoKit {
  let custoProdutos = new Decimal(0);
  let custoProdutosSemMO = new Decimal(0);

  for (const item of itens) {
    const custo = custoPorProduto.get(item.produtoId);
    if (custo === undefined) {
      throw new ErroCalculoBloqueante(
        `Produto "${item.produtoId}" sem custo vigente — kit não pode ser calculado (nunca zero silencioso).`
      );
    }
    const qtd = dec(item.quantidade);
    const cmv = dec(custo.cmv);
    const semMO = custo.cmvSemMaoDeObra === undefined ? cmv : dec(custo.cmvSemMaoDeObra);
    custoProdutos = custoProdutos.plus(cmv.times(qtd));
    custoProdutosSemMO = custoProdutosSemMO.plus(semMO.times(qtd));
  }

  const linhasEmbalagem: LinhaEmbalagem[] = embalagem.map((e) => {
    const qtd = dec(e.quantidade);
    if (qtd.lte(0)) {
      throw new ErroCalculoBloqueante(
        `Quantidade inválida para "${e.nome}" na embalagem do kit.`
      );
    }
    return { ...e, custo: dec(e.custoUnitario).times(qtd) };
  });

  const custoEmbalagem = linhasEmbalagem.reduce((s, l) => s.plus(l.custo), new Decimal(0));
  const embalagemMaoDeObra = linhasEmbalagem.reduce(
    (s, l) => (l.maoDeObra ? s.plus(l.custo) : s),
    new Decimal(0)
  );

  const custoTotal = custoProdutos.plus(custoEmbalagem);
  const custoTotalSemMaoDeObra = custoProdutosSemMO.plus(custoEmbalagem.minus(embalagemMaoDeObra));

  return {
    custoProdutos,
    custoEmbalagem,
    custoTotal,
    custoTotalSemMaoDeObra,
    custoMaoDeObra: custoTotal.minus(custoTotalSemMaoDeObra),
    linhasEmbalagem,
  };
}
