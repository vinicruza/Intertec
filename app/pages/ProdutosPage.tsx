import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listarCategoriasProduto, listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { useAuth } from "../auth/AuthProvider";
import { perfilPodeEditarProduto } from "../lib/roles";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

export default function ProdutosPage() {
  const navigate = useNavigate();
  const { perfil } = useAuth();
  const podeEditar = perfil ? perfilPodeEditarProduto(perfil.perfil) : false;
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  // Produto inativo continua na lista, com selo — some só de onde se vende.
  // Sem o filtro, achar o que já foi tirado de circulação exigiria varrer a
  // lista inteira procurando o selo (08/09/2026).
  const [situacao, setSituacao] = useState<"todos" | "ativos" | "inativos">("todos");
  const produtos = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const categorias = useQuery({ queryKey: ["categorias-produto"], queryFn: listarCategoriasProduto });
  const filtrados = useMemo(() => (produtos.data ?? []).filter((p) => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const situacaoBate =
      situacao === "todos" ||
      (situacao === "ativos" && p.status !== "inactive") ||
      (situacao === "inativos" && p.status === "inactive");
    return situacaoBate && (!categoria || p.category_id === categoria) && (!termo ||
      `${p.code} ${p.legacy_code ?? ""} ${p.name} ${p.nf_description ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo));
  }), [produtos.data, busca, categoria, situacao]);

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div><h1 className="text-3xl font-semibold tracking-[-0.035em]">Produtos e fichas</h1><p className="mt-1 text-sm text-[var(--cor-texto-suave)]">Catálogo organizado pelas categorias da Intertech Surgical.</p></div>
      {podeEditar && <Link to="/produtos/novo"><Button>Novo produto</Button></Link>}
    </div>
    <Card className="grid gap-3 p-4 md:grid-cols-[1fr_18rem_12rem]">
      <Input aria-label="Buscar produtos" placeholder="Buscar por código novo, código antigo, nome ou descrição de NF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <select aria-label="Filtrar categoria" className="min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        <option value="">Todas as categorias</option>{(categorias.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.prefix} — {c.name}</option>)}
      </select>
      <select aria-label="Filtrar situação" className="min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 text-sm" value={situacao} onChange={(e) => setSituacao(e.target.value as "todos" | "ativos" | "inativos")}>
        <option value="todos">Ativos e inativos</option>
        <option value="ativos">Só ativos</option>
        <option value="inativos">Só inativos</option>
      </select>
    </Card>
    {produtos.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
    {produtos.error && <p className="text-red-600">Erro ao carregar produtos.</p>}
    {!produtos.isLoading && <p className="text-xs text-[var(--cor-texto-suave)]">{filtrados.length} produto(s) encontrado(s)</p>}
    <div className="grid gap-3 md:hidden">
      {filtrados.map((p) => <button key={p.id} type="button" disabled={!podeEditar} className={`rounded-2xl border border-[var(--cor-borda)] bg-white p-4 text-left shadow-[var(--sombra-cartao)] ${podeEditar ? "cursor-pointer" : "cursor-default"}`} onClick={() => podeEditar && navigate(`/produtos/${p.id}`)}>
        <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-bold text-[var(--cor-primaria)]">{p.code}</div><div className="mt-1 font-semibold">{p.name}</div>{p.nf_description && <div className="mt-1 text-sm text-[var(--cor-texto-suave)]">NF: {p.nf_description}</div>}</div><div className="flex flex-col items-end gap-1"><Badge>{p.category ?? "—"}</Badge>{p.status === "inactive" && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">inativo</span>}</div></div>
        <div className="mt-3 flex justify-between text-sm text-[var(--cor-texto-suave)]"><span>{p.legacy_code ? `Anterior: ${p.legacy_code}` : ""}</span><strong className="text-[var(--cor-texto)]">CMV {reais(p.cmv)}</strong></div>
      </button>)}
    </div>
    <Card className="hidden overflow-x-auto p-0 md:block"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
      <th className="px-5 py-3 font-medium">Código</th><th className="px-5 py-3 font-medium">Nome</th>
      {/* Nome fiscal, paralelo ao nome do catálogo: sem gramatura, sem TNT/SMS
          e sem origem — regra combinada em 04/08/2026. */}
      <th className="px-5 py-3 font-medium">Descrição NF</th>
      <th className="px-5 py-3 font-medium">Categoria</th><th className="px-5 py-3 font-medium">CMV</th></tr></thead><tbody>
      {filtrados.map((p) => <tr key={p.id} className={`border-b border-[var(--cor-borda)] last:border-0 ${podeEditar ? "cursor-pointer hover:bg-[var(--cor-fundo)]" : ""}`} onClick={() => podeEditar && navigate(`/produtos/${p.id}`)}>
        <td className="px-5 py-3"><strong className="font-mono text-[var(--cor-primaria)]">{p.code}</strong>{p.erp_code && <div className="text-xs text-[var(--cor-texto-suave)]">ERP {p.erp_code}</div>}{p.legacy_code && <div className="text-xs text-[var(--cor-texto-suave)]">antigo {p.legacy_code}</div>}</td><td className="px-5 py-3 font-medium">{p.name}</td>
        <td className="px-5 py-3">
          {p.nf_description ?? <span className="text-[var(--cor-texto-suave)]">—</span>}
          {p.nf_description_source === "manual" && (
            <div className="text-xs text-[var(--cor-texto-suave)]">ajustada à mão</div>
          )}
        </td>
        <td className="px-5 py-3"><Badge>{p.category ?? "—"}</Badge>{p.status === "inactive" && <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">inativo</span>}</td><td className="px-5 py-3">
          {reais(p.cmv)}
          {/* Quando há costureira na ficha, mostra também a leitura de
              competência — é a que o DRE usa (reunião 16/07/2026). */}
          {p.cmvSemMaoDeObra && p.cmv && p.cmvSemMaoDeObra !== p.cmv && (
            <div className="text-xs text-[var(--cor-texto-suave)]">
              sem mão de obra {reais(p.cmvSemMaoDeObra)}
            </div>
          )}
        </td>
      </tr>)}</tbody></table></Card>
  </div>;
}
