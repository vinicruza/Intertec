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
import EmBrevePage from "./pages/EmBrevePage";

const queryClient = new QueryClient();

// Rotas que ainda são "em breve" (telas nas próximas sprints), cada uma
// protegida por perfil conforme o menu (docs/04-UX.md §2 / lib/roles.ts).
const rotasEmBreve: Array<{ caminho: string; titulo: string; sprint: string }> = [
  { caminho: "/pedidos", titulo: "Histórico de pedidos", sprint: "Sprint 11" },
  { caminho: "/dre", titulo: "DRE mensal", sprint: "Sprint 12" },
  { caminho: "/configuracoes", titulo: "Configurações", sprint: "Sprint 6+" },
];

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
              {rotasEmBreve.map((r) => (
                <Route
                  key={r.caminho}
                  path={r.caminho}
                  element={
                    <ExigirAcesso caminho={r.caminho}>
                      <EmBrevePage titulo={r.titulo} sprint={r.sprint} />
                    </ExigirAcesso>
                  }
                />
              ))}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
