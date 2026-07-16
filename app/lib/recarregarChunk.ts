import { lazy, type ComponentType } from "react";

// Após um novo deploy, os arquivos de código (chunks) ganham um novo hash no
// nome. Uma aba aberta antes do deploy ainda referencia o chunk antigo, que
// deixou de existir — a navegação para uma tela lazy falha com
// "Failed to fetch dynamically imported module". A cura é recarregar a página
// UMA vez para buscar o index.html novo, com os hashes atualizados.

const CHAVE_RECARGA = "intertech:recarga-chunk";

// Falha típica de chunk ausente após deploy (varia por navegador).
export function ehErroDeChunk(erro: unknown): boolean {
  const msg = (erro instanceof Error ? erro.message : String(erro ?? "")).toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("failed to load module script")
  );
}

// Recarrega no máximo uma vez por origem de erro, evitando laço de reload caso
// o problema seja outro (ex.: chunk realmente indisponível/offline).
export function recarregarUmaVez(): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_RECARGA)) return false;
    sessionStorage.setItem(CHAVE_RECARGA, "1");
  } catch {
    // sessionStorage indisponível: recarrega mesmo assim (melhor que tela quebrada).
  }
  window.location.reload();
  return true;
}

// Limpa o guard após um carregamento bem-sucedido, liberando futuras recargas.
function limparGuard(): void {
  try {
    sessionStorage.removeItem(CHAVE_RECARGA);
  } catch {
    /* ignore */
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyComRetry<T extends ComponentType<any>>(importar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const modulo = await importar();
      limparGuard();
      return modulo;
    } catch (erro) {
      if (ehErroDeChunk(erro) && recarregarUmaVez()) {
        // Segura a renderização enquanto a página recarrega.
        return await new Promise<{ default: T }>(() => {});
      }
      throw erro;
    }
  });
}
