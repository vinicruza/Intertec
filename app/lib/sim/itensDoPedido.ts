import { dec, type ItemPedido } from "@calc";
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

function nomeNormalizado(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function produtoKitAleatorioExigeComposicao(item: ItemVendavelResumo): boolean {
  return item.tipo === "produto" && nomeNormalizado(item.nome) === "kit aleatorio";
}

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
    if (produtoKitAleatorioExigeComposicao(item)) {
      return {
        nome: item.nome,
        cmvUnitario: item.cmvUnitario,
        assinatura: null,
        kitExistente: null,
        erro: "Kit Aleatório precisa ser montado pelo botão + Montar kit, com a composição informada. Não salve como produto simples.",
        linhasProdutos: [],
        linhasEmbalagem: [],
      };
    }
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

export type LinhaResumoComercial = {
  nome: string;
  quantidade: ReturnType<typeof dec>;
  precoUnitario: ReturnType<typeof dec>;
  subtotal: ReturnType<typeof dec>;
};

export function resumoComercialDasLinhas(
  linhas: LinhaItem[],
  resolvidas: Array<LinhaResolvida | null>
): { linhas: LinhaResumoComercial[]; subtotal: ReturnType<typeof dec> } {
  const linhasResumo = linhas.flatMap((linha, i) => {
    const resolvida = resolvidas[i];
    if (!resolvida || resolvida.erro || linha.quantidade.trim() === "" || linha.preco.trim() === "") return [];

    try {
      const quantidade = dec(numero(linha.quantidade));
      const precoUnitario = dec(numero(linha.preco));
      return [{
        nome: resolvida.nome,
        quantidade,
        precoUnitario,
        subtotal: precoUnitario.times(quantidade),
      }];
    } catch {
      return [];
    }
  });

  return {
    linhas: linhasResumo,
    subtotal: linhasResumo.reduce((s, l) => s.plus(l.subtotal), dec("0")),
  };
}

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

// ---------- O kit precisa de nome ----------
//
// O campo era opcional, e sem ele o kit entrava no catálogo como "Kit do
// pedido". Alguns pedidos depois, o catálogo tem meia dúzia de kits com o
// mesmo nome e ninguém sabe qual é qual — sendo que quem montou sabia
// exatamente para quem era. Custa uma linha digitada e evita um catálogo
// impossível de ler.
export function kitsSemNome(linhas: LinhaItem[]): number[] {
  return linhas.flatMap((l, i) =>
    l.itemId === KIT_NOVO && l.kitNovo && l.kitNovo.rotulo.trim() === "" ? [i] : []
  );
}

export function pendenciasDosKits(
  linhas: LinhaItem[],
  resolvidas: Array<LinhaResolvida | null>
): string[] {
  return linhas.flatMap((linha, i) => {
    if (linha.itemId !== KIT_NOVO || !linha.kitNovo) return [];
    const numeroLinha = i + 1;
    const pendencias: string[] = [];

    if (linha.kitNovo.rotulo.trim() === "") {
      pendencias.push(`Item ${numeroLinha}: informe o nome do kit.`);
    }

    const produtosPreenchidos = linha.kitNovo.produtos.filter((p) => p.produtoId && p.quantidade.trim() !== "");
    const produtoParcial = linha.kitNovo.produtos.some(
      (p) => (p.produtoId && p.quantidade.trim() === "") || (!p.produtoId && p.quantidade.trim() !== "")
    );
    if (produtoParcial) {
      pendencias.push(`Item ${numeroLinha}: complete produto e quantidade em todas as linhas do kit.`);
    }
    if (produtosPreenchidos.length === 0) {
      pendencias.push(`Item ${numeroLinha}: inclua ao menos um produto no kit.`);
    }

    const embalagemParcial = linha.kitNovo.embalagem.some(
      (e) => (e.insumoId && e.quantidade.trim() === "") || (!e.insumoId && e.quantidade.trim() !== "")
    );
    if (embalagemParcial) {
      pendencias.push(`Item ${numeroLinha}: complete insumo e quantidade nas linhas de embalagem.`);
    }

    const erro = resolvidas[i]?.erro;
    if (erro && !pendencias.some((p) => p.toLowerCase().includes(erro.toLowerCase()))) {
      pendencias.push(`Item ${numeroLinha}: ${erro}`);
    }

    return pendencias;
  });
}

// Sugestão de nome a partir da composição, para o campo não começar vazio.
// É só um ponto de partida — quem monta troca por "Kit catarata Hospital X".
export function nomeSugeridoParaKit(
  kit: KitNovoEdicao,
  nomePorProduto: Map<string, string>
): string {
  const partes = kit.produtos
    .filter((p) => p.produtoId && p.quantidade.trim() !== "")
    .map((p) => `${numero(p.quantidade)}× ${nomePorProduto.get(p.produtoId) ?? "produto"}`);
  return partes.length === 0 ? "" : `Kit ${partes.join(" + ")}`;
}

// Frase de conferência acima da cascata: separa o que é a RECEITA do kit (o
// que entra em um) do que é a VENDA (quantos kits saem). As duas quantidades
// ficam a poucos centímetros uma da outra na tela, e trocar uma pela outra é o
// erro mais fácil de cometer aqui.
export function resumoDoKit(
  kit: KitNovoEdicao,
  quantidadeVendida: string,
  nomePorProduto: Map<string, string>
): string | null {
  const produtos = kit.produtos.filter((p) => p.produtoId && p.quantidade.trim() !== "");
  if (produtos.length === 0) return null;
  const dentro = produtos
    .map((p) => `${numero(p.quantidade)}× ${nomePorProduto.get(p.produtoId) ?? "?"}`)
    .join(" + ");
  const qtd = quantidadeVendida.trim();
  return qtd === "" ? `1 kit = ${dentro}` : `1 kit = ${dentro} · vendendo ${qtd} kits`;
}

export type ResumoFinanceiroLinhaKit = {
  quantidadeKits: string;
  precoPorKit: string;
  receitaTotal: string;
  cmvPorKit: string;
  cmvTotal: string;
};

export function resumoFinanceiroLinhaKit(
  quantidadeVendida: string,
  precoPorKit: string,
  cmvPorKit: string | null | undefined
): ResumoFinanceiroLinhaKit | null {
  const quantidade = numero(quantidadeVendida);
  const preco = numero(precoPorKit);
  const cmv = numero(cmvPorKit);
  if (!quantidade || !preco || !cmv) return null;

  try {
    const qtd = dec(quantidade);
    const precoUnitario = dec(preco);
    const cmvUnitario = dec(cmv);
    return {
      quantidadeKits: qtd.toString(),
      precoPorKit: precoUnitario.toString(),
      receitaTotal: precoUnitario.times(qtd).toString(),
      cmvPorKit: cmvUnitario.toString(),
      cmvTotal: cmvUnitario.times(qtd).toString(),
    };
  } catch {
    return null;
  }
}

// ---------- Partir de um kit que já existe ----------
//
// Montar "o kit catarata mais uma compressa" obrigava a escolher tudo de novo,
// produto por produto. Carregar a composição de um kit do catálogo no montador
// resolve — e o aviso de composição repetida cuida do resto: se a pessoa não
// mudar nada, o sistema avisa que aquele kit já existe e usa o código dele.
export type KitParaCopiar = {
  id: string;
  codigo: string;
  nome: string;
  produtos: Array<{ produtoId: string; quantidade: string }>;
  embalagem: Array<{ insumoId: string; modo: ModoEmbalagem; quantidade: string }>;
};

export function kitNovoAPartirDe(base: KitParaCopiar): KitNovoEdicao {
  return {
    // O nome NÃO é copiado: um kit com a mesma composição e o mesmo nome do
    // original seria indistinguível na lista. Quem copia está montando outra
    // coisa — o nome é dele.
    rotulo: "",
    produtos: base.produtos.map((p) => ({ ...p })),
    embalagem: base.embalagem.map((e) => ({ ...e })),
  };
}

// ---------- Itens para gravar a cotação ----------
//
// Três destinos possíveis para uma linha:
//   produto  — item de catálogo;
//   kit      — kit de catálogo, OU kit montado na hora cuja composição JÁ
//              existe (aí usa o código que já existe, não cria outro igual);
//   kitNovo  — composição inédita, que só vira kit de catálogo com código
//              oficial ao Gerar Pedido (reunião 16/07/2026).
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

export function aplicarPrecosCalculadosAosItensDaCotacao(
  itens: ItemSimulacao[],
  precosCalculados: ItemPedido[]
): ItemSimulacao[] {
  return itens.map((item, i) => ({
    ...item,
    precoVenda: precosCalculados[i]?.precoVenda?.toString() ?? item.precoVenda,
  }));
}

export function removerFreteDestacadoDasLinhas(linhas: LinhaItem[], frete: string | null | undefined): LinhaItem[] {
  const freteDecimal = dec(numero(frete ?? "0"));
  if (freteDecimal.lte(0)) return linhas;

  const receitasDestacadas = linhas.map((linha) => {
    if (linha.preco.trim() === "" || linha.quantidade.trim() === "") return dec("0");
    return dec(numero(linha.preco)).times(dec(numero(linha.quantidade)));
  });
  const receitaDestacada = receitasDestacadas.reduce((s, r) => s.plus(r), dec("0"));
  const receitaBase = receitaDestacada.minus(freteDecimal);
  if (receitaDestacada.lte(0) || receitaBase.lte(0)) return linhas;

  const fator = receitaBase.div(receitaDestacada);
  return linhas.map((linha) => {
    if (linha.preco.trim() === "") return linha;
    return { ...linha, preco: dec(numero(linha.preco)).times(fator).toString() };
  });
}

// ---------- Kit montado no pedido, visto de fora do simulador ----------
//
// Entre salvar a cotação e Gerar Pedido, o kit montado na hora NÃO tem
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
