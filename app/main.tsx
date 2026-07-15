import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";
import { registrarErroCliente } from "./lib/db/observabilidade";

window.addEventListener("unhandledrejection", (evento) => {
  void registrarErroCliente(evento.reason, { origem: "unhandledrejection" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
