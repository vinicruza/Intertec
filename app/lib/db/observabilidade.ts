import { supabase } from "../supabase";

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
        deployRef: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA ?? import.meta.env.VITE_APP_VERSION ?? null,
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
