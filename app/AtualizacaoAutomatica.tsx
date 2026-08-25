import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { buscarVersaoPublicada, haVersaoNova, podeRecarregarSozinho, versaoEmExecucao } from "./lib/versao";

// De quanto em quanto tempo perguntar. Cinco minutos é barato (um arquivo de
// algumas dezenas de bytes) e rápido o bastante: uma correção publicada chega
// a quem está com a tela aberta antes de a pessoa terminar o pedido seguinte.
const INTERVALO_MS = 5 * 60 * 1000;

// Verifica se saiu versão nova e a coloca no ar sem depender de ninguém
// recarregar. Ver `lib/versao.ts` para o porquê e para as regras.
//
// Duas formas de entrar:
//   1. sozinha, na próxima troca de tela — o caminho normal, e ninguém nota;
//   2. pelo aviso, se a pessoa ficar parada na mesma tela.
export default function AtualizacaoAutomatica() {
  const location = useLocation();
  const [temVersaoNova, setTemVersaoNova] = useState(false);
  const caminhoAnterior = useRef(location.pathname);

  // ---------- pergunta de tempos em tempos ----------
  useEffect(() => {
    let vivo = true;
    async function conferir() {
      // Aba em segundo plano não precisa perguntar: quando ela volta, o
      // `visibilitychange` abaixo pergunta na hora.
      if (document.visibilityState !== "visible") return;
      const publicada = await buscarVersaoPublicada();
      if (!vivo) return;
      if (haVersaoNova(versaoEmExecucao(), publicada)) setTemVersaoNova(true);
    }
    void conferir();
    const timer = setInterval(() => void conferir(), INTERVALO_MS);
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("focus", conferir);
    return () => {
      vivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("focus", conferir);
    };
  }, []);

  // ---------- entra sozinha na troca de tela ----------
  useEffect(() => {
    const rotaMudou = caminhoAnterior.current !== location.pathname;
    const anterior = caminhoAnterior.current;
    caminhoAnterior.current = location.pathname;
    // Olha as DUAS pontas da navegação: sair da ficha também não pode
    // recarregar, senão a folha some da tela de quem mandou imprimir.
    if (
      podeRecarregarSozinho({ temVersaoNova, rotaMudou, caminho: location.pathname }) &&
      !anterior.includes("/ficha")
    ) {
      window.location.reload();
    }
  }, [location.pathname, temVersaoNova]);

  if (!temVersaoNova) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 print:hidden">
      <span>
        Saiu uma versão nova do sistema. Ela entra sozinha quando você trocar de tela.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-amber-900 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800"
      >
        Atualizar agora
      </button>
    </div>
  );
}
