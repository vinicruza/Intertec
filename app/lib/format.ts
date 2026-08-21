import { dec, toMoney, toPercent } from "@calc";

// Formatação para exibição (pt-BR). O valor interno permanece em precisão
// total; aqui só arredondamos para mostrar (Calculations.md §9.9).

export type ValorNumerico = string | number | null | undefined;

// Caminho de volta: o número DIGITADO no teclado brasileiro, no formato que o
// motor entende.
//
// "4,20" é 4,20 — isso já era tratado em cada tela com um replace. O que não
// era: "4.000,5". O motor recebia "4.000.5", que não é número nenhum, e a tela
// respondia com um "não foi possível calcular" que não explicava nada.
// Quantidade na casa dos milhares é o caso NORMAL aqui (o fixture da Patricia
// são 4.000 aventais).
//
// Quando há vírgula, o ponto só pode ser separador de milhar — some. Sem
// vírgula, o ponto continua sendo a casa decimal ("4.20" segue valendo 4,20),
// porque é assim que o valor volta do banco para a tela de edição.
export function numeroDigitado(valor: ValorNumerico): string {
  const limpo = valor == null ? "" : String(valor).trim();
  return limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
}

// O ponto sozinho é ambíguo e não dá para adivinhar: "4.20" é quatro reais e
// vinte, "1.000" quase sempre é mil — mas os dois são a mesma escrita. Em vez
// de escolher por conta própria (e errar a quantidade de um pedido inteiro),
// o sistema mostra o que entendeu e deixa a pessoa corrigir.
//
// Devolve o aviso quando há risco real (ponto seguido de exatamente 3 dígitos,
// sem vírgula: 1.000, 12.500) e null no resto dos casos.
export function interpretacaoDoNumero(valor: ValorNumerico): string | null {
  const limpo = valor == null ? "" : String(valor).trim();
  // Só o padrão de milhar sem vírgula: 1.000, 12.500, 1.000.000.
  if (!/^\d{1,3}(\.\d{3})+$/.test(limpo)) return null;
  const semPontos = limpo.replace(/\./g, "");
  try {
    const lido = dec(numeroDigitado(limpo)).toString().replace(".", ",");
    return `Entendi ${lido}. Se quis dizer ${semPontos}, digite sem o ponto.`;
  } catch {
    // "1.000.000" não é número nenhum para o motor — melhor dizer isso.
    return `Não consegui ler este número. Para ${semPontos}, digite sem o ponto.`;
  }
}

// ---------- Comissão ----------
//
// O banco e o motor trabalham com fração (0,025). A pessoa pensa em
// porcentagem (2,5%). Pedir a fração no campo é pedir para alguém digitar
// 0,25 achando que são 2,5% — e 25% de comissão passaria sem nenhum aviso.

export function fracaoParaPercentual(fracao: ValorNumerico): string {
  if (fracao === null || fracao === undefined || String(fracao).trim() === "") return "";
  try {
    // Sem casas decimais sobrando: 0,025 vira "2,5" e não "2,50".
    return dec(numeroDigitado(fracao)).times(100).toString().replace(".", ",");
  } catch {
    return "";
  }
}

export function percentualParaFracao(percentual: string): string | null {
  const limpo = numeroDigitado(percentual);
  if (limpo === "") return null;
  try {
    return dec(limpo).div(100).toString();
  } catch {
    return null;
  }
}

export function reais(valor: ValorNumerico): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  try {
    // Passa por `numeroDigitado` porque nem tudo que chega aqui veio do motor
    // já normalizado: o valor das opções de frete cotadas é gravado como a
    // pessoa digitou ("384,00", "3.223,00"). Sem isto, `dec()` estourava e a
    // coluna "Valor" da ficha de expedição saía como "—" com o valor gravado
    // no banco — relatado em 21/08/2026.
    return "R$ " + toMoney(dec(numeroDigitado(String(valor)))).replace(".", ",");
  } catch {
    return "—";
  }
}

// Recebe uma fração (0,18) e mostra "18,00%".
export function percentual(fracao: ValorNumerico): string {
  if (fracao === null || fracao === undefined || fracao === "") return "—";
  try {
    return toPercent(dec(String(fracao))).replace(".", ",") + "%";
  } catch {
    return "—";
  }
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

// "há 3 dias" / "hoje" / "há 1 hora" — só para dar a sensação de urgência na
// fila de aprovação; não é cálculo financeiro, é rótulo de tempo decorrido.
export function haQuanto(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(ms / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas} hora${horas === 1 ? "" : "s"}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias === 1 ? "" : "s"}`;
}

// ============================================================
// Opções de frete cotadas (ficha de expedição)
// ============================================================
//
// O valor e o prazo são digitados pela expedição e guardados num jsonb
// (`orders.freight_quotes`), sem o `numeric` do banco para arrumar o formato.
// Iam crus — "384,00", "3.223,00" — e a ficha não conseguia formatar, mostrando
// "—" no lugar do valor gravado. Relatado em 21/08/2026.
export type FreteCotado = {
  id: string;
  carrierId: string | null;
  carrierName: string | null;
  carrierOther: string | null;
  amount: string | null;
  leadTimeDays: string | null;
  quoteCode: string | null;
  selected: boolean;
};

// Campo vazio continua nulo — não vira zero, que seria um frete cotado a R$ 0,00.
export function normalizarFreteCotado(f: FreteCotado): FreteCotado {
  const numero = (v: string | null): string | null => {
    const limpo = numeroDigitado(v ?? "").trim();
    if (limpo === "") return null;
    try {
      return dec(limpo).toString();
    } catch {
      // Texto que não é número volta como veio: quem grava não é quem julga, e
      // perder o que a pessoa digitou é pior do que guardar um valor estranho.
      return v;
    }
  };
  return { ...f, amount: numero(f.amount), leadTimeDays: numero(f.leadTimeDays) };
}
