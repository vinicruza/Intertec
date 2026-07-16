import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";
import { registrarErroCliente } from "./lib/db/observabilidade";
import { ehErroDeChunk, recarregarUmaVez } from "./lib/recarregarChunk";

// Vite dispara este evento quando o pré-carregamento de um chunk falha (chunk
// antigo removido após deploy). Recarrega uma vez para pegar os novos hashes.
window.addEventListener("vite:preloadError", (evento) => {
  evento.preventDefault();
  recarregarUmaVez();
});

window.addEventListener("unhandledrejection", (evento) => {
  // Falha de chunk que escapou do wrapper lazy: recarrega em vez de logar ruído.
  if (ehErroDeChunk(evento.reason) && recarregarUmaVez()) return;
  void registrarErroCliente(evento.reason, { origem: "unhandledrejection" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
