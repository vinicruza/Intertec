import { supabase } from "../supabase";

type EventoMonitoramento = {
  tipo: string;
  caminho?: string;
  duracaoMs?: number | null;
  contexto?: Record<string, unknown>;
};

function normalizarCaminho(caminho: string): string {
  return caminho.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
    "/:id"
  );
}

export async function registrarEventoMonitoramento({
  tipo,
  caminho = window.location.pathname,
  duracaoMs = null,
  contexto = {},
}: EventoMonitoramento): Promise<void> {
  try {
    await supabase.rpc("log_monitoring_event", {
      p_event_type: tipo,
      p_path: normalizarCaminho(caminho),
      p_duration_ms: duracaoMs == null ? null : Math.round(duracaoMs),
      p_context: contexto,
    });
  } catch {
    // Monitoramento nunca pode bloquear a operacao principal.
  }
}
