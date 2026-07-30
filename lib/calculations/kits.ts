import { Decimal, dec } from "./decimal";
import { resolverQuantidade, type Quantidade } from "./cmv";
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
  // Como o insumo é consumido. Dois casos, e a diferença é grande:
  //
  //   direta — N unidades por kit. É o envelope: um kit, um envelope.
  //   lote   — 1 ÷ itens por caixa. É a caixa de esterilização, que atende
  //            VÁRIOS kits. Lançar a caixa como "1 por kit" multiplicaria o
  //            custo pelo número de kits que cabem nela.
  //
  // A distinção veio da Intertech: nos produtos individuais o rateio já está
  // na ficha (o Campo Catarata tem 1÷150), mas no kit a quantidade por caixa
  // varia conforme o que foi montado — por isso é escolhida na hora.
  quantidade: Quantidade;
  maoDeObra?: boolean;
};

// Item de embalagem para efeito de ASSINATURA (identidade do kit).
export type ItemEmbalagem = {
  insumoId: string;
  quantidade: Quantidade;
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

  // A forma de consumo entra na assinatura, não só o número resolvido: uma
  // caixa para 3 itens vale 0,333… e uma para 6 vale 0,166… — comparar o
  // decimal arredondado poderia confundir composições diferentes. Guardando a
  // expressão ("/3" contra "/6"), a distinção é exata.
  const porInsumo = new Map<string, string>();
  for (const e of embalagem) {
    if (porInsumo.has(e.insumoId)) {
      throw new ErroCalculoBloqueante(
        `Insumo "${e.insumoId}" repetido na embalagem do kit — junte numa linha só.`
      );
    }
    const q = e.quantidade;
    let marca: string;
    if (q.tipo === "lote") {
      const lote = dec(q.tamanhoLote);
      if (lote.lte(0)) {
        throw new ErroCalculoBloqueante(
          `Itens por caixa inválido para o insumo "${e.insumoId}".`
        );
      }
      marca = `/${lote.toString()}`;
    } else {
      const qtd = resolverQuantidade(q);
      if (qtd.lte(0)) {
        throw new ErroCalculoBloqueante(`Quantidade inválida para o insumo "${e.insumoId}" na embalagem.`);
      }
      marca = qtd.toString();
    }
    porInsumo.set(e.insumoId, marca);
  }

  const parte = [...porInsumo.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, marca]) => `${id}:${marca}`)
    .join("|");

  return `${base}#emb:${parte}`;
}

export type LinhaEmbalagem = EmbalagemKit & {
  // Quantidade já resolvida (no rateio, 1 ÷ itens por caixa).
  quantidadeResolvida: Decimal;
  custo: Decimal;
  // Fração do custoTotal do kit (produtos + embalagem juntos — soma 1,0
  // somando linhasProdutos e linhasEmbalagem). Mesma ideia de LinhaFicha em
  // ficha.ts, aplicada ao kit inteiro em vez de a um produto só.
  participacao: Decimal;
};

// Quanto cada PRODUTO pesa no custo do kit — pedido do cliente em 30/07/2026:
// "não saberemos qual produto deu maior ou menor margem em cada kit". Preço
// por produto dentro do kit não existe de verdade (o cliente negocia o kit
// inteiro, não a peça); o que existe é o custo de cada um, e é isso que esta
// linha expõe.
export type LinhaProdutoKit = {
  produtoId: string;
  quantidade: Decimal;
  custoUnitario: Decimal;
  custo: Decimal;
  participacao: Decimal; // fração do custoTotal do kit
};

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
  linhasProdutos: LinhaProdutoKit[];
  linhasEmbalagem: LinhaEmbalagem[];
};

export function custoKitCompleto(
  itens: ItemKit[],
  custoPorProduto: Map<string, CustoProdutoKit>,
  embalagem: EmbalagemKit[] = []
): ResultadoCustoKit {
  let custoProdutos = new Decimal(0);
  let custoProdutosSemMO = new Decimal(0);

  // Sem a fração ainda: ela depende do custoTotal, que só existe depois de
  // somar produtos E embalagem — por isso a participação é preenchida numa
  // segunda passada, abaixo.
  const linhasProdutosSemFracao = itens.map((item) => {
    const custo = custoPorProduto.get(item.produtoId);
    if (custo === undefined) {
      throw new ErroCalculoBloqueante(
        `Produto "${item.produtoId}" sem custo vigente — kit não pode ser calculado (nunca zero silencioso).`
      );
    }
    const qtd = dec(item.quantidade);
    const cmv = dec(custo.cmv);
    const semMO = custo.cmvSemMaoDeObra === undefined ? cmv : dec(custo.cmvSemMaoDeObra);
    const custoLinha = cmv.times(qtd);
    custoProdutos = custoProdutos.plus(custoLinha);
    custoProdutosSemMO = custoProdutosSemMO.plus(semMO.times(qtd));
    return { produtoId: item.produtoId, quantidade: qtd, custoUnitario: cmv, custo: custoLinha };
  });

  const linhasEmbalagemSemFracao = embalagem.map((e) => {
    const qtd = resolverQuantidade(e.quantidade);
    if (qtd.lte(0)) {
      throw new ErroCalculoBloqueante(
        `Quantidade inválida para "${e.nome}" na embalagem do kit.`
      );
    }
    return { ...e, quantidadeResolvida: qtd, custo: dec(e.custoUnitario).times(qtd) };
  });

  const custoEmbalagem = linhasEmbalagemSemFracao.reduce((s, l) => s.plus(l.custo), new Decimal(0));
  const embalagemMaoDeObra = linhasEmbalagemSemFracao.reduce(
    (s, l) => (l.maoDeObra ? s.plus(l.custo) : s),
    new Decimal(0)
  );

  const custoTotal = custoProdutos.plus(custoEmbalagem);
  const custoTotalSemMaoDeObra = custoProdutosSemMO.plus(custoEmbalagem.minus(embalagemMaoDeObra));

  const participacao = (custo: Decimal): Decimal =>
    custoTotal.isZero() ? new Decimal(0) : custo.div(custoTotal);

  const linhasProdutos: LinhaProdutoKit[] = linhasProdutosSemFracao.map((l) => ({
    ...l,
    participacao: participacao(l.custo),
  }));
  const linhasEmbalagem: LinhaEmbalagem[] = linhasEmbalagemSemFracao.map((l) => ({
    ...l,
    participacao: participacao(l.custo),
  }));

  return {
    custoProdutos,
    custoEmbalagem,
    custoTotal,
    custoTotalSemMaoDeObra,
    custoMaoDeObra: custoTotal.minus(custoTotalSemMaoDeObra),
    linhasProdutos,
    linhasEmbalagem,
  };
}
