import { describe, expect, it } from "vitest";
import {
  avisoAoInativarKit,
  confirmacaoDeStatusDoKit,
  podeInativarKit,
} from "@app/lib/sim/catalogoDeKits";

// ============================================================
// Inativar um kit no catálogo (pedido da Patricia, 04/09/2026)
// ============================================================
//
// "Vini, eu consigo inativar um kit?" Não pela tela — a coluna existia e o
// sistema já a respeitava, mas faltava onde clicar. Enquanto faltava, quatro
// kits foram inativados por UPDATE manual no banco, sem registro de quem fez.

describe("quem pode tirar um kit de circulação", () => {
  it("Administrador e Financeiro podem", () => {
    expect(podeInativarKit("admin")).toBe(true);
    expect(podeInativarKit("financeiro")).toBe(true);
  });

  // O Comercial CRIA kit — é o que ele faz ao montar um pedido. O que ele não
  // faz é aposentar um: tirar do catálogo muda o que a equipe inteira
  // consegue vender.
  it("Comercial e Produção não podem", () => {
    expect(podeInativarKit("comercial")).toBe(false);
    expect(podeInativarKit("producao")).toBe(false);
  });

  it("sem perfil carregado, não pode", () => {
    expect(podeInativarKit(null)).toBe(false);
    expect(podeInativarKit(undefined)).toBe(false);
  });
});

// O aviso existe por um caso real: o KC0024 (KIT WEVETS) está em 4 cotações
// abertas. Kit inativo sai da lista de itens vendáveis, então a linha dele
// volta EM BRANCO quando alguém reabre a cotação no simulador.
//
// Quem conta os orçamentos é o banco, e cotação CANCELADA não entra: o KC0028
// estava numa cotação 'simulation' cancelada, e avisar sobre ela seria
// assustar com um papel que ninguém vai reabrir.
describe("aviso antes de inativar", () => {
  it("kit fora de qualquer orçamento aberto não gera aviso", () => {
    expect(avisoAoInativarKit({ orcamentosEmAberto: 0 })).toBeNull();
  });

  it("um orçamento em aberto avisa no singular", () => {
    const aviso = avisoAoInativarKit({ orcamentosEmAberto: 1 });
    expect(aviso).toContain("1 orçamento em aberto");
    expect(aviso).not.toContain("orçamentos em aberto");
  });

  it("mais de um avisa no plural, com o número", () => {
    expect(avisoAoInativarKit({ orcamentosEmAberto: 3 })).toContain("3 orçamentos em aberto");
  });
});

describe("texto da confirmação", () => {
  // A confirmação é a única chance de desfazer o mal-entendido mais provável:
  // "inativar" soar como "excluir". Pedido fechado nunca muda (D7), e o
  // código continua reservado pela assinatura única.
  it("ao inativar, diz que nada é apagado e que dá para reativar", () => {
    const texto = confirmacaoDeStatusDoKit({
      ativando: false,
      codigo: "KC0028",
      nome: "kit vet saúde animal",
      orcamentosEmAberto: 0,
    });
    expect(texto).toContain("KC0028");
    expect(texto).toContain("Nada é apagado");
    expect(texto).toContain("reativar");
  });

  // O texto NÃO pode prometer que a composição fica reservada. Prometia, até
  // eu conferir o banco: em 04/09/2026 o índice único da assinatura virou
  // parcial (só kits ativos), então montar os mesmos itens com o kit fora
  // cria um kit NOVO, com código novo. Promessa de tela que o banco não
  // cumpre é pior do que não avisar.
  it("ao inativar, avisa que a composição fica livre — e não promete reserva", () => {
    const texto = confirmacaoDeStatusDoKit({
      ativando: false,
      codigo: "KC0028",
      nome: "kit vet saúde animal",
      orcamentosEmAberto: 0,
    });
    expect(texto).toContain("cria um kit novo");
    expect(texto).not.toContain("reservad");
  });

  it("ao inativar com orçamento aberto, o aviso entra na confirmação", () => {
    const texto = confirmacaoDeStatusDoKit({
      ativando: false,
      codigo: "KC0028",
      nome: "kit vet saúde animal",
      orcamentosEmAberto: 1,
    });
    expect(texto).toContain("1 orçamento em aberto");
  });

  it("ao reativar, diz que o código é o mesmo", () => {
    const texto = confirmacaoDeStatusDoKit({
      ativando: true,
      codigo: "KC0030",
      nome: "kit Orthovet",
      orcamentosEmAberto: 0,
    });
    expect(texto).toContain("Reativar");
    expect(texto).toContain("mesmo código");
    // Reativar não tem efeito colateral: o aviso de orçamento aberto é só da
    // inativação, e repeti-lo aqui só assustaria quem está desfazendo.
    expect(texto).not.toContain("em aberto");
  });

  it("kit sem código não quebra o texto", () => {
    const texto = confirmacaoDeStatusDoKit({
      ativando: false,
      codigo: null,
      nome: "kit sem código",
      orcamentosEmAberto: 0,
    });
    expect(texto).toContain("sem código");
  });
});
