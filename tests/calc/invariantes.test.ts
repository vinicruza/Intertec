import { describe, expect, it } from "vitest";
import { Decimal, ErroCalculoBloqueante, calcularPedido, dec } from "@calc";

// ============================================================
// Testes de INVARIANTE — a rede para o defeito que ninguém pensou em testar
// ============================================================
//
// Os dois defeitos encontrados pelo cliente em 04/08/2026 (selo "Boa" num
// prejuízo, frete saindo duas vezes) passaram por 130 testes sem serem tocados.
// Não porque os testes eram ruins: porque todo teste de exemplo só cobre o
// exemplo que alguém imaginou, e ninguém imaginou receita líquida negativa.
//
// Aqui a lógica se inverte. Em vez de "com esta entrada, espero este número",
// afirmamos VERDADES QUE TÊM DE VALER SEMPRE e jogamos centenas de combinações
// contra elas, inclusive as absurdas: frete gigante, preço menor que o custo,
// imposto alto, quantidade 1. É assim que se pega o caso em que não se pensou.
//
// O sorteio é determinístico (semente fixa): o CI que quebrar aqui quebra
// igual na máquina de quem for consertar.

function geradorDeterministico(semente: number) {
  let estado = semente;
  return () => {
    // xorshift de 32 bits — previsível de propósito.
    estado ^= estado << 13;
    estado ^= estado >>> 17;
    estado ^= estado << 5;
    return Math.abs(estado) / 2147483647;
  };
}

const sortear = geradorDeterministico(20260804);
const entre = (min: number, max: number) => min + sortear() * (max - min);

type Caso = ReturnType<typeof montarCaso>;

function montarCaso() {
  const quantidade = Math.max(1, Math.round(entre(1, 5000)));
  const cmvUnitario = entre(0.01, 200);
  // O preço vai de MUITO abaixo do custo até bem acima: prejuízo é caso
  // legítimo de teste, não anomalia a evitar.
  const precoVenda = cmvUnitario * entre(0.2, 3);
  return {
    itens: [
      {
        nome: "Item sorteado",
        precoVenda: precoVenda.toFixed(6),
        quantidade: String(quantidade),
        cmvUnitario: cmvUnitario.toFixed(6),
        despesaUnitaria: entre(0, 5).toFixed(6),
      },
    ],
    // Frete até 3× a receita do item: é exatamente o que derrubou a receita
    // líquida para baixo de zero no pedido real.
    frete: (precoVenda * quantidade * entre(0, 3)).toFixed(6),
    fretePorContaCliente: sortear() > 0.5,
    aliquotaImposto: entre(0, 0.35).toFixed(6),
    aliquotaDifal: entre(0, 0.2).toFixed(6),
    aliquotaComissao: entre(0, 0.1).toFixed(6),
  };
}

const CASOS: Caso[] = Array.from({ length: 400 }, montarCaso);

function descrever(c: Caso) {
  return JSON.stringify({ ...c, itens: c.itens[0] });
}

describe("invariantes do cálculo de pedido (400 combinações sorteadas)", () => {
  it("o sinal do percentual é SEMPRE o sinal do dinheiro", () => {
    // O defeito de 04/08/2026 em uma frase. Se voltar, quebra aqui.
    for (const c of CASOS) {
      const r = calcularPedido(c);
      if (r.margemContribuicao.isZero()) continue;
      expect(r.margemContribuicaoPct.isNegative(), descrever(c)).toBe(
        r.margemContribuicao.isNegative(),
      );
    }
  });

  it("nenhum resultado é Infinity ou NaN", () => {
    for (const c of CASOS) {
      const r = calcularPedido(c);
      for (const [nome, valor] of Object.entries(r)) {
        if (valor instanceof Decimal) {
          expect(valor.isFinite(), `${nome} em ${descrever(c)}`).toBe(true);
        }
      }
    }
  });

  it("a cascata fecha: receita menos cada dedução dá a receita líquida", () => {
    for (const c of CASOS) {
      const r = calcularPedido(c);
      const recomposta = r.receitaBruta
        .minus(r.frete)
        .minus(r.impostoFrete)
        .minus(r.imposto)
        .minus(r.difal)
        .minus(r.comissao);
      expect(recomposta.minus(r.receitaLiquida).abs().lt(dec("0.0000001")), descrever(c)).toBe(true);
    }
  });

  it("frete por conta do cliente zera frete E imposto sobre o frete", () => {
    for (const c of CASOS.filter((x) => x.fretePorContaCliente)) {
      const r = calcularPedido(c);
      expect(r.frete.isZero(), descrever(c)).toBe(true);
      expect(r.impostoFrete.isZero(), descrever(c)).toBe(true);
    }
  });

  it("marcar frete por conta do cliente nunca PIORA o resultado", () => {
    // Se o cliente assume o frete, a Intertech não pode sair perdendo. Era
    // exatamente isso que acontecia: marcar a caixa descontava o frete de novo.
    for (const c of CASOS) {
      const comFrete = calcularPedido({ ...c, fretePorContaCliente: false });
      const semFrete = calcularPedido({ ...c, fretePorContaCliente: true });
      expect(semFrete.margemContribuicao.gte(comFrete.margemContribuicao), descrever(c)).toBe(true);
    }
  });

  it("margem de contribuição é sempre receita líquida menos CMV", () => {
    for (const c of CASOS) {
      const r = calcularPedido(c);
      expect(r.margemContribuicao.eq(r.receitaLiquida.minus(r.cmvTotal)), descrever(c)).toBe(true);
    }
  });

  it("aumentar o preço nunca reduz a margem", () => {
    for (const c of CASOS.slice(0, 100)) {
      const base = calcularPedido(c);
      const maisCaro = calcularPedido({
        ...c,
        itens: [{ ...c.itens[0], precoVenda: dec(c.itens[0].precoVenda).times(2).toString() }],
      });
      expect(maisCaro.margemContribuicao.gte(base.margemContribuicao), descrever(c)).toBe(true);
    }
  });

  it("CMV zerado continua bloqueante em qualquer combinação", () => {
    for (const c of CASOS.slice(0, 50)) {
      expect(() =>
        calcularPedido({ ...c, itens: [{ ...c.itens[0], cmvUnitario: "0" }] }),
      ).toThrow(ErroCalculoBloqueante);
    }
  });
});
