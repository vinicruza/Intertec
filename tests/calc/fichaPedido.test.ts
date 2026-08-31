import { describe, expect, it } from "vitest";
import {
  difalNoBlocoComercial,
  freteCobradoDoCliente,
  identificacaoDaFolha,
  totaisDaFichaDoPedido,
  totalACobrarDoCliente,
} from "@calc";

// A ficha impressa do pedido (formulário de papel, 05/08/2026). O que se
// protege aqui é o subtotal impresso bater com a soma das linhas impressas —
// a conferência confere justamente isso, à mão, na mesa.

describe("totaisDaFichaDoPedido", () => {
  // Mesmo item do fixture da aba Patricia (Calculations.md §6): o SUBTOTAL do
  // formulário é a mesma receita bruta da cascata, com outro nome.
  it("reproduz o fixture Patricia: 4,20 × 4.000 = 16.800", () => {
    const r = totaisDaFichaDoPedido([{ quantidade: "4000", precoUnitario: "4.20" }]);
    expect(r.linhas[0].total.toString()).toBe("16800");
    expect(r.subtotal.toString()).toBe("16800");
  });

  it("o subtotal é exatamente a soma das linhas", () => {
    const r = totaisDaFichaDoPedido([
      { quantidade: "3", precoUnitario: "10.10" },
      { quantidade: "7", precoUnitario: "2.35" },
      { quantidade: "1", precoUnitario: "0.05" },
    ]);
    expect(r.linhas.map((l) => l.total.toString())).toEqual(["30.3", "16.45", "0.05"]);
    expect(r.subtotal.toString()).toBe("46.8");
  });

  // Preço com muitas casas é comum: o CMV sai com seis. Arredondar por linha
  // e somar depois daria um subtotal diferente de somar e arredondar no fim.
  it("não arredonda por linha — precisão total até a exibição", () => {
    const r = totaisDaFichaDoPedido([
      { quantidade: "3", precoUnitario: "0.005" },
      { quantidade: "3", precoUnitario: "0.005" },
    ]);
    expect(r.subtotal.toString()).toBe("0.03");
  });

  it("pedido sem itens tem subtotal zero", () => {
    const r = totaisDaFichaDoPedido([]);
    expect(r.linhas).toEqual([]);
    expect(r.subtotal.toString()).toBe("0");
  });

  it("aceita quantidade fracionária", () => {
    const r = totaisDaFichaDoPedido([{ quantidade: "2.5", precoUnitario: "4" }]);
    expect(r.linhas[0].total.toString()).toBe("10");
  });
});

// ============================================================
// O TOTAL da folha não cobra imposto do cliente (24/08/2026)
// ============================================================
//
// A folha passou a IMPRIMIR o valor do DIFAL porque a vendedora precisava
// vê-lo (Calculations.md §12.4). Com o número à vista, uma linha acima do
// TOTAL, o erro fácil vira somar um no outro — e aí a folha de conferência
// cobra do cliente um imposto que é custo da Intertech (§12.1). Estes testes
// existem para esse erro não passar despercebido.

describe("totalACobrarDoCliente", () => {
  it("é subtotal + frete", () => {
    expect(totalACobrarDoCliente("1865", "145").toString()).toBe("2010");
  });

  it("pedido de Patrocínio/MG do print: DIFAL de 120,60 NÃO entra no total", () => {
    // Itens do print: 100×9,80 + 50×7,20 + 50×5,90 + 100×2,30 = 1.865,00
    const itens = totaisDaFichaDoPedido([
      { quantidade: "100", precoUnitario: "9.80" },
      { quantidade: "50", precoUnitario: "7.20" },
      { quantidade: "50", precoUnitario: "5.90" },
      { quantidade: "100", precoUnitario: "2.30" },
    ]);
    expect(itens.subtotal.toString()).toBe("1865");

    // Frete BRASPRESS escolhido no print. O DIFAL de MG é 6% × (1.865 + 145) =
    // 120,60 e fica de fora: o total cobrado é o mesmo com ou sem ele.
    const total = totalACobrarDoCliente(itens.subtotal, "145");
    expect(total.toString()).toBe("2010");
    expect(total.plus("120.60").toString()).not.toBe(total.toString());
  });

  it("frete zero não muda o subtotal", () => {
    expect(totalACobrarDoCliente("46.8", "0").toString()).toBe("46.8");
  });

  it("não arredonda: precisão total até a exibição", () => {
    expect(totalACobrarDoCliente("0.005", "0.005").toString()).toBe("0.01");
  });
});

// ============================================================
// DIFAL destacado e não destacado (regra da Intertech, 25/08/2026)
// ============================================================
//
// A folha do cliente só mostra o DIFAL onde ele está sendo cobrado. Onde não
// está, some do bloco comercial — mas continua saindo da margem, no bloco de
// uso interno, que é o que bate com a planilha de Rentabilidade.
describe("difalNoBlocoComercial", () => {
  it("UF destacada imprime o valor", () => {
    const r = difalNoBlocoComercial({ destacado: true, valor: "145.80", calculando: false });
    expect(r).toEqual({ texto: "145.80", imprimeValor: true });
  });

  it("UF não destacada não imprime valor nenhum, mesmo havendo DIFAL calculado", () => {
    const r = difalNoBlocoComercial({ destacado: false, valor: "145.80", calculando: false });
    expect(r).toEqual({ texto: "não destacado", imprimeValor: false });
  });

  it("destacada e ainda calculando avisa, em vez de mostrar traço", () => {
    expect(difalNoBlocoComercial({ destacado: true, valor: null, calculando: true }).texto).toBe("calculando…");
    expect(difalNoBlocoComercial({ destacado: true, valor: null, calculando: false }).texto).toBe("—");
  });

  // A trava que importa: destacar ou não NUNCA mexe no que se cobra do cliente.
  it("o TOTAL do cliente é o mesmo destacado ou não", () => {
    const total = totalACobrarDoCliente("1015", "200");
    expect(total.toString()).toBe("1215");
  });
});

// ============================================================
// Frete destacado e não destacado (Intertech, 27/08/2026)
// ============================================================
//
// Pedido 05270826 (Mari, Marketplace, IPEPO): a ficha somava R$ 280,80 de
// frete ao TOTAL do cliente num pedido cujo frete estava "não destacado".
//
// "Não destacado" quer dizer que a Intertech paga o transporte: o frete sai da
// MARGEM, como custo. Cobrá-lo também do cliente seria absorver o custo e
// faturá-lo ao mesmo tempo.
describe("freteCobradoDoCliente", () => {
  it("destacado: o cliente paga, e o frete entra na cobrança", () => {
    expect(freteCobradoDoCliente("280.80", true).toString()).toBe("280.8");
  });

  it("não destacado: a Intertech paga, e nada vai para a conta do cliente", () => {
    expect(freteCobradoDoCliente("280.80", false).toString()).toBe("0");
  });

  it("o pedido 05270826 fecha em 7.800, e não em 8.080,80", () => {
    // 1.050 × 6,00 + 500 × 3,00
    const itens = totaisDaFichaDoPedido([
      { quantidade: "1050", precoUnitario: "6.00" },
      { quantidade: "500", precoUnitario: "3.00" },
    ]);
    expect(itens.subtotal.toString()).toBe("7800");

    const naoDestacado = totalACobrarDoCliente(itens.subtotal, freteCobradoDoCliente("280.80", false));
    expect(naoDestacado.toString()).toBe("7800");

    // E o mesmo pedido COM frete destacado continua somando, como sempre.
    const destacado = totalACobrarDoCliente(itens.subtotal, freteCobradoDoCliente("280.80", true));
    expect(destacado.toString()).toBe("8080.8");
  });
});

// ---------- Identificação da folha: ORÇAMENTO ou PEDIDO ----------
//
// Pergunta da Cris em 31/08/2026, na folha do ORC-2026-0101: o canto superior
// direito dizia "PEDIDO 06270826" e, três linhas abaixo, "Orçamento em
// aberto". Os dois no mesmo papel. O número diário nasce com a cotação (é
// gatilho do banco no INSERT), então ele existia muito antes de existir
// pedido.
describe("identificacaoDaFolha", () => {
  it("orçamento em aberto não se anuncia como pedido, mesmo já tendo número diário", () => {
    const folha = identificacaoDaFolha({
      numeroDoPedido: "06270826",
      numeroDoOrcamento: "ORC-2026-0101",
      pedidoGerado: false,
    });
    expect(folha.titulo).toBe("ORÇAMENTO");
    expect(folha.subtitulo).toBe("ORC-2026-0101");
    expect(folha.situacao).toBe("Orçamento em aberto");
    // A regra que resolve o chamado: a palavra "PEDIDO" não aparece na folha
    // de um orçamento em aberto, e o número diário também não.
    expect(`${folha.titulo} ${folha.subtitulo} ${folha.situacao}`).not.toContain("PEDIDO");
    expect(`${folha.titulo} ${folha.subtitulo} ${folha.situacao}`).not.toContain("06270826");
  });

  it("pedido gerado traz o número do pedido, o do orçamento e a data", () => {
    const folha = identificacaoDaFolha({
      numeroDoPedido: "06270826",
      numeroDoOrcamento: "ORC-2026-0101",
      pedidoGerado: true,
      geradoEm: "27/08/2026",
    });
    expect(folha.titulo).toBe("PEDIDO 06270826");
    expect(folha.subtitulo).toBe("ORÇAMENTO ORC-2026-0101");
    expect(folha.situacao).toBe("Pedido gerado em 27/08/2026");
  });

  it("pedido gerado sem data não inventa uma", () => {
    const folha = identificacaoDaFolha({
      numeroDoPedido: "06270826",
      numeroDoOrcamento: "ORC-2026-0101",
      pedidoGerado: true,
      geradoEm: null,
    });
    expect(folha.situacao).toBe("Pedido gerado");
  });

  it("número faltando vira traço, e a folha continua imprimível", () => {
    const aberto = identificacaoDaFolha({
      numeroDoPedido: null,
      numeroDoOrcamento: "  ",
      pedidoGerado: false,
    });
    expect(aberto.subtitulo).toBe("—");

    const gerado = identificacaoDaFolha({
      numeroDoPedido: undefined,
      numeroDoOrcamento: undefined,
      pedidoGerado: true,
      geradoEm: "27/08/2026",
    });
    expect(gerado.titulo).toBe("PEDIDO —");
    expect(gerado.subtitulo).toBe("ORÇAMENTO —");
  });
});
