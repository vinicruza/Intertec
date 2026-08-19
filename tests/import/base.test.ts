import { describe, expect, it } from "vitest";
import { Decimal } from "../../lib/calculations/decimal";
import { chaveDeNome, conferirBase } from "../../lib/import/base";
import type { Planilha } from "../../lib/import/types";

// ============================================================
// Conferência da base: banco × planilha.
//
// Planilhas SINTÉTICAS — o arquivo do cliente não vai para o Git. O layout
// reproduz o real: insumos a partir da linha 4 do "Input Preço" (nome na B,
// preço com imposto na F) e produtos na "Alocação Despesa" (nome na B, CMV
// na C).
// ============================================================

function planilhaFalsa(abas: Record<string, Record<string, string | number>>): Planilha {
  const col = (letra: string) =>
    letra.split("").reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  const idx: Record<string, Record<string, string | number>> = {};
  for (const [aba, celulas] of Object.entries(abas)) {
    idx[aba] = {};
    for (const [ref, valor] of Object.entries(celulas)) {
      const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
      idx[aba][`${m[2]}:${col(m[1])}`] = valor;
    }
  }
  return {
    abas: () => Object.keys(idx),
    dimensoes: () => ({ linhas: 40, colunas: 26 }),
    valor: (aba, linha, coluna) => idx[aba]?.[`${linha}:${coluna}`] ?? null,
  };
}

const PLANILHA = planilhaFalsa({
  "Input Preço": {
    B4: "Bobina  SMS 40 gr m²", D4: 0.12, E4: 0.0925, F4: 0.872, G4: 0.6867,
    B5: "Fita adesiva 9830", D5: 0.18, E5: 0.0925, F5: 377.49, G5: 274.623975,
    B6: "Adere Medical Tape", D6: 0.18, E6: 0.0925, F6: 30.72, G6: 24.192,
  },
  "Alocação Despesa": {
    B2: "Campo Catarata 1,00 x 1,20 GR40", C2: 2.9354,
    B3: "Avental", C3: 4.043151,
    B4: "Campo Catarata 1,00 x 1,50 GR40", C4: 3.1518,
  },
});

const BANCO = {
  insumos: [
    // A planilha tem espaço duplo neste nome (§9.4); o banco, não. Mesmo insumo.
    { nome: "Bobina SMS 40 gr m²", precoComImposto: new Decimal("0.872"), precoSemImposto: new Decimal("0.6867") },
    { nome: "Fita adesiva 9830", precoComImposto: new Decimal("377.49"), precoSemImposto: new Decimal("274.623975") },
    { nome: "Adere Medical Tape", precoComImposto: new Decimal("58.07"), precoSemImposto: new Decimal("42.245925") },
  ],
  produtos: [
    { nome: "Campo Catarata 1,00 x 1,20 GR40", cmv: new Decimal("2.9354") },
    { nome: "Avental", cmv: new Decimal("4.6") },
    { nome: "Campo de Mesa 2,00 x 1,30", cmv: new Decimal("4.295443") },
  ],
};

describe("chave de nome", () => {
  it("casa nomes que só diferem em acento, caixa e espaço", () => {
    expect(chaveDeNome("Bobina SMS 40 gr m²")).toBe(chaveDeNome("bobina  sms 40 gr m²"));
    expect(chaveDeNome("Esterilização")).toBe(chaveDeNome("ESTERILIZACAO"));
  });

  it("NÃO casa nomes de produtos diferentes", () => {
    expect(chaveDeNome("Campo Simples 1,00 x 1,20")).not.toBe(chaveDeNome("Campo Simples 1,00 x 1,50"));
  });

  // Limite conhecido e deliberado: a normalização COLAPSA espaço repetido, mas
  // não REMOVE espaço. "1,00x1,20" e "1,00 x 1,20" seguem sendo nomes
  // diferentes — a planilha tem as duas grafias (§9.4).
  //
  // Remover todo espaço casaria esses dois, e casaria também coisas que não
  // são a mesma: é o tipo de "ajuda" que faz o relatório dizer que a base está
  // alinhada quando não está. Aqui o par aparece como um item faltando de cada
  // lado — barulhento de propósito, e conferível por olho humano.
  it("não casa grafias que diferem por espaço REMOVIDO — limite deliberado", () => {
    expect(chaveDeNome("Campo de mesa 1,00x1,20")).not.toBe(chaveDeNome("Campo de mesa 1,00 x 1,20"));
  });
});

describe("conferência da base", () => {
  const r = conferirBase(PLANILHA, BANCO);

  it("acha o insumo cujo preço o banco tem diferente", () => {
    expect(r.insumos.divergentes).toHaveLength(1);
    const d = r.insumos.divergentes[0];
    expect(d.nome).toBe("Adere Medical Tape");
    expect(d.planilha.toFixed(2)).toBe("30.72");
    expect(d.banco.toFixed(2)).toBe("58.07");
  });

  it("casa o insumo com espaço duplo em vez de contá-lo duas vezes", () => {
    expect(r.insumos.soNaPlanilha).toHaveLength(0);
    expect(r.insumos.soNoBanco).toHaveLength(0);
    expect(r.insumos.emAmbos).toBe(3);
  });

  it("lista o produto que existe na planilha e o vendedor não vai achar na tela", () => {
    expect(r.produtosAusentesNoSistema).toEqual(["Campo Catarata 1,00 x 1,50 GR40"]);
  });

  it("lista o produto que só o sistema tem — candidato a renomeação na planilha", () => {
    expect(r.produtos.soNoBanco).toEqual(["Campo de Mesa 2,00 x 1,30"]);
  });

  it("acusa o CMV divergente e ignora o que bate dentro de R$ 0,01", () => {
    expect(r.produtos.iguais).toBe(1); // Campo Catarata
    expect(r.produtos.divergentes).toHaveLength(1);
    expect(r.produtos.divergentes[0].nome).toBe("Avental");
    expect(r.produtos.divergentes[0].diferenca.toFixed(6)).toBe("-0.556849");
  });

  it("ordena as divergências pela maior diferença", () => {
    const muitas = conferirBase(PLANILHA, {
      ...BANCO,
      produtos: [
        { nome: "Campo Catarata 1,00 x 1,20 GR40", cmv: new Decimal("2.0") },
        { nome: "Avental", cmv: new Decimal("4.0") },
      ],
    });
    expect(muitas.produtos.divergentes[0].nome).toBe("Campo Catarata 1,00 x 1,20 GR40");
  });

  it("separa produto sem custo — trava o pedido em vez de sair errado", () => {
    const semCusto = conferirBase(PLANILHA, {
      ...BANCO,
      produtos: [{ nome: "Avental", cmv: null }],
    });
    expect(semCusto.semCustoNoBanco).toEqual(["Avental"]);
  });
});
