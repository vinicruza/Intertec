import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { AuthProvider } from "./auth/AuthProvider";
import { ExigirAcesso, ExigirLogin } from "./auth/guards";
import { lazyComRetry } from "./lib/recarregarChunk";
const LoginPage = lazyComRetry(() => import("./pages/LoginPage"));
const ShellLayout = lazyComRetry(() => import("./pages/ShellLayout"));
const InicioPage = lazyComRetry(() => import("./pages/InicioPage"));
const PerfilPage = lazyComRetry(() => import("./pages/PerfilPage"));
const InsumosPage = lazyComRetry(() => import("./pages/InsumosPage"));
const InsumoFormPage = lazyComRetry(() => import("./pages/InsumoFormPage"));
const ProdutosPage = lazyComRetry(() => import("./pages/ProdutosPage"));
const ProdutoFormPage = lazyComRetry(() => import("./pages/ProdutoFormPage"));
const AlocacaoPage = lazyComRetry(() => import("./pages/AlocacaoPage"));
const AlocacaoPeriodoPage = lazyComRetry(() => import("./pages/AlocacaoPeriodoPage"));
const KitsPage = lazyComRetry(() => import("./pages/KitsPage"));
const KitFormPage = lazyComRetry(() => import("./pages/KitFormPage"));
const SimuladorPage = lazyComRetry(() => import("./pages/SimuladorPage"));
const PedidosPage = lazyComRetry(() => import("./pages/PedidosPage"));
const PedidoDetalhePage = lazyComRetry(() => import("./pages/PedidoDetalhePage"));
const DREPage = lazyComRetry(() => import("./pages/DREPage"));
const ConfiguracoesPage = lazyComRetry(() => import("./pages/ConfiguracoesPage"));
const IntegridadePage = lazyComRetry(() => import("./pages/IntegridadePage"));

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="p-6 text-sm text-[var(--cor-texto-suave)]">Carregando tela…</div>}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ExigirLogin>
                  <ShellLayout />
                </ExigirLogin>
              }
            >
              <Route path="/" element={<InicioPage />} />
              <Route path="/perfil" element={<PerfilPage />} />
              <Route
                path="/insumos"
                element={<ExigirAcesso caminho="/insumos"><InsumosPage /></ExigirAcesso>}
              />
              <Route
                path="/insumos/novo"
                element={<ExigirAcesso caminho="/insumos"><InsumoFormPage /></ExigirAcesso>}
              />
              <Route
                path="/insumos/:id"
                element={<ExigirAcesso caminho="/insumos"><InsumoFormPage /></ExigirAcesso>}
              />
              <Route
                path="/produtos"
                element={<ExigirAcesso caminho="/produtos"><ProdutosPage /></ExigirAcesso>}
              />
              <Route
                path="/produtos/novo"
                element={<ExigirAcesso caminho="/produtos"><ProdutoFormPage /></ExigirAcesso>}
              />
              <Route
                path="/produtos/:id"
                element={<ExigirAcesso caminho="/produtos"><ProdutoFormPage /></ExigirAcesso>}
              />
              <Route
                path="/alocacao"
                element={<ExigirAcesso caminho="/alocacao"><AlocacaoPage /></ExigirAcesso>}
              />
              <Route
                path="/alocacao/:id"
                element={<ExigirAcesso caminho="/alocacao"><AlocacaoPeriodoPage /></ExigirAcesso>}
              />
              <Route
                path="/kits"
                element={<ExigirAcesso caminho="/kits"><KitsPage /></ExigirAcesso>}
              />
              <Route
                path="/kits/novo"
                element={<ExigirAcesso caminho="/kits"><KitFormPage /></ExigirAcesso>}
              />
              <Route
                path="/kits/:id"
                element={<ExigirAcesso caminho="/kits"><KitFormPage /></ExigirAcesso>}
              />
              <Route
                path="/simulador"
                element={<ExigirAcesso caminho="/simulador"><SimuladorPage /></ExigirAcesso>}
              />
              <Route
                path="/pedidos"
                element={<ExigirAcesso caminho="/pedidos"><PedidosPage /></ExigirAcesso>}
              />
              <Route
                path="/pedidos/:id"
                element={<ExigirAcesso caminho="/pedidos"><PedidoDetalhePage /></ExigirAcesso>}
              />
              <Route
                path="/dre"
                element={<ExigirAcesso caminho="/dre"><DREPage /></ExigirAcesso>}
              />
              <Route
                path="/configuracoes"
                element={<ExigirAcesso caminho="/configuracoes"><ConfiguracoesPage /></ExigirAcesso>}
              />
              <Route
                path="/integridade"
                element={<ExigirAcesso caminho="/integridade"><IntegridadePage /></ExigirAcesso>}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
