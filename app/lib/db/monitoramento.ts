import { supabase } from "../supabase";

export type MonitoramentoEvento = {
  id: string;
  occurred_at: string;
  event_type: string;
  path: string;
  duration_ms: number | null;
  context: Record<string, unknown>;
  profiles: { full_name: string } | null;
};

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

export async function listarEventosMonitoramento(desde: string): Promise<MonitoramentoEvento[]> {
  const { data, error } = await supabase
    .from("monitoring_events")
    .select("id, occurred_at, event_type, path, duration_ms, context, profiles(full_name)")
    .gte("occurred_at", desde)
    .order("occurred_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as MonitoramentoEvento[];
}
