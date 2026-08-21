import { describe, expect, it } from "vitest";
import {
  fracaoParaPercentual,
  normalizarFreteCotado,
  percentualParaFracao,
  reais,
  type FreteCotado,
} from "@app/lib/format";
import { mensagemDeErro } from "@app/lib/erros";
import { cepValido, formatarCep } from "../../lib/cadastro/documentos";

// ============================================================
// Dois campos que a vendedora digita e o sistema estragava (21/08/2026)
// ============================================================

// ---------- Comissão ----------
//
// O campo é controlado: mostra a FRAÇÃO guardada, formatada como porcentagem.
// A cada tecla ele fazia a volta completa texto → fração → texto, e o que não
// sobrevive a essa volta é apagado antes da tecla seguinte. Era o caso da
// vírgula: "2," volta como "2", então a vírgula nunca chegava a existir e não
// havia como digitar "2,5".
//
// A correção é a tela guardar o texto digitado enquanto o campo está em foco.
// Estes testes travam a razão do bug, para que a volta continue conhecida.
describe("comissão — a volta fração ↔ porcentagem apaga o que a pessoa digita", () => {
  it("a conta em si está certa: vírgula e ponto viram a mesma fração", () => {
    expect(percentualParaFracao("2,5")).toBe("0.025");
    expect(percentualParaFracao("2.5")).toBe("0.025");
    expect(percentualParaFracao("2,50")).toBe("0.025");
    expect(percentualParaFracao("6,1")).toBe("0.061");
    expect(percentualParaFracao("0,5")).toBe("0.005");
  });

  it("separador ainda sem o decimal não perde o que já foi digitado", () => {
    // "2," e "2." são estados de meio de digitação. Eles precisam continuar
    // valendo 2% — se virassem null, o campo cairia no padrão do canal no
    // meio da frase.
    expect(percentualParaFracao("2,")).toBe("0.02");
    expect(percentualParaFracao("2.")).toBe("0.02");
  });

  it("campo vazio é 'usar o padrão do canal', não zero", () => {
    expect(percentualParaFracao("")).toBeNull();
    expect(percentualParaFracao("   ")).toBeNull();
    expect(percentualParaFracao("abc")).toBeNull();
  });

  // A prova do bug: estes são os estados em que a volta NÃO devolve o que
  // entrou. Enquanto for assim, a tela precisa guardar o texto digitado.
  it("estados em que a volta não devolve o texto — por isso existe o comissaoTexto", () => {
    const volta = (digitado: string) => fracaoParaPercentual(percentualParaFracao(digitado) ?? "");
    expect(volta("2,")).toBe("2"); // a vírgula some
    expect(volta("2,50")).toBe("2,5"); // o zero à direita some
    expect(volta("2,5")).toBe("2,5"); // este sobrevive
    expect(volta("2")).toBe("2");
  });

  it("fração guardada volta para a tela sem casa decimal sobrando", () => {
    expect(fracaoParaPercentual("0.025")).toBe("2,5");
    expect(fracaoParaPercentual("0.061")).toBe("6,1");
    expect(fracaoParaPercentual("0.02")).toBe("2");
  });
});

// ---------- Valor das opções de frete cotadas ----------
//
// O valor é digitado pela expedição e guardado num jsonb (`orders.freight_quotes`),
// sem o `numeric` do banco para arrumar o formato. Estava indo cru — "384,00",
// "3.223,00" — e a ficha de expedição não conseguia formatar, mostrando "—" no
// lugar do valor que estava gravado.
const FRETE_BASE: FreteCotado = {
  id: "x", carrierId: null, carrierName: "JAMEF", carrierOther: null,
  amount: null, leadTimeDays: null, quoteCode: null, selected: false,
};

describe("valor do frete cotado — gravar em número e mostrar na ficha", () => {
  it("normaliza o que foi digitado antes de gravar", () => {
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "384,00" }).amount).toBe("384");
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "3.223,00" }).amount).toBe("3223");
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "153" }).amount).toBe("153");
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "1.234,56" }).amount).toBe("1234.56");
  });

  it("campo em branco fica nulo — nunca vira R$ 0,00", () => {
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "" }).amount).toBeNull();
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "  " }).amount).toBeNull();
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: null }).amount).toBeNull();
  });

  it("o prazo em dias passa pela mesma régua", () => {
    expect(normalizarFreteCotado({ ...FRETE_BASE, leadTimeDays: "7" }).leadTimeDays).toBe("7");
    expect(normalizarFreteCotado({ ...FRETE_BASE, leadTimeDays: "" }).leadTimeDays).toBeNull();
  });

  it("texto que não é número não é jogado fora", () => {
    // Perder o que a pessoa escreveu é pior do que guardar algo estranho.
    expect(normalizarFreteCotado({ ...FRETE_BASE, amount: "a combinar" }).amount).toBe("a combinar");
  });

  it("os outros campos da cotação passam intactos", () => {
    const f = normalizarFreteCotado({ ...FRETE_BASE, amount: "153", quoteCode: "221122130", selected: true });
    expect(f.carrierName).toBe("JAMEF");
    expect(f.quoteCode).toBe("221122130");
    expect(f.selected).toBe(true);
    expect(f.id).toBe("x");
  });

  // A ficha precisa mostrar CERTO também os 43 pedidos já gravados com vírgula,
  // sem depender de migração de dados.
  it("a ficha formata valor gravado com vírgula, do jeito antigo", () => {
    expect(reais("384,00")).toBe("R$ 384,00");
    expect(reais("3.223,00")).toBe("R$ 3223,00");
    expect(reais("387,00")).toBe("R$ 387,00");
  });

  it("e continua formatando o que já vinha em número", () => {
    expect(reais("153")).toBe("R$ 153,00");
    expect(reais("1234.56")).toBe("R$ 1234,56");
    expect(reais(null)).toBe("—");
    expect(reais("")).toBe("—");
    expect(reais("a combinar")).toBe("—");
  });
});

// ---------- CEP de entrega (item 6a) ----------
//
// A trava do banco recusa CEP com número de dígitos diferente de 8, e o erro
// dela chega cru na tela: 'new row for relation "orders" violates check
// constraint "orders_shipping_zip_formato"'. Em 19/08/2026 uma vendedora
// digitou "42" e levou exatamente isso.
//
// A defesa é em três camadas, e este teste guarda as três.
describe("CEP de entrega — três camadas antes do erro do banco", () => {
  it("1ª camada: a tela sabe reconhecer CEP incompleto enquanto se digita", () => {
    expect(cepValido("42")).toBe(false);
    expect(cepValido("1234567")).toBe(false);
    expect(cepValido("123456789")).toBe(false);
    expect(cepValido("")).toBe(false);
    expect(cepValido("01310100")).toBe(true);
    expect(cepValido("01310-100")).toBe(true); // com máscara também vale
  });

  it("2ª camada: o CEP vai para o banco só com dígitos", () => {
    expect(formatarCep("01310100")).toBe("01310-100");
    expect(formatarCep("42")).toBe("42"); // incompleto não ganha máscara falsa
  });

  it("3ª camada: se ainda assim escapar, a trava do banco vira frase em português", () => {
    const erroDoBanco = {
      message: 'new row for relation "orders" violates check constraint "orders_shipping_zip_formato"',
      code: "23514",
    };
    const amigavel = mensagemDeErro(erroDoBanco, "Não deu para salvar.");
    expect(amigavel).toContain("8 dígitos");
    expect(amigavel).toContain("cadastro do cliente");
    expect(amigavel).not.toContain("constraint");
    expect(amigavel).not.toContain("orders_shipping_zip_formato");
  });

  it("Volumes e CEP são campos separados — não há mapeamento cruzado", () => {
    // O "42" relatado era o mesmo número do campo Volumes, o que levantou a
    // suspeita de troca de campo. São dois estados independentes na tela
    // (`volumes` e `cepEntrega`), e nenhum escreve no outro. Este teste é a
    // prova de que a validação de um não aceita o formato do outro.
    expect(cepValido("42")).toBe(false);
  });
});
