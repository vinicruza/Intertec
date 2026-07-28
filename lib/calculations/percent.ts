import { Decimal } from "./decimal";

// ============================================================
// Percentual sobre uma base assinada (Decisão D2)
// ============================================================
//
// Todo percentual do sistema é calculado sobre a RECEITA LÍQUIDA (D2). O
// problema: a receita líquida pode ser NEGATIVA — basta um pedido pequeno com
// frete alto pago pela empresa, ou impostos e comissão que superem a receita.
//
// Dividir um valor negativo por uma base negativa devolve um número POSITIVO.
// Na prática isso fazia um prejuízo aparecer como margem excelente:
//
//   receita bruta 1.000, frete 2.000, CMV 500
//   → receita líquida −1.647,50 e margem de contribuição −2.147,50
//   → −2.147,50 ÷ −1.647,50 = +130,35%  →  status "Boa" (verde)
//
// Um pedido que destrói R$ 2.147,50 era exibido como o melhor pedido do mês, e
// ficava de fora da contagem de pedidos críticos no dashboard. É exatamente a
// classe de erro que o sistema existe para eliminar (PRD §12, critério 4).
//
// REGRA: o sinal do percentual acompanha SEMPRE o sinal do valor, nunca o da
// base. Por isso dividimos pelo MÓDULO da base. Quando a receita líquida é
// positiva — o caso normal — o resultado é idêntico ao de antes; os golden
// tests T6 e T7 continuam batendo com a planilha.
//
// Devolve `null` quando a base é zero: não existe percentual de nada, e o
// chamador precisa decidir o que exibir (normalmente "—").
export function pctSobre(valor: Decimal, base: Decimal): Decimal | null {
  if (base.isZero() || !base.isFinite()) return null;
  return valor.div(base.abs());
}
