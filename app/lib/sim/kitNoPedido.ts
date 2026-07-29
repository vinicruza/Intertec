import {
  assinaturaKitCompleta,
  custoKitCompleto,
  type CustoProdutoKit,
  type EmbalagemKit,
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
export type EmbalagemDoKit = { insumoId: string; quantidade: string };

export type CatalogoParaKit = {
  custoPorProduto: Map<string, CustoProdutoKit>;
  // Preço sem imposto e flag de mão de obra de cada insumo de embalagem.
  insumoPorId: Map<string, { nome: string; precoSemImposto: string | null; maoDeObra: boolean }>;
  // Assinatura → kit já cadastrado.
  kitPorAssinatura: Map<string, { id: string; codigo: string; nome: string }>;
};

export type KitResolvido = {
  assinatura: string;
  cmvUnitario: string | null; // null = algum produto sem custo vigente
  custoProdutos: string | null;
  custoEmbalagem: string | null;
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
    kitExistente: null,
    erro: null,
  };

  const produtos = limpar(produtosBrutos, "produtoId");
  if (produtos.length === 0) {
    return { ...vazio, erro: "Inclua ao menos um produto no kit." };
  }
  const embalagem = limpar(embalagemBruta, "insumoId");

  let assinatura: string;
  try {
    assinatura = assinaturaKitCompleta(produtos, embalagem);
  } catch (e) {
    return { ...vazio, erro: e instanceof Error ? e.message : "Composição inválida." };
  }

  const linhasEmbalagem: EmbalagemKit[] = embalagem.flatMap((e) => {
    const insumo = catalogo.insumoPorId.get(e.insumoId);
    if (!insumo?.precoSemImposto) return [];
    return [{
      nome: insumo.nome,
      custoUnitario: insumo.precoSemImposto,
      quantidade: e.quantidade,
      maoDeObra: insumo.maoDeObra,
    }];
  });

  const kitExistente = catalogo.kitPorAssinatura.get(assinatura) ?? null;

  try {
    const r = custoKitCompleto(produtos, catalogo.custoPorProduto, linhasEmbalagem);
    return {
      assinatura,
      cmvUnitario: r.custoTotal.toString(),
      custoProdutos: r.custoProdutos.toString(),
      custoEmbalagem: r.custoEmbalagem.toString(),
      kitExistente,
      erro: null,
    };
  } catch {
    // Produto sem custo vigente: a assinatura e o aviso de duplicidade ainda
    // valem, mas o CMV fica nulo — e o motor barra o pedido no cálculo (T9).
    return { ...vazio, assinatura, kitExistente };
  }
}
