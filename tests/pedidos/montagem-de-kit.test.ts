import { describe, expect, it } from "vitest";
import {
  KIT_NOVO,
  kitNovoAPartirDe,
  kitsSemNome,
  nomeSugeridoParaKit,
  resumoFinanceiroLinhaKit,
  resumoDoKit,
  type KitNovoEdicao,
  type KitParaCopiar,
  type LinhaItem,
} from "@app/lib/sim/itensDoPedido";
import {
  fracaoParaPercentual,
  interpretacaoDoNumero,
  percentualParaFracao,
} from "@app/lib/format";
import {
  idPorRotulo,
  rotuloDaOpcao,
  rotuloPorId,
  type OpcaoDeBusca,
} from "@components/ui/EscolhaComBusca";

// ============================================================
// As ajudas de montagem do kit (06/08/2026)
// ============================================================
//
// Cada uma nasceu de um ponto de confusão concreto da tela. São regras de
// tela, mas de tela que decide número — então ficam fora do componente, e
// testadas.

const NOMES = new Map([
  ["prod-avental", "Avental TNT 40g"],
  ["prod-campo", "Campo Cirúrgico Catarata"],
]);

function kit(p: Partial<KitNovoEdicao> = {}): KitNovoEdicao {
  return {
    rotulo: "",
    produtos: [
      { produtoId: "prod-avental", quantidade: "2" },
      { produtoId: "prod-campo", quantidade: "1" },
    ],
    embalagem: [],
    ...p,
  };
}

function linha(p: Partial<LinhaItem> = {}): LinhaItem {
  return { itemId: "", quantidade: "1", preco: "", kitNovo: null, ...p };
}

describe("kit precisa de nome", () => {
  it("aponta a linha do kit sem nome, para a tela dizer qual item corrigir", () => {
    const linhas = [
      linha({ itemId: "prod-avental", quantidade: "10", preco: "4" }),
      linha({ itemId: KIT_NOVO, kitNovo: kit({ rotulo: "  " }) }),
      linha({ itemId: KIT_NOVO, kitNovo: kit({ rotulo: "Kit catarata Hospital X" }) }),
    ];
    expect(kitsSemNome(linhas)).toEqual([1]);
  });

  it("produto de catálogo nunca é cobrado por nome — ele já tem o do cadastro", () => {
    expect(kitsSemNome([linha({ itemId: "prod-avental" })])).toEqual([]);
  });

  it("sugere um nome a partir da composição, para o campo não começar vazio", () => {
    expect(nomeSugeridoParaKit(kit(), NOMES)).toBe(
      "Kit 2× Avental TNT 40g + 1× Campo Cirúrgico Catarata"
    );
  });

  it("kit ainda sem produto não tem o que sugerir", () => {
    expect(nomeSugeridoParaKit(kit({ produtos: [] }), NOMES)).toBe("");
  });
});

describe("frase de conferência do kit", () => {
  // As duas quantidades ficam a poucos centímetros uma da outra: "100 kits
  // vendidos" e "2 aventais por kit". A frase separa uma da outra em palavras.
  it("mostra o que entra em 1 kit e quantos kits estão sendo vendidos", () => {
    expect(resumoDoKit(kit(), "100", NOMES)).toBe(
      "1 kit = 2× Avental TNT 40g + 1× Campo Cirúrgico Catarata · vendendo 100 kits"
    );
  });

  it("sem quantidade de venda ainda, mostra só a receita do kit", () => {
    expect(resumoDoKit(kit(), "", NOMES)).toBe(
      "1 kit = 2× Avental TNT 40g + 1× Campo Cirúrgico Catarata"
    );
  });

  it("kit vazio não gera frase nenhuma", () => {
    expect(resumoDoKit(kit({ produtos: [] }), "100", NOMES)).toBeNull();
  });

  it("linhas em branco do montador não entram na frase", () => {
    const comSobras = kit({
      produtos: [
        { produtoId: "prod-avental", quantidade: "2" },
        { produtoId: "", quantidade: "1" },
        { produtoId: "prod-campo", quantidade: "" },
      ],
    });
    expect(resumoDoKit(comSobras, "10", NOMES)).toBe("1 kit = 2× Avental TNT 40g · vendendo 10 kits");
  });
});

describe("resumo financeiro da linha de kit", () => {
  it("multiplica preço por kit pela quantidade de kits vendidos", () => {
    expect(resumoFinanceiroLinhaKit("3", "1250", "410")).toEqual({
      quantidadeKits: "3",
      precoPorKit: "1250",
      receitaTotal: "3750",
      cmvPorKit: "410",
      cmvTotal: "1230",
    });
  });

  it("normaliza vírgula decimal antes de multiplicar", () => {
    expect(resumoFinanceiroLinhaKit("2,5", "100,50", "20,10")?.receitaTotal).toBe("251.25");
    expect(resumoFinanceiroLinhaKit("2,5", "100,50", "20,10")?.cmvTotal).toBe("50.25");
  });

  it("não derruba a tela enquanto falta preço, quantidade ou CMV", () => {
    expect(resumoFinanceiroLinhaKit("", "100", "20")).toBeNull();
    expect(resumoFinanceiroLinhaKit("2", "", "20")).toBeNull();
    expect(resumoFinanceiroLinhaKit("2", "100", null)).toBeNull();
    expect(resumoFinanceiroLinhaKit("abc", "100", "20")).toBeNull();
  });
});

describe("partir de um kit que já existe", () => {
  const base: KitParaCopiar = {
    id: "kit-1",
    codigo: "KC0001",
    nome: "Kit Catarata",
    produtos: [
      { produtoId: "prod-avental", quantidade: "2" },
      { produtoId: "prod-campo", quantidade: "1" },
    ],
    embalagem: [{ insumoId: "ins-envelope", modo: "porKit", quantidade: "1" }],
  };

  it("carrega composição e embalagem para ajustar", () => {
    const novo = kitNovoAPartirDe(base);
    expect(novo.produtos).toEqual(base.produtos);
    expect(novo.embalagem).toEqual(base.embalagem);
  });

  it("NÃO copia o nome — dois kits com o mesmo nome ficam indistinguíveis na lista", () => {
    expect(kitNovoAPartirDe(base).rotulo).toBe("");
  });

  it("copia de verdade: mexer no novo não altera o kit do catálogo", () => {
    const novo = kitNovoAPartirDe(base);
    novo.produtos[0].quantidade = "5";
    novo.embalagem[0].quantidade = "3";
    expect(base.produtos[0].quantidade).toBe("2");
    expect(base.embalagem[0].quantidade).toBe("1");
  });
});

describe("comissão em porcentagem", () => {
  // O motor e o banco trabalham com fração (0,025); a pessoa pensa em 2,5%.
  // Pedir a fração no campo é pedir para alguém digitar 0,25 achando que são
  // 2,5% — e 25% de comissão passaria sem aviso nenhum.
  it("mostra a fração do canal como porcentagem", () => {
    expect(fracaoParaPercentual("0.025")).toBe("2,5");
    expect(fracaoParaPercentual("0.061")).toBe("6,1");
    expect(fracaoParaPercentual("0")).toBe("0");
  });

  it("converte o que foi digitado de volta para fração", () => {
    expect(percentualParaFracao("2,5")).toBe("0.025");
    expect(percentualParaFracao("6,1")).toBe("0.061");
    expect(percentualParaFracao("0")).toBe("0");
  });

  it("ida e volta não muda o número", () => {
    for (const fracao of ["0.025", "0.061", "0.1", "0.005"]) {
      expect(percentualParaFracao(fracaoParaPercentual(fracao))).toBe(fracao);
    }
  });

  it("campo vazio ou lixo digitado não vira número nenhum", () => {
    expect(percentualParaFracao("")).toBeNull();
    expect(percentualParaFracao("abc")).toBeNull();
    expect(fracaoParaPercentual(null)).toBe("");
  });
});

describe("aviso do ponto ambíguo", () => {
  // "4.20" são quatro reais e vinte; "1.000" quase sempre é mil. É a mesma
  // escrita — em vez de adivinhar (e errar a quantidade de um pedido
  // inteiro), a tela mostra o que entendeu.
  it("avisa no padrão de milhar sem vírgula", () => {
    expect(interpretacaoDoNumero("1.000")).toBe("Entendi 1. Se quis dizer 1000, digite sem o ponto.");
    expect(interpretacaoDoNumero("12.500")).toBe("Entendi 12,5. Se quis dizer 12500, digite sem o ponto.");
  });

  it("não avisa quando não há ambiguidade", () => {
    expect(interpretacaoDoNumero("4.20")).toBeNull(); // preço, caso normal
    expect(interpretacaoDoNumero("4000")).toBeNull();
    expect(interpretacaoDoNumero("4.000,5")).toBeNull(); // já é entendido certo
    expect(interpretacaoDoNumero("")).toBeNull();
  });

  it("número que o motor não lê de jeito nenhum recebe aviso próprio", () => {
    expect(interpretacaoDoNumero("1.000.000")).toBe(
      "Não consegui ler este número. Para 1000000, digite sem o ponto."
    );
  });
});

describe("busca por código ou nome no catálogo de 324 produtos", () => {
  const OPCOES: OpcaoDeBusca[] = [
    { id: "1", codigo: "CS0007", nome: "Campo Cirúrgico Catarata" },
    { id: "2", codigo: "AV0011", nome: "Avental TNT 40g" },
    { id: "3", codigo: "KC0001", nome: "Kit Catarata" },
  ];

  it("o rótulo começa pelo código — é o que a pessoa tem em mãos no papel", () => {
    expect(rotuloDaOpcao(OPCOES[0])).toBe("CS0007 — Campo Cirúrgico Catarata");
  });

  it("o texto escolhido volta a ser id", () => {
    expect(idPorRotulo("CS0007 — Campo Cirúrgico Catarata", OPCOES)).toBe("1");
  });

  it("digitar só o código também acerta", () => {
    expect(idPorRotulo("KC0001", OPCOES)).toBe("3");
    expect(idPorRotulo("  av0011 ", OPCOES)).toBe("2");
  });

  it("texto pela metade não vira escolha — nada de adivinhar produto parecido", () => {
    expect(idPorRotulo("Campo", OPCOES)).toBeNull();
    expect(idPorRotulo("CS", OPCOES)).toBeNull();
    expect(idPorRotulo("", OPCOES)).toBeNull();
  });

  it("de id para texto, para o campo abrir preenchido ao editar um pedido", () => {
    expect(rotuloPorId("2", OPCOES)).toBe("AV0011 — Avental TNT 40g");
    expect(rotuloPorId("", OPCOES)).toBe("");
  });
});
