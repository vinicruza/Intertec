import { createClient } from "jsr:@supabase/supabase-js@2";

type Alerta = {
  id: string;
  tenant_id: string;
  error_group_id: string;
  severity: "critico" | "alto" | "medio" | "baixo";
  message: string;
  client_error_groups: {
    occurrences: number;
    last_path: string;
    message: string;
    profiles: { full_name: string } | null;
  } | null;
};

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-alert-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function escalarHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ erro: "Método não suportado" }, 405);

  const segredo = Deno.env.get("INTERTECH_ALERT_SECRET");
  if (!segredo) return json({ erro: "Segredo de alerta não configurado" }, 500);
  if (req.headers.get("x-alert-secret") !== segredo) {
    return json({ erro: "Não autorizado" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const telegramToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const telegramChatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!url || !serviceRole) return json({ erro: "Supabase mal configurado" }, 500);
  if (!telegramToken || !telegramChatId) return json({ configured: false, sent: 0 });

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("client_error_alerts")
    .select("id, tenant_id, error_group_id, severity, message, client_error_groups(occurrences,last_path,message,profiles:last_user_id(full_name))")
    .is("sent_at", null)
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) return json({ erro: error.message }, 500);

  const alertas = (data ?? []) as unknown as Alerta[];
  let enviados = 0;

  for (const alerta of alertas) {
    const grupo = alerta.client_error_groups;
    const texto = [
      `<b>[INTERTECH ERRO]</b> ${escalarHtml(alerta.severity.toUpperCase())}`,
      `Tela: <code>${escalarHtml(grupo?.last_path ?? "-")}</code>`,
      `Usuário: ${escalarHtml(grupo?.profiles?.full_name ?? "-")}`,
      `Ocorrências: ${grupo?.occurrences ?? 1}`,
      `Erro: ${escalarHtml(grupo?.message ?? alerta.message)}`,
    ].join("\n");

    const resposta = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: texto,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      await supabase
        .from("client_error_alerts")
        .update({ send_error: detalhe.slice(0, 1000) })
        .eq("id", alerta.id);
      continue;
    }

    enviados += 1;
    await supabase
      .from("client_error_alerts")
      .update({ sent_at: new Date().toISOString(), send_error: null })
      .eq("id", alerta.id);
    await supabase
      .from("client_error_groups")
      .update({ alert_sent_at: new Date().toISOString(), alert_needed: false })
      .eq("id", alerta.error_group_id);
  }

  return json({ configured: true, sent: enviados, pending: alertas.length - enviados });
});
