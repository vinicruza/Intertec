import { Decimal, dec } from "./decimal";
import { type EntradaDecimal } from "./types";

// ============================================================
// Ficha impressa do pedido (formulário de papel — 05/08/2026)
// ============================================================
//
// O formulário que vai para a mesa da conferência tem uma coluna VALOR TOTAL
// por linha e um SUBTOTAL embaixo. São contas de uma linha só, e é justamente
// por isso que elas moram aqui e não dentro do componente de tela: multiplicar
// preço por quantidade em JSX é o caminho mais curto para o dinheiro virar
// float e a soma das linhas não bater com o subtotal impresso.
//
// Não confundir com `ficha.ts`, que é a ficha TÉCNICA do produto (quais
// insumos ele consome). Esta é a ficha do PEDIDO.

export type ItemFichaPedido = {
  quantidade: EntradaDecimal;
  precoUnitario: EntradaDecimal;
};

export type LinhaFichaPedido = {
  quantidade: Decimal;
  precoUnitario: Decimal;
  total: Decimal;
};

export type TotaisFichaPedido = {
  linhas: LinhaFichaPedido[];
  subtotal: Decimal;
};

//   total_linha = preco_unitario × quantidade
//   subtotal    = Σ total_linha
//
// O subtotal é a mesma receita bruta da cascata do pedido (Calculations.md §6)
// — o formulário só a chama por outro nome. Se um dia os dois números
// divergirem na tela, é porque alguém somou em dois lugares diferentes.
export function totaisDaFichaDoPedido(itens: ItemFichaPedido[]): TotaisFichaPedido {
  const linhas = itens.map((i) => {
    const quantidade = dec(i.quantidade);
    const precoUnitario = dec(i.precoUnitario);
    return { quantidade, precoUnitario, total: precoUnitario.times(quantidade) };
  });

  return {
    linhas,
    subtotal: linhas.reduce((s, l) => s.plus(l.total), new Decimal(0)),
  };
}

// ============================================================
// Total a cobrar do cliente (24/08/2026)
// ============================================================
//
//   total_a_cobrar = subtotal dos itens + frete
//
// E NADA MAIS. ST, DIFAL e FCP têm linha na folha porque o formulário de papel
// tem essas linhas, mas nenhum dos três entra na cobrança: o DIFAL é recolhido
// pela Intertech ao estado de destino e sai como dedução da receita
// (Calculations.md §12.1, confirmado por áudio da Intertech em 05/08/2026).
//
// Esta conta era uma linha solta dentro da tela da ficha. Ela desceu para cá
// quando a folha passou a IMPRIMIR o valor do DIFAL (§12.4): com o número à
// vista ao lado do TOTAL, somar um no outro vira um erro de uma tecla — e
// transformaria a folha de conferência numa fatura que cobra do cliente um
// imposto que é custo da empresa. Aqui a regra fica travada por teste.
export function totalACobrarDoCliente(
  subtotal: EntradaDecimal,
  frete: EntradaDecimal
): Decimal {
  return dec(subtotal).plus(dec(frete));
}

// ---------- DIFAL no bloco comercial: destacado ou não ----------
//
// Regra ditada pela Intertech em 25/08/2026. O DIFAL sai da margem em TODA UF
// que tenha alíquota — isso não é opcional e é o que faz a folha bater com a
// planilha de Rentabilidade. O que a chave por UF decide é apenas se ele sai
// DESTACADO no bloco comercial da ficha:
//
//   destacado     → imprime o valor; é imposto que a Intertech já recolhe
//   não destacado → não imprime valor; o estado não está cobrando neste
//                   momento, e a folha não pode sugerir que está
//
// Mora aqui, e não na tela, porque é regra de negócio com consequência no
// papel que vai para o cliente. O TOTAL não muda em nenhum dos dois casos:
// DIFAL nunca foi cobrança do cliente (§12.1) — ver `totalACobrarDoCliente`.
export function difalNoBlocoComercial(entrada: {
  destacado: boolean;
  valor: string | null | undefined;
  calculando: boolean;
}): { texto: string; imprimeValor: boolean } {
  if (!entrada.destacado) return { texto: "não destacado", imprimeValor: false };
  if (entrada.valor != null) return { texto: entrada.valor, imprimeValor: true };
  return { texto: entrada.calculando ? "calculando…" : "—", imprimeValor: false };
}

// ---------- Frete no bloco comercial: destacado ou não ----------
//
// Relatado pela Intertech em 27/08/2026, no pedido 05270826 (Mari,
// Marketplace, IPEPO): a ficha somava R$ 280,80 de frete ao TOTAL do cliente
// num pedido cujo frete estava "não destacado".
//
// "Não destacado" quer dizer que a Intertech paga o transporte — o frete sai da
// MARGEM, como custo, e por isso mesmo não pode ser cobrado do cliente. Cobrar
// nos dois lugares seria absorver o custo e faturá-lo ao mesmo tempo.
//
// É a mesma distinção do DIFAL (§12.4): o que muda é COMO o valor aparece na
// folha, nunca se ele existe. O frete continua na cascata de margem dos dois
// jeitos; o que este trecho decide é o que vai para a coluna do cliente.
export function freteCobradoDoCliente(
  frete: EntradaDecimal,
  destacado: boolean
): Decimal {
  return destacado ? dec(frete) : new Decimal(0);
}
