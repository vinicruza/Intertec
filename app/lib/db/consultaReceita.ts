import { supabase } from "../supabase";
import { registrarErroCliente } from "./observabilidade";
import {
  ErroConsulta,
  TEMPO_LIMITE_MS,
  classificarFalha,
  documentoParaConsulta,
  mensagemDaFalha,
  motivoDoStatus,
  type AlvoConsulta,
  type CnpjApi,
  type EnderecoApi,
  type MotivoFalha,
} from "../../../lib/cadastro/consultaReceita";

// ============================================================
// Consulta de CNPJ e CEP — o caminho até o serviço público
// ============================================================
//
// COMO ERA (até 24/08/2026)
//
// O navegador da vendedora chamava a API pública direto. Isso significa que
// cada máquina consultava com o IP dela: o limite de consultas do serviço era
// gasto por pessoa, e qualquer firewall, antivírus ou extensão de navegador no
// meio do caminho derrubava a busca sem explicação nenhuma para nós.
//
// COMO É AGORA
//
// 1º) pede à NOSSA função no servidor (`consulta-receita`), que fala com o
//     serviço público de um único lugar e guarda a resposta em cache;
// 2º) se não der para falar com a nossa função (rede da vendedora, função
//     ainda não publicada), tenta o caminho antigo, direto do navegador —
//     melhor uma busca pelo caminho velho do que nenhuma busca;
// 3º) o que falhar de verdade vira UMA frase honesta na tela e UM registro em
//     `client_errors`. Antes disto a falha morria na tela: quando a cliente
//     avisou pelo WhatsApp, não havia um único registro para consultar.
//
// Nada aqui é obrigatório para vender: a consulta preenche campos que a pessoa
// também pode digitar.

const BASE_PUBLICA: Record<AlvoConsulta, string> = {
  cnpj: "https://brasilapi.com.br/api/cnpj/v1/",
  cep: "https://brasilapi.com.br/api/cep/v2/",
};

type RespostaFuncao = { dados?: unknown; erro?: string; motivo?: MotivoFalha };

export async function consultarCnpj(valor: string): Promise<CnpjApi> {
  return await consultar<CnpjApi>("cnpj", valor);
}

export async function consultarCep(valor: string): Promise<EnderecoApi> {
  return await consultar<EnderecoApi>("cep", valor);
}

async function consultar<T>(alvo: AlvoConsulta, valor: string): Promise<T> {
  const documento = documentoParaConsulta(valor, alvo);
  try {
    return await viaServidor<T>(alvo, documento);
  } catch (falhaServidor) {
    // Recado do nosso servidor ("não existe", "limite estourado") é palavra
    // final: repetir a mesma pergunta pelo caminho direto só faria a pessoa
    // esperar o dobro para ler a mesma resposta.
    if (falhaServidor instanceof ErroConsulta) throw registrado(falhaServidor, alvo, documento, "servidor");
    try {
      return await direto<T>(alvo, documento);
    } catch (falhaDireta) {
      throw registrado(falhaDireta, alvo, documento, "direto");
    }
  }
}

// ---------- Caminho 1: a nossa função no servidor ----------

async function viaServidor<T>(alvo: AlvoConsulta, documento: string): Promise<T> {
  const { data, error } = await comTempoLimite(
    supabase.functions.invoke<RespostaFuncao>("consulta-receita", { body: { alvo, documento } }),
    alvo
  );

  if (error) {
    const corpo = await corpoDoErro(error);
    // Só é "palavra final" quando veio no nosso formato, com motivo. Um 404 do
    // portão de funções (função ainda não publicada) não tem motivo e cai fora
    // daqui de propósito, para o caminho direto assumir.
    if (corpo?.motivo) throw new ErroConsulta(corpo.motivo, mensagemDaFalha(corpo.motivo, alvo));
    throw error;
  }
  // A frase que a pessoa lê é sempre a nossa: a função devolve o motivo, e
  // quem sabe falar com quem está vendendo é a tela.
  if (data?.motivo) throw new ErroConsulta(data.motivo, mensagemDaFalha(data.motivo, alvo));
  if (!data?.dados) throw new Error("Resposta vazia da consulta.");
  return data.dados as T;
}

async function corpoDoErro(error: unknown): Promise<RespostaFuncao | null> {
  const resposta = (error as { context?: unknown }).context;
  if (!(resposta instanceof Response)) return null;
  try {
    return (await resposta.clone().json()) as RespostaFuncao;
  } catch {
    return null;
  }
}

// ---------- Caminho 2: direto do navegador (reserva) ----------

async function direto<T>(alvo: AlvoConsulta, documento: string): Promise<T> {
  const resposta = await fetch(`${BASE_PUBLICA[alvo]}${documento}`, {
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!resposta.ok) {
    const motivo = motivoDoStatus(resposta.status);
    throw new ErroConsulta(motivo, mensagemDaFalha(motivo, alvo));
  }
  return (await resposta.json()) as T;
}


// ---------- Tempo limite ----------

// O supabase-js não aceita sinal de cancelamento em `functions.invoke`, então
// o limite é imposto por fora. Sem isto o botão fica em "Buscando..." até a
// pessoa desistir e recarregar a página.
//
// Estourar o tempo é resposta final, não motivo para tentar o caminho direto:
// dois limites em sequência deixariam a pessoa dezesseis segundos olhando para
// um botão travado antes de ler a mesma frase.
async function comTempoLimite<T>(promessa: Promise<T>, alvo: AlvoConsulta): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, rejeita) => {
        relogio = setTimeout(
          () => rejeita(new ErroConsulta("tempo", mensagemDaFalha("tempo", alvo))),
          TEMPO_LIMITE_MS
        );
      }),
    ]);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

// ---------- Registro da falha ----------

// A falha continua sendo mostrada na tela; o registro é para NÓS. Sem ele, a
// única prova do problema é o print que a cliente manda pelo WhatsApp.
function registrado(erro: unknown, alvo: AlvoConsulta, documento: string, caminho: "servidor" | "direto"): unknown {
  const motivo = classificarFalha(erro);
  // "Não existe essa inscrição" é resposta correta do serviço, não defeito
  // nosso — registrar isso encheria o painel de erro com erro de digitação.
  if (motivo !== "nao_encontrado" && motivo !== "invalido") {
    void registrarErroCliente(erro, { origem: "consulta-receita", alvo, motivo, caminho, documento });
  }
  return erro;
}
