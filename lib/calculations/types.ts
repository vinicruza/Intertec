import { Decimal } from "./decimal";

// Erro lançado quando um cálculo encontra uma condição que o PRD §7 define como
// BLOQUEANTE (nunca deixar passar em silêncio). O caso clássico: item de pedido
// com CMV zerado — na planilha isso virava custo zero mudo (bug nº 3 e 4). Aqui,
// é um erro explícito que interrompe o cálculo. Golden test T9.
export class ErroCalculoBloqueante extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErroCalculoBloqueante";
  }
}

// Entrada de valor monetário/alíquota/quantidade no motor: texto (preferido,
// vindo do `numeric` do Postgres) ou Decimal já construído. Nunca `number`.
export type EntradaDecimal = Decimal | string;
