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

// ---------- Campo numérico de formulário ----------
//
// Peso e Volumes viajam como texto e o banco converte: volumes é inteiro,
// peso é decimal. Qualquer outra coisa o Postgres recusa com jargão de SQL em
// inglês (erro 22P02) — e, em 25/08/2026, foi o que uma vendedora leu na tela
// ao escrever a COMPOSIÇÃO das caixas no campo Volumes: "2 cx6+1cx3 = 3".
//
// Ela não estava errada em querer registrar isso; errado era o campo aceitar a
// digitação e só reclamar depois da viagem, em outra língua. Aqui o problema é
// pego antes de sair da tela, e a frase aponta o campo "Composição dos
// volumes", logo abaixo, que existe justamente para essa informação.
export function problemaNoCampoNumerico(
  valor: ValorNumerico,
  opcoes: { inteiro: boolean; rotulo: string }
): string | null {
  const limpo = valor == null ? "" : String(valor).trim();
  if (limpo === "") return null; // campo opcional: em branco é válido

  const normalizado = numeroDigitado(limpo);
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
    return opcoes.inteiro
      ? `${opcoes.rotulo} aceita só o número de volumes — por exemplo 3. Como eles foram montados vai no campo "Composição dos volumes", logo abaixo.`
      : `${opcoes.rotulo} aceita só número — por exemplo 12,5.`;
  }

  const numero = Number(normalizado);
  if (opcoes.inteiro && !Number.isInteger(numero)) {
    return `${opcoes.rotulo} precisa ser um número inteiro — não dá para despachar meia caixa.`;
  }
  if (numero <= 0) {
    return `${opcoes.rotulo} precisa ser maior que zero. Deixe em branco se ainda não souber.`;
  }
  return null;
}

// ---------- Cidade de entrega ----------
//
// O campo fica ao lado do CEP e recebe o CEP por engano — aconteceu em
// 25/08/2026, e a ficha imprimiria "Cidade/UF entrega: 15775039". Nome de
// cidade sempre tem letra; um punhado de dígitos, nunca.
export function problemaNaCidade(valor: ValorNumerico): string | null {
  const limpo = valor == null ? "" : String(valor).trim();
  if (limpo === "") return null;
  if (!/\p{L}/u.test(limpo)) {
    return "Isso parece um CEP. Aqui vai o nome da cidade — o CEP fica no campo ao lado.";
  }
  return null;
}

// ---------- Pelo menos uma transportadora cotada ----------
//
// Pedido da Intertech em 26/08/2026: sem ao menos uma cotação de frete
// registrada, o pedido não prossegue. O motivo é de negócio — o frete cotado é
// o que sustenta a margem apresentada e o que a expedição usa para fechar com a
// transportadora; seguir sem ele é decidir no escuro.
//
// Trava o PROSSEGUIR (enviar para aprovação e ganhar o pedido), nunca o salvar:
// cotar frete é etapa posterior a montar o pedido, e impedir de salvar
// obrigaria a pessoa a segurar tudo na tela até a transportadora responder.
//
// RETIRADA (Intertech, 02/09/2026). Quando o cliente busca a mercadoria não
// existe frete a cotar, e exigir um valor deixava o pedido preso na tela sem
// saída — foi o que aconteceu em 02/09/2026. A transportadora marcada como
// retirada no cadastro (`is_pickup`) dispensa o valor, e só ela.
//
// A dispensa vale para a opção ESCOLHIDA, não para qualquer linha da tabela:
// uma linha de retirada solta num pedido que vai viajar de transportadora
// liberaria o pedido sem cotação nenhuma — devolvendo pela janela o que a
// regra fecha pela porta.
export type TransportadorasDeRetirada = ReadonlySet<string> | null | undefined;

function ehRetirada(f: FreteCotado, retiradas: TransportadorasDeRetirada): boolean {
  const id = (f.carrierId ?? "").trim();
  return id !== "" && Boolean(retiradas?.has(id));
}

export function cotacaoDeFreteValida(
  f: FreteCotado,
  retiradas?: TransportadorasDeRetirada
): boolean {
  const temTransportadora =
    (f.carrierId ?? "").trim() !== "" || (f.carrierOther ?? "").trim() !== "";
  if (!temTransportadora) return false;
  if (f.selected && ehRetirada(f, retiradas)) return true;
  // Valor é o que diferencia cotação de linha começada e abandonada. Zero não
  // conta: frete de graça não é cotação, é campo esquecido.
  const bruto = numeroDigitado(f.amount ?? "").trim();
  if (bruto === "") return false;
  try {
    return dec(bruto).gt(0);
  } catch {
    return false;
  }
}

export function temCotacaoDeFrete(
  fretes: FreteCotado[] | null | undefined,
  retiradas?: TransportadorasDeRetirada
): boolean {
  return (fretes ?? []).some((f) => cotacaoDeFreteValida(f, retiradas));
}

export const AVISO_SEM_COTACAO_DE_FRETE =
  "Registre ao menos uma cotação de frete, com transportadora e valor, antes de prosseguir. " +
  "Se o cliente for retirar, escolha a opção RETIRADA: nela não há valor de frete.";
