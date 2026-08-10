import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { registrarEventoMonitoramento } from "./lib/db/monitoramento";

export default function MonitoramentoRotas() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { perfil } = useAuth();
  const ultimoRegistro = useRef<{ chave: string; em: number } | null>(null);

  useEffect(() => {
    if (!perfil) return;

    const inicio = performance.now();
    const chave = `${location.pathname}${location.search}`;
    const anterior = ultimoRegistro.current;
    if (anterior?.chave === chave && inicio - anterior.em < 1000) return;
    ultimoRegistro.current = { chave, em: inicio };

    let cancelado = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelado) return;
        void registrarEventoMonitoramento({
          tipo: "page_view",
          caminho: chave,
          duracaoMs: performance.now() - inicio,
          contexto: { navigationType },
        });
      });
    });

    return () => {
      cancelado = true;
    };
  }, [location.pathname, location.search, navigationType, perfil]);

  return null;
}
