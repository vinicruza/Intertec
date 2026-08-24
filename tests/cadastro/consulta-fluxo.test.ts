import { beforeEach, describe, expect, it, vi } from "vitest";

// O caminho que a busca de CNPJ percorre: primeiro a nossa função no servidor,
// e só se não der para falar com ela é que o navegador tenta o serviço público
// direto (o jeito antigo, que ficou de reserva). Estes testes existem porque a
// ordem errada aqui devolve duas coisas ruins: espera dobrada para a vendedora
// e limite do serviço público gasto à toa.

const invoke = vi.fn();
const registrarErroCliente = vi.fn();

vi.mock("@app/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

vi.mock("@app/lib/db/observabilidade", () => ({
  registrarErroCliente: (...args: unknown[]) => registrarErroCliente(...args),
}));

const { consultarCnpj } = await import("@app/lib/db/consultaReceita");

const CNPJ = "11.222.333/0001-81";
const DADOS = { cnpj: "11222333000181", razao_social: "Hospital Exemplo Ltda" };

function respostaDireta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  invoke.mockReset();
  registrarErroCliente.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("consulta de CNPJ", () => {
  it("usa a nossa função no servidor e nem toca no caminho direto", async () => {
    invoke.mockResolvedValue({ data: { dados: DADOS }, error: null });

    await expect(consultarCnpj(CNPJ)).resolves.toEqual(DADOS);
    expect(invoke).toHaveBeenCalledWith("consulta-receita", {
      body: { alvo: "cnpj", documento: "11222333000181" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cai para o caminho direto quando não dá para falar com a nossa função", async () => {
    // É o caso da função ainda não publicada e o da rede que corta só a nossa
    // chamada: a busca continua funcionando pelo jeito antigo.
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    vi.mocked(fetch).mockResolvedValue(respostaDireta(DADOS));

    await expect(consultarCnpj(CNPJ)).resolves.toEqual(DADOS);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("11222333000181");
  });

  it("aceita o veredito da nossa função e não repete a pergunta", async () => {
    const erro = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: respostaDireta({ erro: "Não encontrado na base pública.", motivo: "nao_encontrado" }, 404),
    });
    invoke.mockResolvedValue({ data: null, error: erro });

    await expect(consultarCnpj(CNPJ)).rejects.toMatchObject({ motivo: "nao_encontrado" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("registra a falha para nós quando os dois caminhos caem", async () => {
    // Antes disto a falha morria na tela: quando a cliente avisou pelo
    // WhatsApp, não havia um único registro em client_errors para consultar.
    invoke.mockResolvedValue({ data: null, error: new Error("Failed to send a request to the Edge Function") });
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(consultarCnpj(CNPJ)).rejects.toThrow();
    expect(registrarErroCliente).toHaveBeenCalledOnce();
    expect(registrarErroCliente.mock.calls[0][1]).toMatchObject({
      origem: "consulta-receita",
      alvo: "cnpj",
      motivo: "rede",
      caminho: "direto",
    });
  });

  it("não enche o painel de erro com CNPJ inexistente", async () => {
    invoke.mockResolvedValue({ data: { erro: "x", motivo: "nao_encontrado" }, error: null });

    await expect(consultarCnpj(CNPJ)).rejects.toThrow();
    expect(registrarErroCliente).not.toHaveBeenCalled();
  });

  it("desiste depois do tempo limite em vez de travar o botão", async () => {
    // Sem tempo limite o botão ficava em "Buscando..." até a pessoa recarregar
    // a página. E esperar de novo pelo caminho direto dobraria a espera para
    // ler a mesma frase — por isso o tempo esgotado é resposta final.
    vi.useFakeTimers();
    invoke.mockReturnValue(new Promise(() => {}));
    try {
      const consulta = consultarCnpj(CNPJ);
      const veredito = expect(consulta).rejects.toMatchObject({ motivo: "tempo" });
      await vi.advanceTimersByTimeAsync(8000);
      await veredito;
    } finally {
      vi.useRealTimers();
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("nem consulta CNPJ com dígito verificador errado", async () => {
    await expect(consultarCnpj("11.222.333/0001-82")).rejects.toMatchObject({ motivo: "invalido" });
    expect(invoke).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
