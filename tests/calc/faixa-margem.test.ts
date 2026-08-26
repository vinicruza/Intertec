import { describe, expect, it } from "vitest";
import { dec } from "@calc";
import {
  FAIXA_MARGEM_PADRAO,
  faixaDoPedido,
  seloExigeAprovacao,
  seloMargemComercial,
  type FaixaMargemComercial,
} from "@app/lib/sim/params";

// ============================================================
// Faixas de margem por canal e por vendedor (Intertech, 26/08/2026)
// ============================================================
//
// "Até 29,99 vermelho, 30 a 39,99 amarelo, 40% fica verde e pode prosseguir,
// acima de 50% azul" — para Marketplace. O resto da casa continua como estava.
//
// O que estes testes guardam são as BORDAS. Meio ponto percentual decide se o
// pedido segue sozinho ou para numa fila de aprovação, e é exatamente nos
// valores redondos (30,00 / 40,00 / 50,00) que a régua costuma escorregar.

const MARKETPLACE = "canal-marketplace";
const INTERNO = "canal-interno";
const MARI = "vendedor-mari";

const FAIXAS: FaixaMargemComercial[] = [
  { channel_id: null, seller_id: null, red_max: "0.40", yellow_max: "0.50", green_max: "0.65" },
  { channel_id: MARKETPLACE, seller_id: null, red_max: "0.2999", yellow_max: "0.3999", green_max: "0.50" },
];

const selo = (pct: string, faixa = FAIXA_MARGEM_PADRAO) => seloMargemComercial(dec(pct), faixa).label;

describe("faixa do Marketplace, como a Intertech ditou", () => {
  const mkt = faixaDoPedido(FAIXAS, { channelId: MARKETPLACE, sellerId: MARI });

  it.each([
    ["0.10", "Vermelha"],
    ["0.2999", "Vermelha"],
    ["0.30", "Amarela"],
    ["0.3999", "Amarela"],
    ["0.40", "Verde"],
    ["0.50", "Verde"],
    ["0.5001", "Azul"],
    ["0.80", "Azul"],
  ])("margem de %s → %s", (pct, esperado) => {
    expect(selo(pct, mkt)).toBe(esperado);
  });

  it("40% segue sozinho — era o pedido explícito", () => {
    // "40% fica verde e pode prosseguir".
    expect(seloExigeAprovacao(seloMargemComercial(dec("0.40"), mkt))).toBe(false);
  });

  it("39,99% ainda para na aprovação", () => {
    expect(seloExigeAprovacao(seloMargemComercial(dec("0.3999"), mkt))).toBe(true);
  });
});

describe("o resto da casa não muda", () => {
  it.each([
    ["0.40", "Vermelha"],
    ["0.50", "Amarela"],
    ["0.65", "Verde"],
    ["0.6501", "Azul"],
  ])("margem de %s → %s, como antes das faixas existirem", (pct, esperado) => {
    expect(selo(pct)).toBe(esperado);
    expect(selo(pct, faixaDoPedido(FAIXAS, { channelId: INTERNO, sellerId: "qualquer" }))).toBe(esperado);
  });
});

describe("faixaDoPedido: do mais específico para o mais geral", () => {
  const comVendedor: FaixaMargemComercial[] = [
    ...FAIXAS,
    { channel_id: MARKETPLACE, seller_id: MARI, red_max: "0.10", yellow_max: "0.20", green_max: "0.30" },
  ];

  it("a faixa do vendedor manda sobre a do canal", () => {
    expect(faixaDoPedido(comVendedor, { channelId: MARKETPLACE, sellerId: MARI }).red_max).toBe("0.10");
  });

  it("outro vendedor do mesmo canal continua na faixa do canal", () => {
    expect(faixaDoPedido(comVendedor, { channelId: MARKETPLACE, sellerId: "outro" }).red_max).toBe("0.2999");
  });

  it("canal sem faixa própria cai no padrão da casa", () => {
    expect(faixaDoPedido(comVendedor, { channelId: INTERNO, sellerId: "x" }).red_max).toBe("0.40");
  });

  it("sem escopo nenhum, o padrão da casa", () => {
    expect(faixaDoPedido(FAIXAS, {}).red_max).toBe("0.40");
  });

  it("tabela vazia não muda a régua de ninguém", () => {
    // Falha de leitura não pode virar mudança silenciosa de regra de aprovação.
    expect(faixaDoPedido([], { channelId: MARKETPLACE, sellerId: MARI })).toEqual(FAIXA_MARGEM_PADRAO);
  });
});
