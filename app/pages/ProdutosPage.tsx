import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listarCategoriasProduto, listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

export default function ProdutosPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const produtos = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const categorias = useQuery({ queryKey: ["categorias-produto"], queryFn: listarCategoriasProduto });
  const filtrados = useMemo(() => (produtos.data ?? []).filter((p) => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return (!categoria || p.category_id === categoria) && (!termo ||
      `${p.code} ${p.legacy_code ?? ""} ${p.name}`.toLocaleLowerCase("pt-BR").includes(termo));
  }), [produtos.data, busca, categoria]);

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div><h1 className="text-3xl font-semibold tracking-[-0.035em]">Produtos e fichas</h1><p className="mt-1 text-sm text-[var(--cor-texto-suave)]">Catálogo organizado pelas categorias da Intertech Surgical.</p></div>
      <Link to="/produtos/novo"><Button>Novo produto</Button></Link>
    </div>
    <Card className="grid gap-3 p-4 md:grid-cols-[1fr_18rem]">
      <Input aria-label="Buscar produtos" placeholder="Buscar por código novo, código antigo ou nome…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <select aria-label="Filtrar categoria" className="min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
        <option value="">Todas as categorias</option>{(categorias.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.prefix} — {c.name}</option>)}
      </select>
    </Card>
    {produtos.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
    {produtos.error && <p className="text-red-600">Erro ao carregar produtos.</p>}
    {!produtos.isLoading && <p className="text-xs text-[var(--cor-texto-suave)]">{filtrados.length} produto(s) encontrado(s)</p>}
    <div className="grid gap-3 md:hidden">
      {filtrados.map((p) => <button key={p.id} className="rounded-2xl border border-[var(--cor-borda)] bg-white p-4 text-left shadow-[var(--sombra-cartao)]" onClick={() => navigate(`/produtos/${p.id}`)}>
        <div className="flex items-start justify-between gap-3"><div><div className="font-mono text-sm font-bold text-[var(--cor-primaria)]">{p.code}</div><div className="mt-1 font-semibold">{p.name}</div></div><Badge>{p.category ?? "—"}</Badge></div>
        <div className="mt-3 flex justify-between text-sm text-[var(--cor-texto-suave)]"><span>{p.legacy_code ? `Anterior: ${p.legacy_code}` : ""}</span><strong className="text-[var(--cor-texto)]">CMV {reais(p.cmv)}</strong></div>
      </button>)}
    </div>
    <Card className="hidden overflow-x-auto p-0 md:block"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
      <th className="px-5 py-3 font-medium">Código</th><th className="px-5 py-3 font-medium">Nome</th><th className="px-5 py-3 font-medium">Categoria</th><th className="px-5 py-3 font-medium">CMV</th></tr></thead><tbody>
      {filtrados.map((p) => <tr key={p.id} className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]" onClick={() => navigate(`/produtos/${p.id}`)}>
        <td className="px-5 py-3"><strong className="font-mono text-[var(--cor-primaria)]">{p.code}</strong>{p.legacy_code && <div className="text-xs text-[var(--cor-texto-suave)]">antigo {p.legacy_code}</div>}</td><td className="px-5 py-3 font-medium">{p.name}</td><td className="px-5 py-3"><Badge>{p.category ?? "—"}</Badge></td><td className="px-5 py-3">{reais(p.cmv)}</td>
      </tr>)}</tbody></table></Card>
  </div>;
}
