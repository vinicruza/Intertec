import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthProvider";
import { ExigirAcesso, ExigirLogin } from "./auth/guards";
import LoginPage from "./pages/LoginPage";
import ShellLayout from "./pages/ShellLayout";
import InicioPage from "./pages/InicioPage";
import PerfilPage from "./pages/PerfilPage";
import InsumosPage from "./pages/InsumosPage";
import InsumoFormPage from "./pages/InsumoFormPage";
import ProdutosPage from "./pages/ProdutosPage";
import ProdutoFormPage from "./pages/ProdutoFormPage";
import AlocacaoPage from "./pages/AlocacaoPage";
import AlocacaoPeriodoPage from "./pages/AlocacaoPeriodoPage";
import KitsPage from "./pages/KitsPage";
import KitFormPage from "./pages/KitFormPage";
import SimuladorPage from "./pages/SimuladorPage";
import PedidosPage from "./pages/PedidosPage";
import PedidoDetalhePage from "./pages/PedidoDetalhePage";
import DREPage from "./pages/DREPage";
import ConfiguracoesPage from "./pages/ConfiguracoesPage";
import IntegridadePage from "./pages/IntegridadePage";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
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
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
