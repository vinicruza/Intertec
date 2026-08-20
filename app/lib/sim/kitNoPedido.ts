import {
  assinaturaKitCompleta,
  custoKitCompleto,
  type CustoProdutoKit,
  type EmbalagemKit,
  type ItemEmbalagem,
  type Quantidade,
} from "@calc";
import { numeroDigitado } from "../format";

// ============================================================
// Kit montado dentro do pedido (reunião Intertech 16/07/2026)
// ============================================================
//
// Antes eram duas telas: criar o kit e depois puxar o código no simulador.
// A decisão inverteu — o kit nasce dentro do pedido, e o código oficial só é
// gerado ao Gerar Pedido. Enquanto isso, o sistema precisa de duas
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

// Papel do insumo na embalagem do kit (coluna `kit_role` no banco):
//
//   envelope       1 por kit
//   caixa          1/N por kit, N = envelopes por caixa
//   esterilizacao  1/N por kit — o MESMO N da caixa
//   automatico     1 por kit, sem a vendedora escolher (etiquetinha, gráfica)
export type PapelNoKit = "envelope" | "caixa" | "esterilizacao" | "automatico";

// O que a vendedora de fato escolhe na embalagem do kit.
//
// O cliente descreveu o modelo em 19/08/2026: ela informa DUAS coisas — qual
// envelope e quantos envelopes cabem na caixa. O resto sai daí. A caixa e a
// esterilização compartilham o MESMO número porque a esterilizadora cobra por
// caixa, e é a mesma caixa que vai ao cliente.
export type EmbalagemEscolhida = {
  envelopeId: string;
  caixaId: string;
  esterilizacaoId: string;
  envelopesPorCaixa: string;
};

export const EMBALAGEM_VAZIA: EmbalagemEscolhida = {
  envelopeId: "",
  caixaId: "",
  esterilizacaoId: "",
  envelopesPorCaixa: "",
};

// Traduz a escolha da tela nas linhas que o cálculo e o banco entendem.
//
// Antes a vendedora montava a lista à mão, escolhendo o modo em cada linha e
// digitando o número duas vezes — uma na caixa, outra na esterilização. Se os
// dois números divergissem, o custo saía errado e nada avisava. Aqui é um
// número só, por construção.
export function linhasDaEmbalagem(
  escolha: EmbalagemEscolhida,
  idsAutomaticos: { etiquetinha?: string; grafica?: string } = {}
): EmbalagemDoKit[] {
  const linhas: EmbalagemDoKit[] = [];
  const porCaixa = String(escolha.envelopesPorCaixa ?? "").trim();

  if (escolha.envelopeId) {
    linhas.push({ insumoId: escolha.envelopeId, modo: "porKit", quantidade: "1" });
  }
  // Caixa e esterilização só entram com o número preenchido: sem ele não há
  // como ratear, e entrar sem rateio cobraria uma caixa inteira por kit.
  if (porCaixa !== "") {
    if (escolha.caixaId) {
      linhas.push({ insumoId: escolha.caixaId, modo: "itensPorCaixa", quantidade: porCaixa });
    }
    if (escolha.esterilizacaoId) {
      linhas.push({ insumoId: escolha.esterilizacaoId, modo: "itensPorCaixa", quantidade: porCaixa });
    }
  }

  // Etiquetinha entra sempre; gráfica acompanha o envelope, porque é a
  // impressão dele. Confirmado nos 19 kits do catálogo: etiquetinha em 19 de
  // 19, gráfica nos 9 com envelope e em nenhum dos 10 sem.
  if (idsAutomaticos.etiquetinha) {
    linhas.push({ insumoId: idsAutomaticos.etiquetinha, modo: "porKit", quantidade: "1" });
  }
  if (idsAutomaticos.grafica && escolha.envelopeId) {
    linhas.push({ insumoId: idsAutomaticos.grafica, modo: "porKit", quantidade: "1" });
  }
  return linhas;
}

// Caminho de volta: lê a escolha a partir das linhas gravadas.
//
// Assim `kit.embalagem` continua sendo a única fonte de verdade — o formulário
// não guarda estado próprio e não há o que dessincronizar ao reabrir uma
// cotação salva.
export function escolhaDasLinhas(
  linhas: EmbalagemDoKit[],
  papelPorInsumo: Map<string, PapelNoKit | null>
): EmbalagemEscolhida {
  const acha = (papel: PapelNoKit) => linhas.find((l) => papelPorInsumo.get(l.insumoId) === papel);
  const caixa = acha("caixa");
  const esterilizacao = acha("esterilizacao");
  return {
    envelopeId: acha("envelope")?.insumoId ?? "",
    caixaId: caixa?.insumoId ?? "",
    esterilizacaoId: esterilizacao?.insumoId ?? "",
    envelopesPorCaixa: caixa?.quantidade ?? esterilizacao?.quantidade ?? "",
  };
}

// Identidade de uma linha de embalagem para efeito de CUSTO. O custo é
// calculado no servidor (o Comercial não lê o preço dos insumos), então a tela
// guarda o resultado num mapa e precisa de uma chave estável para consultá-lo.
export function chaveDaEmbalagem(e: EmbalagemDoKit): string {
  return `${e.insumoId}|${e.modo}|${String(e.quantidade).trim()}`;
}

export type CatalogoParaKit = {
  custoPorProduto: Map<string, CustoProdutoKit>;
  // Nome e flag de mão de obra de cada insumo de embalagem. O PREÇO não vem:
  // `inputs` é fechada ao Comercial por decisão de acesso.
  insumoPorId: Map<string, { nome: string; precoSemImposto: string | null; maoDeObra: boolean }>;
  // Custo já resolvido de cada linha de embalagem, vindo do servidor, indexado
  // por `chaveDaEmbalagem`. Ausente = ainda calculando; nulo = não deu para
  // custear (insumo sem preço ou quantidade inválida).
  custoEmbalagemPorChave?: Map<string, string | null>;
  // Assinatura → kit já cadastrado. Inclui kit INATIVO de propósito: a
  // assinatura é única no banco independentemente do status, então uma
  // composição igual à de um kit inativo não gera código novo — vai cair no
  // kit inativo de qualquer jeito. Melhor o vendedor saber disso na hora do
  // que descobrir depois de ganhar o pedido.
  kitPorAssinatura: Map<string, { id: string; codigo: string; nome: string; ativo?: boolean }>;
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
  kitExistente: { id: string; codigo: string; nome: string; ativo?: boolean } | null;
  erro: string | null;
};

// Normaliza o que veio da tela: descarta linhas em branco e troca vírgula por
// ponto, que é como o motor recebe número.
function limpar<T extends { quantidade: string }>(linhas: T[], chave: keyof T): T[] {
  return linhas
    .filter((l) => String(l[chave] ?? "").trim() !== "" && l.quantidade.trim() !== "")
    .map((l) => ({ ...l, quantidade: numeroDigitado(l.quantidade) }));
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
  // Antes daqui, linha sem preço era DESCARTADA — a embalagem simplesmente
  // sumia da conta e o kit saía barato demais, sem nenhum aviso. Agora falta de
  // custo é erro: melhor travar o orçamento do que emitir um errado.
  const custos = catalogo.custoEmbalagemPorChave;
  const embalagemValida = embalagem.map((e) => {
    const insumo = catalogo.insumoPorId.get(e.insumoId);
    const chave = chaveDaEmbalagem(e);
    const resolvido = custos?.get(chave);
    return {
      insumoId: e.insumoId,
      pendente: custos !== undefined && resolvido === undefined,
      item: {
        nome: insumo?.nome ?? "Insumo",
        // Com o mapa do servidor presente ele é a AUTORIDADE: não cair no preço
        // local, senão um "não consegui custear esta linha" viraria um número.
        custoUnitario: custos !== undefined ? undefined : (insumo?.precoSemImposto ?? undefined),
        custoResolvido: resolvido ?? undefined,
        quantidade: quantidadeDe(e),
        maoDeObra: insumo?.maoDeObra ?? false,
      } satisfies EmbalagemKit,
    };
  });

  // Enquanto o servidor não devolveu o custo, o kit fica sem CMV em vez de
  // mostrar um número que ainda vai mudar.
  if (embalagemValida.some((x) => x.pendente)) {
    return { ...vazio, assinatura, kitExistente: catalogo.kitPorAssinatura.get(assinatura) ?? null };
  }
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
