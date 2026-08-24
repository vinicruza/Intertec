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
