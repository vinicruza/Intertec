import { describe, expect, it } from "vitest";
import {
  impressaoDaCotacao,
  temAlteracoesNaoSalvas,
  type CamposDaCotacao,
} from "@app/lib/sim/alteracoesNaoSalvas";

// ============================================================
// "Montei de um jeito e o sistema salvou de outro" (08/09/2026)
// ============================================================
//
// Conferido na base: a cotação ORC-2026-0210 foi salva UMA vez e o pedido saiu
// 40 segundos depois. O banco gravou exatamente o que recebeu naquele save. O
// que faltava era a tela avisar que, depois do save, o formulário tinha mudado
// — e ela chegava a dizer "salva ✓" com o kit já diferente na tela.

const BASE: CamposDaCotacao = {
  clienteId: "cli-1",
  clienteNovoCodigo: "",
  clienteNovoNome: "",
  clienteNovoCnpj: "",
  uf: "SE",
  vendedorId: "v-1",
  canalId: "c-1",
  tipoPedido: "sale",
  motivoAmostra: "",
  autorizadoPorAmostra: "",
  frete: "460",
  freteDestacado: true,
  comissao: null,
  aplicaDifal: null,
  linhas: [JSON.stringify({ itemId: "KIT_NOVO", quantidade: "140", preco: "27.50" })],
  transportadoraId: "t-1",
  transportadoraOutra: "",
  fretesCotados: [],
  pesoKg: "44",
  volumes: "4",
  composicaoVolumes: "4CX6",
  cepEntrega: "49020410",
  cidadeEntrega: "Aracaju",
  ufEntrega: "SE",
  modoPagamentoId: "p-1",
  observacao: "",
};

describe("impressão digital da cotação", () => {
  it("mesma cotação, mesma impressão", () => {
    expect(impressaoDaCotacao(BASE)).toBe(impressaoDaCotacao({ ...BASE }));
  });

  // O caso relatado: a composição do kit mudou de 2 para 4 campos de mesa. Se a
  // impressão não enxergasse dentro da linha, o aviso não apareceria justamente
  // no campo que originou a reclamação.
  it("mudar a composição do kit muda a impressão", () => {
    const com2 = { ...BASE, linhas: [JSON.stringify({ kitNovo: { produtos: [{ id: "cm", q: "2" }] } })] };
    const com4 = { ...BASE, linhas: [JSON.stringify({ kitNovo: { produtos: [{ id: "cm", q: "4" }] } })] };
    expect(impressaoDaCotacao(com2)).not.toBe(impressaoDaCotacao(com4));
  });

  it("mudar o rótulo do kit muda a impressão", () => {
    const cevet = { ...BASE, linhas: [JSON.stringify({ kitNovo: { rotulo: "CEVET" } })] };
    const civet = { ...BASE, linhas: [JSON.stringify({ kitNovo: { rotulo: "CIVET" } })] };
    expect(impressaoDaCotacao(cevet)).not.toBe(impressaoDaCotacao(civet));
  });

  // Estes eram os campos que NÃO apagavam o "salva ✓": trocavam de valor com a
  // mensagem verde intacta na tela.
  it.each([
    ["frete", { frete: "999" }],
    ["peso", { pesoKg: "50" }],
    ["volumes", { volumes: "6" }],
    ["composição dos volumes", { composicaoVolumes: "6CX4" }],
    ["observação", { observacao: "entregar pela manhã" }],
    ["modo de pagamento", { modoPagamentoId: "p-2" }],
    ["CEP de entrega", { cepEntrega: "49020411" }],
    ["frete destacado", { freteDestacado: false }],
    ["tipo de solicitação", { tipoPedido: "sample" as const, motivoAmostra: "avaliação", autorizadoPorAmostra: "Patricia" }],
  ])("mudar %s muda a impressão", (_rotulo, mudanca) => {
    expect(impressaoDaCotacao({ ...BASE, ...mudanca })).not.toBe(impressaoDaCotacao(BASE));
  });

  it("espaço em branco no fim não conta como alteração", () => {
    expect(impressaoDaCotacao({ ...BASE, observacao: "  " })).toBe(impressaoDaCotacao(BASE));
  });
});

describe("quando avisar", () => {
  it("cotação nunca salva não tem 'alteração não salva'", () => {
    // Aí o que existe é "não salva", e disso o próprio botão já fala.
    expect(temAlteracoesNaoSalvas(null, impressaoDaCotacao(BASE))).toBe(false);
  });

  it("nada mudou desde o save: nenhum aviso", () => {
    const impressao = impressaoDaCotacao(BASE);
    expect(temAlteracoesNaoSalvas(impressao, impressao)).toBe(false);
  });

  it("mudou depois do save: avisa", () => {
    const salva = impressaoDaCotacao(BASE);
    const agora = impressaoDaCotacao({ ...BASE, volumes: "9" });
    expect(temAlteracoesNaoSalvas(salva, agora)).toBe(true);
  });
});
