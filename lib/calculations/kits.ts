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
  //
  // Opcional porque nem sempre o preço chega até aqui: o Comercial não tem
  // acesso à tabela de insumos (decisão de acesso registrada na RLS), então
  // para ele o custo da linha vem PRONTO do servidor em `custoResolvido`.
  // Uma das duas precisa existir — sem nenhuma, o cálculo bloqueia em vez de
  // tratar a linha como zero.
  custoUnitario?: EntradaDecimal;
  // Custo da linha já multiplicado pela quantidade, calculado no servidor.
  // Quando presente, manda: não há preço unitário para multiplicar aqui.
  custoResolvido?: EntradaDecimal;
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
    if (e.custoResolvido === undefined && e.custoUnitario === undefined) {
      throw new ErroCalculoBloqueante(
        `Embalagem "${e.nome}" sem custo — o kit não pode ser calculado (nunca zero silencioso).`
      );
    }
    const custo =
      e.custoResolvido !== undefined ? dec(e.custoResolvido) : dec(e.custoUnitario!).times(qtd);
    return { ...e, quantidadeResolvida: qtd, custo };
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

// ============================================================
// As duas parcelas do CMV de um kit já vendido
// ============================================================
//
// Calculations.md §4.1: "A parcela de embalagem deve ser exibida DESTACADA,
// não diluída no total — pedido explícito na reunião."
//
// Num pedido, o CMV do kit chega como um número só (`cmv_unit_snapshot`), com
// a composição expandida ao lado — produto, quantidade e o CMV de cada um no
// momento da venda. As duas parcelas saem daí:
//
//     produtos  = Σ (cmvUnitario × quantidade)   ← a composição congelada
//     embalagem = CMV do kit − produtos          ← envelope, caixa, esterilização
//
// Não é uma reconstrução do cálculo: é a mesma conta de `custoKitCompleto`
// lida ao contrário, sobre os números que ficaram gravados. Por isso serve
// para pedido fechado sem violar a imutabilidade (D7) — nada é recalculado,
// só separado.
//
// Nasceu de 02/09/2026: um pedido com CMV R$ 15,38 maior que o da planilha, e
// a diferença inteira estava na embalagem do kit (envelope 30x50 contra 30x40,
// caixa e esterilização rateadas por 20 contra 30). Na tela, o CMV era um
// número só — não havia como ver isso sem abrir o banco.
export type ComponenteDoKitVendido = {
  quantidade: EntradaDecimal;
  // Snapshots antigos foram gravados sem o CMV de cada componente. Sem ele a
  // parcela não é derivável, e inventar um número seria pior do que não mostrar.
  cmvUnitario?: EntradaDecimal | null;
};

export type ParcelasDoCmvDoKit = { produtos: Decimal; embalagem: Decimal };

export function parcelasDoCmvDoKit(
  cmvUnitarioDoKit: EntradaDecimal | null | undefined,
  composicao: ComponenteDoKitVendido[] | null | undefined
): ParcelasDoCmvDoKit | null {
  if (cmvUnitarioDoKit == null || composicao == null || composicao.length === 0) return null;

  let produtos = new Decimal(0);
  for (const c of composicao) {
    if (c.cmvUnitario == null || c.cmvUnitario === "") return null;
    try {
      produtos = produtos.plus(dec(c.cmvUnitario).times(dec(c.quantidade)));
    } catch {
      return null;
    }
  }

  let total: Decimal;
  try {
    total = dec(cmvUnitarioDoKit);
  } catch {
    return null;
  }

  const embalagem = total.minus(produtos);
  // Embalagem negativa significa que o CMV gravado e a composição gravada vêm
  // de momentos diferentes — a conta não fecha, e a tela não deve fingir que
  // fecha. Some, em vez de exibir uma parcela impossível.
  if (embalagem.isNegative()) return null;
  return { produtos, embalagem };
}

// As mesmas duas parcelas, agora do PEDIDO inteiro — é o que a folha imprime
// embaixo da linha do CMV. Item que não é kit entra inteiro em "produtos": a
// embalagem de um produto avulso já está dentro da ficha técnica dele, e não é
// consumida uma vez por kit.
export type ItemComCmvDoPedido = {
  quantidade: EntradaDecimal;
  cmvUnitario: EntradaDecimal | null | undefined;
  // null/vazio = não é kit.
  composicaoKit?: ComponenteDoKitVendido[] | null;
};

export function parcelasDoCmvDoPedido(
  itens: ItemComCmvDoPedido[] | null | undefined
): ParcelasDoCmvDoKit | null {
  if (itens == null || itens.length === 0) return null;

  let produtos = new Decimal(0);
  let embalagem = new Decimal(0);
  let temKit = false;

  for (const item of itens) {
    if (item.cmvUnitario == null || item.cmvUnitario === "") return null;
    let qtd: Decimal;
    let cmv: Decimal;
    try {
      qtd = dec(item.quantidade);
      cmv = dec(item.cmvUnitario);
    } catch {
      return null;
    }

    const ehKit = item.composicaoKit != null && item.composicaoKit.length > 0;
    if (!ehKit) {
      produtos = produtos.plus(cmv.times(qtd));
      continue;
    }

    const parcelas = parcelasDoCmvDoKit(cmv, item.composicaoKit);
    // Um kit que não se deixa separar (snapshot antigo, sem o CMV dos
    // componentes) invalida o total: metade separada e metade não seria um
    // número que não quer dizer nada.
    if (parcelas === null) return null;
    temKit = true;
    produtos = produtos.plus(parcelas.produtos.times(qtd));
    embalagem = embalagem.plus(parcelas.embalagem.times(qtd));
  }

  // Pedido sem kit nenhum não tem parcela de embalagem para destacar.
  if (!temKit) return null;
  return { produtos, embalagem };
}
