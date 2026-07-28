import { Decimal } from "./decimal";

// ============================================================
// Leitura de valores digitados (borda do sistema)
// ============================================================
//
// Converte o texto que o usuário digita (pt-BR, vírgula decimal) em Decimal.
//
// A regra que dá nome a este módulo: campo vazio ou inválido NUNCA vira zero
// em silêncio. Zero silencioso é a classe de erro nº 3 e 4 da planilha
// (Calculations.md §9) — foi assim que 19 produtos passaram a custar zero sem
// ninguém perceber. Aqui, um campo em branco devolve um motivo legível para a
// tela mostrar, e quem chama decide o que fazer.
//
// Zero DIGITADO é diferente de campo vazio: "0" é uma resposta válida para
// frete (o cliente retira na fábrica), e por isso existe a variante
// `lerValorNaoNegativo`. Já rendimento e tamanho de lote viram denominador de
// divisão, então exigem `lerValorPositivo` — que é exatamente o que as
// constraints do banco já garantem (`yield_rate > 0`, `lot_size > 0`).

export type ValorDigitado = { ok: true; valor: Decimal } | { ok: false; motivo: string };

// Normaliza a escrita pt-BR: "1.234,56" → "1234.56"; "1234,56" → "1234.56".
// Quando não há vírgula, o ponto é tratado como separador decimal ("12.5").
function normalizar(texto: string): string {
  const limpo = texto.trim();
  return limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
}

export function lerValor(texto: string, rotulo: string): ValorDigitado {
  const normalizado = normalizar(texto);
  if (normalizado === "") return { ok: false, motivo: `Informe ${rotulo}.` };

  let valor: Decimal;
  try {
    valor = new Decimal(normalizado);
  } catch {
    return { ok: false, motivo: `${rotulo} inválido: "${texto.trim()}".` };
  }
  // Decimal aceita "Infinity" e "NaN" como texto — nenhum dos dois é dinheiro.
  if (!valor.isFinite()) return { ok: false, motivo: `${rotulo} inválido: "${texto.trim()}".` };

  return { ok: true, valor };
}

// Aceita zero (ex.: frete zero é uma decisão legítima), recusa negativo.
export function lerValorNaoNegativo(texto: string, rotulo: string): ValorDigitado {
  const lido = lerValor(texto, rotulo);
  if (!lido.ok) return lido;
  if (lido.valor.isNegative()) return { ok: false, motivo: `${rotulo} não pode ser negativo.` };
  return lido;
}

// Exige maior que zero — para valores que viram denominador de divisão.
export function lerValorPositivo(texto: string, rotulo: string): ValorDigitado {
  const lido = lerValor(texto, rotulo);
  if (!lido.ok) return lido;
  if (lido.valor.lte(0)) return { ok: false, motivo: `${rotulo} deve ser maior que zero.` };
  return lido;
}
