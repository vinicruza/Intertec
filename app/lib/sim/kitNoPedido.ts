import {
  assinaturaKitCompleta,
  custoKitCompleto,
  type CustoProdutoKit,
  type EmbalagemKit,
  type ItemEmbalagem,
  type Quantidade,
} from "@calc";

// ============================================================
// Kit montado dentro do pedido (reunião Intertech 16/07/2026)
// ============================================================
//
// Antes eram duas telas: criar o kit e depois puxar o código no simulador.
// A decisão inverteu — o kit nasce dentro do pedido, e o código oficial só é
// gerado quando o pedido é ganho. Enquanto isso, o sistema precisa de duas
// coisas em tempo real:
//
//  1. o CMV daquela composição, para a margem aparecer na hora;
//  2. o aviso de que aquela composição JÁ EXISTE no catálogo — pedido
//     explícito: "a hora que ela jogar ali, o próprio sistema acusasse que
//     aquele kit já existe".
//
// Fica aqui, e não na tela, porque a regra do projeto proíbe cálculo
// financeiro dentro de componente.

export type ProdutoDoKit = { produtoId: string; quantidade: string };

// A embalagem tem dois modos, e a diferença muda o custo em ordem de grandeza:
//
//   "porKit"      — N unidades por kit. É o envelope.
//   "itensPorCaixa" — a caixa atende N kits, então cada um leva 1÷N dela.
//
// Veio do retorno da Intertech: no kit, a quantidade por caixa varia conforme
// o que foi montado, por isso é escolhida na hora de montar.
export type ModoEmbalagem = "porKit" | "itensPorCaixa";
export type EmbalagemDoKit = { insumoId: string; modo: ModoEmbalagem; quantidade: string };

export type CatalogoParaKit = {
  custoPorProduto: Map<string, CustoProdutoKit>;
  // Preço sem imposto e flag de mão de obra de cada insumo de embalagem.
  insumoPorId: Map<string, { nome: string; precoSemImposto: string | null; maoDeObra: boolean }>;
  // Assinatura → kit já cadastrado.
  kitPorAssinatura: Map<string, { id: string; codigo: string; nome: string }>;
};

// Peso de cada produto no custo do kit — pedido do cliente em 30/07/2026:
// "não saberemos qual produto deu maior ou menor margem em cada kit". Não é
// preço por produto (isso não existe: o cliente negocia o kit inteiro, não a
// peça); é participação de CUSTO, que aponta o mesmo problema — qual item
// está pesando mais — sem inventar um preço que não existe.
export type LinhaCustoKit = {
  produtoId: string;
  quantidade: string;
  custoUnitario: string;
  custo: string;
  participacao: string; // fração do custo total do kit (produtos + embalagem)
};

export type LinhaCustoEmbalagemKit = {
  insumoId: string;
  nome: string;
  custo: string;
  participacao: string;
};

export type KitResolvido = {
  assinatura: string;
  cmvUnitario: string | null; // null = algum produto sem custo vigente
  custoProdutos: string | null;
  custoEmbalagem: string | null;
  // Vazio quando há erro ou algum produto sem custo vigente — a mesma regra
  // de "nunca zero silencioso" vale para a participação.
  linhasProdutos: LinhaCustoKit[];
  linhasEmbalagem: LinhaCustoEmbalagemKit[];
  kitExistente: { id: string; codigo: string; nome: string } | null;
  erro: string | null;
};

// Normaliza o que veio da tela: descarta linhas em branco e troca vírgula por
// ponto, que é como o motor recebe número.
function limpar<T extends { quantidade: string }>(linhas: T[], chave: keyof T): T[] {
  return linhas
    .filter((l) => String(l[chave] ?? "").trim() !== "" && l.quantidade.trim() !== "")
    .map((l) => ({ ...l, quantidade: l.quantidade.trim().replace(",", ".") }));
}

export function resolverKitDoPedido(
  produtosBrutos: ProdutoDoKit[],
  embalagemBruta: EmbalagemDoKit[],
  catalogo: CatalogoParaKit
): KitResolvido {
  const vazio: KitResolvido = {
    assinatura: "",
    cmvUnitario: null,
    custoProdutos: null,
    custoEmbalagem: null,
    linhasProdutos: [],
    linhasEmbalagem: [],
    kitExistente: null,
    erro: null,
  };

  const produtos = limpar(produtosBrutos, "produtoId");
  if (produtos.length === 0) {
    return { ...vazio, erro: "Inclua ao menos um produto no kit." };
  }
  const embalagem = limpar(embalagemBruta, "insumoId");

  const quantidadeDe = (e: EmbalagemDoKit): Quantidade =>
    e.modo === "itensPorCaixa"
      ? { tipo: "lote", tamanhoLote: e.quantidade }
      : { tipo: "direta", quantidade: e.quantidade };

  const paraAssinatura: ItemEmbalagem[] = embalagem.map((e) => ({
    insumoId: e.insumoId,
    quantidade: quantidadeDe(e),
  }));

  let assinatura: string;
  try {
    assinatura = assinaturaKitCompleta(produtos, paraAssinatura);
  } catch (e) {
    return { ...vazio, erro: e instanceof Error ? e.message : "Composição inválida." };
  }

  // insumoId fica de lado (EmbalagemKit não carrega essa chave — é a
  // identidade do PEDIDO, não do cálculo). Guardado em paralelo para religar
  // depois, na mesma ordem, ao resultado de custoKitCompleto.
  const embalagemValida = embalagem.flatMap((e) => {
    const insumo = catalogo.insumoPorId.get(e.insumoId);
    if (!insumo?.precoSemImposto) return [];
    return [{
      insumoId: e.insumoId,
      item: {
        nome: insumo.nome,
        custoUnitario: insumo.precoSemImposto,
        quantidade: quantidadeDe(e),
        maoDeObra: insumo.maoDeObra,
      } satisfies EmbalagemKit,
    }];
  });
  const linhasEmbalagem: EmbalagemKit[] = embalagemValida.map((x) => x.item);

  const kitExistente = catalogo.kitPorAssinatura.get(assinatura) ?? null;

  try {
    const r = custoKitCompleto(produtos, catalogo.custoPorProduto, linhasEmbalagem);
    return {
      assinatura,
      cmvUnitario: r.custoTotal.toString(),
      custoProdutos: r.custoProdutos.toString(),
      custoEmbalagem: r.custoEmbalagem.toString(),
      linhasProdutos: r.linhasProdutos.map((l) => ({
        produtoId: l.produtoId,
        quantidade: l.quantidade.toString(),
        custoUnitario: l.custoUnitario.toString(),
        custo: l.custo.toString(),
        participacao: l.participacao.toString(),
      })),
      linhasEmbalagem: r.linhasEmbalagem.map((l, i) => ({
        insumoId: embalagemValida[i].insumoId,
        nome: l.nome,
        custo: l.custo.toString(),
        participacao: l.participacao.toString(),
      })),
      kitExistente,
      erro: null,
    };
  } catch {
    // Produto sem custo vigente: a assinatura e o aviso de duplicidade ainda
    // valem, mas o CMV fica nulo — e o motor barra o pedido no cálculo (T9).
    return { ...vazio, assinatura, kitExistente };
  }
}
