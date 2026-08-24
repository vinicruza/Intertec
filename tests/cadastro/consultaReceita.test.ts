import { describe, expect, it } from "vitest";
import {
  ErroConsulta,
  camposDoCep,
  camposDoCnpj,
  classificarFalha,
  documentoParaConsulta,
  mensagemDaConsulta,
  mensagemDaFalha,
  motivoDoStatus,
  type MotivoFalha,
} from "../../lib/cadastro/consultaReceita";

// 24/08/2026 — a vendedora clicou em "Buscar CNPJ" com a internet perfeita e
// leu "Sem conexão com o servidor. Confira a internet e tente de novo.".
// Quem não respondeu foi o serviço público de consulta, fora do sistema.
// Estes testes prendem as duas coisas que aquele dia ensinou: classificar
// direito o que falhou, e não culpar a internet de quem está vendendo.

const MOTIVOS: MotivoFalha[] = ["invalido", "nao_encontrado", "limite", "tempo", "rede", "servico"];

describe("classificarFalha", () => {
  it("reconhece a falha de rede do navegador", () => {
    // É isto que o navegador entrega quando não houve resposta utilizável:
    // serviço fora, firewall, antivírus, extensão ou resposta sem CORS.
    expect(classificarFalha(new TypeError("Failed to fetch"))).toBe("rede");
    expect(classificarFalha(new Error("NetworkError when attempting to fetch resource."))).toBe("rede");
    expect(classificarFalha(new Error("Load failed"))).toBe("rede");
    expect(classificarFalha(new Error("Failed to send a request to the Edge Function"))).toBe("rede");
  });

  it("separa tempo esgotado de falha de rede", () => {
    const abortado = new Error("The operation was aborted.");
    abortado.name = "AbortError";
    expect(classificarFalha(abortado)).toBe("tempo");

    const estourou = new Error("signal timed out");
    estourou.name = "TimeoutError";
    expect(classificarFalha(estourou)).toBe("tempo");
  });

  it("preserva o motivo de um erro que já veio classificado", () => {
    expect(classificarFalha(new ErroConsulta("limite", "x"))).toBe("limite");
    expect(classificarFalha(new ErroConsulta("nao_encontrado", "x"))).toBe("nao_encontrado");
  });

  it("trata o desconhecido como defeito do serviço, nunca como internet da vendedora", () => {
    expect(classificarFalha(new Error("qualquer coisa"))).toBe("servico");
    expect(classificarFalha(null)).toBe("servico");
    expect(classificarFalha({})).toBe("servico");
  });
});

describe("motivoDoStatus", () => {
  it("traduz o que o serviço público responde", () => {
    expect(motivoDoStatus(404)).toBe("nao_encontrado");
    expect(motivoDoStatus(429)).toBe("limite");
    expect(motivoDoStatus(500)).toBe("servico");
    expect(motivoDoStatus(502)).toBe("servico");
  });
});

describe("mensagem mostrada na tela", () => {
  it("nunca manda conferir a internet nem culpa o nosso servidor", () => {
    for (const alvo of ["cnpj", "cep"] as const) {
      for (const motivo of MOTIVOS) {
        const frase = mensagemDaFalha(motivo, alvo);
        expect(frase, `${motivo}/${alvo}`).not.toMatch(/confira a internet|sem conexão com o servidor/i);
        expect(frase.length, `${motivo}/${alvo}`).toBeGreaterThan(20);
      }
    }
  });

  it("diz que dá para preencher à mão quando a culpa é do serviço de fora", () => {
    for (const motivo of ["limite", "tempo", "rede", "servico"] as const) {
      expect(mensagemDaFalha(motivo, "cnpj"), motivo).toMatch(/à mão/i);
    }
  });

  it("na falha de rede, avisa que é serviço de fora e que o resto funciona", () => {
    const frase = mensagemDaFalha("rede", "cnpj");
    expect(frase).toMatch(/fora do sistema/i);
    expect(frase).toMatch(/continua funcionando/i);
  });

  it("erro cru vira frase pronta pelo alvo consultado", () => {
    expect(mensagemDaConsulta(new TypeError("Failed to fetch"), "cnpj")).toBe(mensagemDaFalha("rede", "cnpj"));
    expect(mensagemDaConsulta(new TypeError("Failed to fetch"), "cep")).toBe(mensagemDaFalha("rede", "cep"));
  });

  it("respeita a frase de um erro que já nasceu explicado", () => {
    const pronto = new ErroConsulta("limite", "Frase combinada com o servidor.");
    expect(mensagemDaConsulta(pronto, "cnpj")).toBe("Frase combinada com o servidor.");
  });
});

describe("documentoParaConsulta", () => {
  it("devolve só os dígitos do que pode ser consultado", () => {
    expect(documentoParaConsulta("11.222.333/0001-81", "cnpj")).toBe("11222333000181");
    expect(documentoParaConsulta("04538-133", "cep")).toBe("04538133");
  });

  it("recusa antes de gastar consulta com número que não fecha", () => {
    // CNPJ com dígito verificador errado nem chega a sair do navegador.
    expect(() => documentoParaConsulta("11222333000182", "cnpj")).toThrow(ErroConsulta);
    expect(() => documentoParaConsulta("112223330001", "cnpj")).toThrow(ErroConsulta);
    // CPF é documento válido no cadastro, mas não existe consulta de CPF.
    expect(() => documentoParaConsulta("529.982.247-25", "cnpj")).toThrow(ErroConsulta);
    expect(() => documentoParaConsulta("0453813", "cep")).toThrow(ErroConsulta);
    expect(() => documentoParaConsulta("", "cep")).toThrow(ErroConsulta);
  });

  it("classifica a recusa como documento inválido", () => {
    try {
      documentoParaConsulta("11222333000182", "cnpj");
      expect.unreachable("devia ter recusado");
    } catch (e) {
      expect((e as ErroConsulta).motivo).toBe("invalido");
    }
  });
});

describe("camposDoCnpj", () => {
  it("traz razão social, endereço e telefone já formatados", () => {
    const campos = camposDoCnpj({
      cnpj: "11222333000181",
      razao_social: "Hospital Exemplo Ltda",
      cep: "04538133",
      logradouro: "Avenida Brigadeiro Faria Lima",
      numero: "3477",
      complemento: "Andar 8",
      bairro: "Itaim Bibi",
      municipio: "São Paulo",
      uf: "sp",
      ddd_telefone_1: "1132650000",
      email: "COMPRAS@EXEMPLO.COM.BR",
    });
    expect(campos.tax_id).toBe("11.222.333/0001-81");
    expect(campos.name).toBe("Hospital Exemplo Ltda");
    expect(campos.uf).toBe("SP");
    expect(campos.billing_state).toBe("SP");
    expect(campos.billing_zip).toBe("04538-133");
    expect(campos.billing_city).toBe("São Paulo");
    expect(campos.phone).toBe("(11) 3265-0000");
    expect(campos.email).toBe("compras@exemplo.com.br");
  });

  it("usa o nome fantasia quando não há razão social", () => {
    expect(camposDoCnpj({ nome_fantasia: "Clínica Exemplo" }).name).toBe("Clínica Exemplo");
  });

  it("devolve vazio no lugar de dado quebrado, para não sujar o cadastro", () => {
    // Campo em branco vira vazio; a tela mantém o que já estava digitado em vez
    // de apagar dado bom com dado ruim.
    const campos = camposDoCnpj({
      cnpj: "112223330001",       // incompleto
      razao_social: "   ",
      cep: "0453",                // incompleto
      ddd_telefone_1: "1132",     // não é telefone
      municipio: "  Campinas  ",
    });
    expect(campos.tax_id).toBe("");
    expect(campos.name).toBe("");
    expect(campos.billing_zip).toBe("");
    expect(campos.phone).toBe("");
    expect(campos.billing_city).toBe("Campinas");
  });

  it("aguenta resposta sem campo nenhum", () => {
    const campos = camposDoCnpj({});
    expect(Object.values(campos).every((v) => v === "")).toBe(true);
  });
});

describe("camposDoCep", () => {
  it("normaliza o endereço devolvido", () => {
    const campos = camposDoCep({
      cep: "04538133",
      street: "Avenida Brigadeiro Faria Lima",
      neighborhood: "Itaim Bibi",
      city: "São Paulo",
      state: "sp",
    });
    expect(campos.zip).toBe("04538-133");
    expect(campos.state).toBe("SP");
    expect(campos.street).toBe("Avenida Brigadeiro Faria Lima");
  });

  it("aguenta resposta vazia", () => {
    expect(camposDoCep({})).toEqual({ zip: "", street: "", district: "", city: "", state: "" });
  });
});
