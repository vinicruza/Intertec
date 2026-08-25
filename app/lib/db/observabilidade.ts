import { supabase } from "../supabase";
import { versaoEmExecucao } from "../versao";

export type ErroCliente = {
  id: string;
  occurred_at: string;
  path: string;
  message: string;
  user_agent: string | null;
  severity: "critico" | "alto" | "medio" | "baixo";
  fingerprint: string | null;
  profiles: { full_name: string } | null;
};

export type GrupoErroCliente = {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  severity: "critico" | "alto" | "medio" | "baixo";
  status: "novo" | "em_analise" | "corrigido" | "ignorado";
  message: string;
  last_path: string;
  stack_preview: string | null;
  deploy_ref: string | null;
  alert_needed: boolean;
  alert_sent_at: string | null;
  profiles: { full_name: string } | null;
};

export type AlertaErroCliente = {
  id: string;
  created_at: string;
  severity: "critico" | "alto" | "medio" | "baixo";
  message: string;
  sent_at: string | null;
  send_error: string | null;
};

export async function registrarErroCliente(erro: unknown, contexto: Record<string, unknown> = {}): Promise<void> {
  const normalizado = erro instanceof Error ? erro : new Error(String(erro));
  try {
    await supabase.rpc("log_client_error", {
      p_path: window.location.pathname,
      p_message: normalizado.message,
      p_stack: normalizado.stack ?? null,
      p_user_agent: navigator.userAgent,
      p_context: {
        ...contexto,
        href: window.location.href,
        // Até 25/08/2026 as duas variáveis abaixo nunca foram definidas no
        // build, e todo erro entrava com `deploy_ref` nulo — impossível saber
        // de qual versão o erro veio. `versaoEmExecucao()` sempre tem valor.
        deployRef: versaoEmExecucao(),
      },
    });
  } catch {
    // Observabilidade nunca pode causar um segundo erro na interface.
  }
}

export async function listarErrosRecentes(): Promise<ErroCliente[]> {
  const { data, error } = await supabase
    .from("client_errors")
    .select("id, occurred_at, path, message, user_agent, severity, fingerprint, profiles(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as ErroCliente[];
}

export async function listarGruposDeErros(): Promise<GrupoErroCliente[]> {
  const { data, error } = await supabase
    .from("client_error_groups")
    .select("id, first_seen_at, last_seen_at, occurrences, severity, status, message, last_path, stack_preview, deploy_ref, alert_needed, alert_sent_at, profiles:last_user_id(full_name)")
    .order("last_seen_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as unknown as GrupoErroCliente[];
}

export async function listarAlertasDeErrosPendentes(): Promise<AlertaErroCliente[]> {
  const { data, error } = await supabase
    .from("client_error_alerts")
    .select("id, created_at, severity, message, sent_at, send_error")
    .is("sent_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as AlertaErroCliente[];
}

export async function atualizarStatusGrupoErro(
  id: string,
  status: GrupoErroCliente["status"]
): Promise<void> {
  const { error } = await supabase
    .from("client_error_groups")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

// ============================================================
// Erro que a pessoa VÊ na tela
// ============================================================
//
// `registrarErroCliente` acima cobre o que QUEBRA: tela que caiu, promessa não
// tratada. Erro tratado — aquele que vira uma frase em vermelho e deixa a
// pessoa seguir — não passava por lugar nenhum. Foi assim que um erro de SQL
// cru chegou a uma vendedora em 25/08/2026 e o sistema não soube: a equipe
// descobriu por print no WhatsApp.
//
// A `origem: "tela"` importa: é ela que o `classify_client_error` usa para não
// carimbar toda recusa de regra de negócio como crítica.

// Quantas vezes o mesmo erro pode ser registrado por sessão. Uma consulta que
// se repete a cada minuto registraria 60 vezes por hora a mesma linha; o
// agrupamento do banco aguenta, mas a tela de Monitoramento vira ruído.
const INTERVALO_MESMO_ERRO_MS = 10 * 60 * 1000;
const ultimoRegistroPorChave = new Map<string, number>();

// Decisão pura, para ter teste próprio: já registrei este erro agora há pouco?
export function devoRegistrarErroDeTela(
  chave: string,
  agora: number,
  ultimos: Map<string, number>,
  intervaloMs: number = INTERVALO_MESMO_ERRO_MS
): boolean {
  const anterior = ultimos.get(chave);
  return anterior === undefined || agora - anterior >= intervaloMs;
}

export function registrarErroDeTela(erro: unknown, contexto: Record<string, unknown> = {}): void {
  const mensagem =
    erro instanceof Error
      ? erro.message
      : erro && typeof erro === "object" && "message" in erro && typeof erro.message === "string"
        ? erro.message
        : String(erro);
  if (!mensagem) return;

  const chave = `${window.location.pathname}|${mensagem}`;
  const agora = Date.now();
  if (!devoRegistrarErroDeTela(chave, agora, ultimoRegistroPorChave)) return;
  ultimoRegistroPorChave.set(chave, agora);

  void registrarErroCliente(erro, { ...contexto, origem: "tela" });
}
