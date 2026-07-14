import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { erro: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error("Erro nao tratado na interface", erro, info);
  }

  render() {
    if (!this.state.erro) return this.props.children;

    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--cor-fundo)] p-6">
        <div className="max-w-xl rounded-md border border-[var(--cor-borda)] bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Nao foi possivel abrir esta tela</h1>
          <p className="mt-2 text-sm text-[var(--cor-texto-suave)]">
            O sistema encontrou um erro ao carregar a pagina. Volte para a tela anterior ou recarregue o sistema.
          </p>
          <p className="mt-3 break-words rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {this.state.erro.message}
          </p>
          <button
            type="button"
            className="mt-4 rounded-md bg-[var(--cor-primaria)] px-4 py-2 text-sm font-medium text-white"
            onClick={() => window.location.assign("/")}
          >
            Voltar ao inicio
          </button>
        </div>
      </div>
    );
  }
}
