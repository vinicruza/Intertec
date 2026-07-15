import { supabase } from "../supabase";

export type ErroCliente = {
  id: string;
  occurred_at: string;
  path: string;
  message: string;
  user_agent: string | null;
  profiles: { full_name: string } | null;
};

export async function registrarErroCliente(erro: unknown, contexto: Record<string, unknown> = {}): Promise<void> {
  const normalizado = erro instanceof Error ? erro : new Error(String(erro));
  try {
    await supabase.rpc("log_client_error", {
      p_path: window.location.pathname,
      p_message: normalizado.message,
      p_stack: normalizado.stack ?? null,
      p_user_agent: navigator.userAgent,
      p_context: contexto,
    });
  } catch {
    // Observabilidade nunca pode causar um segundo erro na interface.
  }
}

export async function listarErrosRecentes(): Promise<ErroCliente[]> {
  const { data, error } = await supabase
    .from("client_errors")
    .select("id, occurred_at, path, message, user_agent, profiles(full_name)")
    .order("occurred_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as ErroCliente[];
}
