import { supabase } from "../supabase";

type EventoMonitoramento = {
  tipo: string;
  caminho?: string;
  duracaoMs?: number | null;
  contexto?: Record<string, unknown>;
};

export async function registrarEventoMonitoramento({
  tipo,
  caminho = window.location.pathname,
  duracaoMs = null,
  contexto = {},
}: EventoMonitoramento): Promise<void> {
  try {
    await supabase.rpc("log_monitoring_event", {
      p_event_type: tipo,
      p_path: caminho,
      p_duration_ms: duracaoMs == null ? null : Math.round(duracaoMs),
      p_context: contexto,
    });
  } catch {
    // Monitoramento nunca pode bloquear a operacao principal.
  }
}
