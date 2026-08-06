import type { ItemPedido } from "@calc";
import { numeroDigitado } from "../format";
import {
  resolverKitDoPedido,
  type CatalogoParaKit,
  type LinhaCustoEmbalagemKit,
  type LinhaCustoKit,
  type ModoEmbalagem,
} from "./kitNoPedido";
import type { ItemSimulacao } from "../db/pedidos";

// ============================================================
// Das linhas da tela para os itens do pedido
// ============================================================
//
// Tudo o que transforma "o que o vendedor digitou" em "itens da cotação"
// morava dentro do SimuladorPage. Era a parte do fluxo de venda com mais
// decisão de negócio e nenhum teste: qual linha vira produto, qual vira kit de
// catálogo, qual vira kit montado na hora, e quando a cotação inteira está
// bloqueada. A regra do projeto proíbe cálculo dentro de componente de tela —
// e, mais importante, o que não sai da tela não pode ser testado.

// Opção do <select> que abre o montador de kit dentro do próprio pedido
// (reunião 16/07/2026: o kit nasce no pedido, não numa tela separada).
export const KIT_NOVO = "__kit_novo__";

export type KitNovoEdicao = {
  rotulo: string;
  produtos: Array<{ produtoId: string; quantidade: string }>;
  embalagem: Array<{ insumoId: string; modo: ModoEmbalagem; quantidade: string }>;
};

export type LinhaItem = {
  itemId: string;
  quantidade: string;
  preco: string;
  kitNovo: KitNovoEdicao | null;
};

// Só o que a montagem precisa saber de um item vendável do catálogo.
export type ItemVendavelResumo = {
  tipo: "produto" | "kit";
  id: string;
  nome: string;
  cmvUnitario: string | null;
};

// O que a linha representa depois de resolvida: nome, CMV unitário e, quando é
// kit montado na hora, a assinatura e o kit de catálogo que já tem essa mesma
// composição (para avisar em vez de duplicar).
export type LinhaResolvida = {
  nome: string;
  cmvUnitario: string | null;
  assinatura: string | null;
  kitExistente: { id: string; codigo: string; nome: string; ativo?: boolean } | null;
  erro: string | null;
  // Peso de custo por produto/embalagem — só existe quando a linha é um kit
  // montado na hora. Pedido do cliente em 30/07/2026, ver kitNoPedido.ts.
  linhasProdutos: LinhaCustoKit[];
  linhasEmbalagem: LinhaCustoEmbalagemKit[];
};

export function resolverLinhaDoPedido(
  linha: LinhaItem,
  itensVendaveis: ItemVendavelResumo[],
  catalogo: CatalogoParaKit
): LinhaResolvida | null {
  if (linha.itemId && linha.itemId !== KIT_NOVO) {
    const item = itensVendaveis.find((i) => i.id === linha.itemId);
    if (!item) return null;
    return {
      nome: item.nome,
      cmvUnitario: item.cmvUnitario,
      assinatura: null,
      kitExistente: null,
      erro: null,
      linhasProdutos: [],
      linhasEmbalagem: [],
    };
  }

  if (linha.itemId !== KIT_NOVO || !linha.kitNovo) return null;

  const r = resolverKitDoPedido(linha.kitNovo.produtos, linha.kitNovo.embalagem, catalogo);
  return {
    nome: linha.kitNovo.rotulo.trim() || "Kit montado no pedido",
    cmvUnitario: r.cmvUnitario,
    assinatura: r.assinatura || null,
    kitExistente: r.kitExistente,
    erro: r.erro,
    linhasProdutos: r.linhasProdutos,
    linhasEmbalagem: r.linhasEmbalagem,
  };
}

// ---------- Itens para o motor de cálculo ----------

export type ItensParaMotor =
  // Falta escolher item, quantidade ou preço: não há o que calcular ainda.
  | { estado: "incompleto" }
  // Alguma linha tem problema que impede o pedido inteiro (kit sem produto,
  // composição inválida). Nunca calcula "o resto" ignorando a linha ruim.
  | { estado: "bloqueado"; msg: string }
  | { estado: "ok"; itens: ItemPedido[] };

const numero = numeroDigitado;

export function montarItensParaMotor(
  linhas: LinhaItem[],
  resolvidas: Array<LinhaResolvida | null>
): ItensParaMotor {
  const escolhidas = linhas
    .map((linha, i) => ({ linha, resolvida: resolvidas[i] }))
    .filter((x) => x.resolvida && x.linha.quantidade.trim() !== "" && x.linha.preco.trim() !== "");
  if (escolhidas.length === 0) return { estado: "incompleto" };

  const comErro = escolhidas.find((x) => x.resolvida!.erro);
  if (comErro) return { estado: "bloqueado", msg: comErro.resolvida!.erro! };

  return {
    estado: "ok",
    itens: escolhidas.map(({ linha, resolvida }) => ({
      nome: resolvida!.nome,
      precoVenda: numero(linha.preco),
      quantidade: numero(linha.quantidade),
      // CMV nulo vira "0" de propósito: é o motor quem barra (T9, erro
      // bloqueante), com a mensagem que nomeia o item. Nunca zero silencioso.
      cmvUnitario: resolvida!.cmvUnitario ?? "0",
      despesaUnitaria: "0",
    })),
  };
}

// ---------- Itens para gravar a cotação ----------
//
// Três destinos possíveis para uma linha:
//   produto  — item de catálogo;
//   kit      — kit de catálogo, OU kit montado na hora cuja composição JÁ
//              existe (aí usa o código que já existe, não cria outro igual);
//   kitNovo  — composição inédita, que só vira kit de catálogo com código
//              oficial quando o pedido for ganho (reunião 16/07/2026).
export function montarItensDaCotacao(
  linhas: LinhaItem[],
  resolvidas: Array<LinhaResolvida | null>,
  itensVendaveis: ItemVendavelResumo[]
): ItemSimulacao[] {
  return linhas.flatMap((l, i): ItemSimulacao[] => {
    const r = resolvidas[i];
    if (!r || l.quantidade.trim() === "" || l.preco.trim() === "") return [];

    // Kit montado na hora cuja composição já existe: usa o kit de catálogo
    // em vez de criar outro igual (o código é o mesmo, por decisão).
    if (l.itemId === KIT_NOVO && r.kitExistente) {
      return [{ tipo: "kit", refId: r.kitExistente.id, quantidade: l.quantidade, precoVenda: l.preco }];
    }

    if (l.itemId === KIT_NOVO && l.kitNovo && r.assinatura) {
      return [{
        tipo: "kitNovo",
        refId: "",
        quantidade: l.quantidade,
        precoVenda: l.preco,
        kitNovo: {
          assinatura: r.assinatura,
          rotulo: r.nome,
          composicao: l.kitNovo.produtos
            .filter((p) => p.produtoId && p.quantidade.trim() !== "")
            .map((p) => ({ produtoId: p.produtoId, quantidade: numero(p.quantidade) })),
          embalagem: l.kitNovo.embalagem
            .filter((e) => e.insumoId && e.quantidade.trim() !== "")
            .map((e) => ({ insumoId: e.insumoId, modo: e.modo, quantidade: numero(e.quantidade) })),
        },
      }];
    }

    const item = itensVendaveis.find((it) => it.id === l.itemId);
    if (!item) return [];
    return [{ tipo: item.tipo, refId: item.id, quantidade: l.quantidade, precoVenda: l.preco }];
  });
}

// ---------- Kit montado no pedido, visto de fora do simulador ----------
//
// Entre salvar a cotação e ganhar o pedido, o kit montado na hora NÃO tem
// registro em `kits`: mora nas colunas ad_hoc_* do item. Quem lê o pedido
// depois (a fila de aprovação, o detalhe, a ficha impressa) precisa do mesmo
// nome e do mesmo CMV que o simulador mostrou — senão o aprovador vê um item
// sem nome e sem custo, e é justamente o custo que ele foi chamado para
// conferir.
export type ItemAdHocDoPedido = {
  ad_hoc_kit_composition: Array<{ product_id: string; quantity: string }> | null;
  ad_hoc_kit_packaging: Array<{
    input_id: string;
    quantity_type: "direct" | "lot";
    quantity: string | null;
    lot_size: string | null;
  }> | null;
  ad_hoc_kit_label: string | null;
};

export type KitAdHocResolvido = {
  nome: string;
  cmvUnitario: string | null; // null = algum produto sem custo vigente
  composicao: Array<{ produtoId: string; nome: string; quantidade: string; cmvUnitario: string }>;
};

export function resolverKitAdHocDoPedido(
  item: ItemAdHocDoPedido,
  catalogo: CatalogoParaKit,
  nomePorProduto: Map<string, string>
): KitAdHocResolvido {
  const nome = item.ad_hoc_kit_label?.trim() || "Kit montado no pedido";
  const composicaoBruta = (item.ad_hoc_kit_composition ?? []).map((c) => ({
    produtoId: c.product_id,
    quantidade: String(c.quantity),
  }));

  const r = resolverKitDoPedido(
    composicaoBruta,
    (item.ad_hoc_kit_packaging ?? []).map((e) => ({
      insumoId: e.input_id,
      modo: (e.quantity_type === "lot" ? "itensPorCaixa" : "porKit") as ModoEmbalagem,
      quantidade: String(e.quantity_type === "lot" ? e.lot_size : e.quantity),
    })),
    catalogo
  );

  // A composição expandida é o que a ficha imprime item por item (é dessa
  // lista que sai o lançamento da nota) e o que vira kit_composition_snapshot.
  const composicao =
    r.linhasProdutos.length > 0
      ? r.linhasProdutos.map((l) => ({
          produtoId: l.produtoId,
          nome: nomePorProduto.get(l.produtoId) ?? l.produtoId,
          quantidade: l.quantidade,
          cmvUnitario: l.custoUnitario,
        }))
      : composicaoBruta.map((c) => ({
          produtoId: c.produtoId,
          nome: nomePorProduto.get(c.produtoId) ?? c.produtoId,
          quantidade: c.quantidade,
          cmvUnitario: "0",
        }));

  return { nome, cmvUnitario: r.cmvUnitario, composicao };
}
