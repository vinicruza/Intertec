// ============================================================
// Consulta de CNPJ e CEP — regras puras (24/08/2026)
// ============================================================
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Em 24/08/2026 a vendedora clicou em "Buscar CNPJ" e levou na tela:
//
//   "Sem conexão com o servidor. Confira a internet e tente de novo."
//
// A internet dela estava perfeita. Quem não respondeu foi um serviço DE FORA
// (a consulta pública de CNPJ), e a frase mandou ela procurar defeito onde não
// havia — e ainda deixou a dúvida de se o simulador tinha parado junto.
//
// Aqui ficam as três decisões que essa tela precisa tomar, sem depender de
// navegador, de rede ou de banco — por isso são testáveis:
//
//   1. o documento digitado pode ser consultado?
//   2. quando falha, QUAL foi o motivo?
//   3. que frase esse motivo vira para quem está vendendo?
//
// A regra de ouro das frases: dizer que o serviço externo é que falhou, e
// lembrar que dá para preencher à mão. Nenhum campo desta tela depende da
// consulta — ela é conveniência, não obrigação.

import { cnpjCpfValido, formatarCep, formatarCnpjCpf, formatarTelefone, somenteDigitos } from "./documentos";

export type AlvoConsulta = "cnpj" | "cep";

// Resposta da consulta pública de CNPJ (BrasilAPI /api/cnpj/v1).
export type CnpjApi = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  ddd_telefone_1?: string;
  email?: string;
};

// Resposta da consulta pública de CEP (BrasilAPI /api/cep/v2).
export type EnderecoApi = {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
};

// Motivo da falha. É o que separa "você digitou errado" de "o serviço de fora
// está fora do ar" — coisas que exigem reações opostas de quem está na tela.
export type MotivoFalha =
  | "invalido"       // o número digitado não fecha; nem vale a pena consultar
  | "nao_encontrado" // o serviço respondeu: não existe essa inscrição
  | "limite"         // o serviço recusou por excesso de consultas
  | "tempo"          // demorou demais e desistimos
  | "rede"           // o navegador não conseguiu falar com o serviço
  | "servico";       // o serviço respondeu com defeito próprio

export class ErroConsulta extends Error {
  readonly motivo: MotivoFalha;
  constructor(motivo: MotivoFalha, mensagem: string) {
    super(mensagem);
    this.name = "ErroConsulta";
    this.motivo = motivo;
  }
}

// Quanto tempo esperamos antes de desistir. Sem isto o botão fica em
// "Buscando..." para sempre quando o serviço de fora não responde nem recusa.
export const TEMPO_LIMITE_MS = 8000;

const NOME_DO_SERVICO: Record<AlvoConsulta, string> = {
  cnpj: "consulta pública de CNPJ",
  cep: "consulta pública de CEP",
};

export function mensagemDaFalha(motivo: MotivoFalha, alvo: AlvoConsulta): string {
  const servico = NOME_DO_SERVICO[alvo];
  const aMao =
    alvo === "cnpj"
      ? "Preencha os dados do cliente à mão e siga com o cadastro normalmente."
      : "Preencha o endereço à mão e siga com o cadastro normalmente.";

  switch (motivo) {
    case "invalido":
      return alvo === "cnpj"
        ? "Informe um CNPJ válido (14 dígitos) antes de buscar."
        : "Informe um CEP com 8 dígitos antes de buscar.";
    case "nao_encontrado":
      return alvo === "cnpj"
        ? "Este CNPJ não foi encontrado na base da Receita. Confira o número — o cadastro pode ser feito à mão do mesmo jeito."
        : "Este CEP não foi encontrado. Confira o número — o endereço pode ser preenchido à mão.";
    case "limite":
      return `A ${servico} está recusando novos pedidos neste momento (limite do serviço). Espere um minuto e tente de novo. ${aMao}`;
    case "tempo":
      return `A ${servico} demorou demais para responder e a busca foi cancelada. ${aMao}`;
    case "rede":
      // A frase que motivou tudo isto. Não fala em "sua internet" nem em "nosso
      // servidor": o que falhou foi um serviço de fora, e o resto do sistema
      // (simulador, pedidos, cadastro) continua funcionando.
      return `Não consegui falar com a ${servico} agora — é um serviço de fora do sistema, e o resto continua funcionando. ${aMao}`;
    case "servico":
      return `A ${servico} respondeu com erro neste momento. Tente de novo em instantes. ${aMao}`;
  }
}

// Código HTTP → motivo. O serviço público responde 404 para inscrição que não
// existe e 429 quando barra por excesso de consultas; o resto é defeito dele.
export function motivoDoStatus(status: number): MotivoFalha {
  if (status === 404) return "nao_encontrado";
  if (status === 429) return "limite";
  return "servico";
}

// Erro cru (do navegador, do supabase-js ou nosso) → motivo.
//
// "Failed to fetch" é o que o navegador entrega quando NÃO houve resposta HTTP
// utilizável: serviço fora, bloqueio de firewall/antivírus, extensão do
// navegador, ou resposta sem os cabeçalhos de CORS — que é exatamente o que a
// consulta pública devolve quando corta por excesso de uso.
export function classificarFalha(e: unknown): MotivoFalha {
  if (e instanceof ErroConsulta) return e.motivo;

  const nome = e instanceof Error ? e.name : "";
  const texto = e instanceof Error ? e.message : typeof e === "string" ? e : "";

  if (nome === "AbortError" || nome === "TimeoutError" || /timeout|abort/i.test(texto)) return "tempo";
  if (/failed to fetch|failed to send a request|networkerror|network error|load failed/i.test(texto)) {
    return "rede";
  }
  return "servico";
}

// Frase pronta para a tela, a partir de qualquer erro.
export function mensagemDaConsulta(e: unknown, alvo: AlvoConsulta): string {
  // Erro que já nasceu com frase nossa (veio da Edge Function, por exemplo)
  // passa direto: ele conhece o caso melhor do que a classificação genérica.
  if (e instanceof ErroConsulta && e.message) return e.message;
  return mensagemDaFalha(classificarFalha(e), alvo);
}

// Só dígitos, e só se o número fechar. Vale como defesa dupla: o botão da tela
// já fica desabilitado, mas nada impede que outro caminho chame a função.
export function documentoParaConsulta(valor: string | null | undefined, alvo: AlvoConsulta): string {
  const d = somenteDigitos(valor);
  const ok = alvo === "cnpj" ? d.length === 14 && cnpjCpfValido(d) : d.length === 8;
  if (!ok) throw new ErroConsulta("invalido", mensagemDaFalha("invalido", alvo));
  return d;
}

// ------------------------------------------------------------------
// Resposta do serviço → campos do formulário
// ------------------------------------------------------------------
//
// O serviço às vezes devolve o campo ausente, às vezes em branco, às vezes com
// espaço. Tudo isso vira string vazia, para a tela poder decidir com um simples
// "usa o que veio OU mantém o que já estava" sem apagar dado bom com dado ruim.

function texto(valor: string | null | undefined): string {
  return (valor ?? "").trim();
}

export type CamposDoCnpj = {
  tax_id: string;
  name: string;
  uf: string;
  billing_zip: string;
  billing_street: string;
  billing_number: string;
  billing_complement: string;
  billing_district: string;
  billing_city: string;
  billing_state: string;
  phone: string;
  email: string;
};

export function camposDoCnpj(dados: CnpjApi): CamposDoCnpj {
  const documento = somenteDigitos(dados.cnpj);
  const telefone = somenteDigitos(dados.ddd_telefone_1);
  const uf = texto(dados.uf).toUpperCase();
  return {
    tax_id: documento.length === 14 ? formatarCnpjCpf(documento) : "",
    name: texto(dados.razao_social) || texto(dados.nome_fantasia),
    uf,
    billing_zip: somenteDigitos(dados.cep).length === 8 ? formatarCep(dados.cep) : "",
    billing_street: texto(dados.logradouro),
    billing_number: texto(dados.numero),
    billing_complement: texto(dados.complemento),
    billing_district: texto(dados.bairro),
    billing_city: texto(dados.municipio),
    billing_state: uf,
    // A consulta traz o telefone com DDD colado; 10 ou 11 dígitos é o que o
    // cadastro aceita. Fora disso é lixo (ramal, número antigo) e não entra.
    phone: telefone.length === 10 || telefone.length === 11 ? formatarTelefone(telefone) : "",
    email: texto(dados.email).toLowerCase(),
  };
}

export type CamposDoCep = {
  zip: string;
  street: string;
  district: string;
  city: string;
  state: string;
};

export function camposDoCep(dados: EnderecoApi): CamposDoCep {
  return {
    zip: somenteDigitos(dados.cep).length === 8 ? formatarCep(dados.cep) : "",
    street: texto(dados.street),
    district: texto(dados.neighborhood),
    city: texto(dados.city),
    state: texto(dados.state).toUpperCase(),
  };
}
