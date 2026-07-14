import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { assinaturaKit, custoKit, type EntradaDecimal, type ItemKit } from "@calc";
import { obterKit, salvarKit, type ResultadoSalvarKit } from "../lib/db/kits";
import { listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { Button, Card, Input, Label } from "@components/ui/primitives";

type ItemEdicao = { produtoId: string; quantidade: string };

export default function KitFormPage() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [itens, setItens] = useState<ItemEdicao[]>([{ produtoId: "", quantidade: "1" }]);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<{ id: string; name: string } | null>(null);

  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const kitQuery = useQuery({ queryKey: ["kit", id], queryFn: () => obterKit(id!), enabled: editando });

  useEffect(() => {
    const k = kitQuery.data;
    if (!k) return;
    setNome(k.name);
    setCodigo(k.code ?? "");
    setDescricao(k.description ?? "");
    setItens(k.kit_items.length > 0
      ? k.kit_items.map((i) => ({ produtoId: i.product_id, quantidade: i.quantity }))
      : [{ produtoId: "", quantidade: "1" }]
    );
  }, [kitQuery.data]);

  const custoPorProduto = useMemo(
    () =>
      new Map<string, EntradaDecimal>(
        (produtosQuery.data ?? []).filter((p) => p.cmv !== null).map((p) => [p.id, p.cmv as string])
      ),
    [produtosQuery.data]
  );

  const itensValidos: ItemKit[] = useMemo(
    () =>
      itens
        .filter((i) => i.produtoId && i.quantidade.trim() !== "")
        .map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade.trim().replace(",", ".") })),
    [itens]
  );

  // Prévia ao vivo: assinatura canônica e custo do kit (motor, fora da tela).
  const previa = useMemo(() => {
    if (itensValidos.length === 0) return null;
    try {
      const assinatura = assinaturaKit(itensValidos);
      let custo: string | null = null;
      try {
        custo = custoKit(itensValidos, custoPorProduto).toString();
      } catch {
        custo = null; // algum produto ainda sem custo vigente
      }
      return { assinatura, custo };
    } catch {
      return null;
    }
  }, [itensValidos, custoPorProduto]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarKit(id ?? null, { code: codigo, name: nome, description: descricao, itens: itensValidos }),
    onSuccess: (r: ResultadoSalvarKit) => {
      if (r.tipo === "duplicado") {
        setDuplicado(r.kitExistente);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["kits"] });
      navigate("/kits");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erro ao salvar kit.";
      setErro(/unique|duplicate/i.test(msg) ? "Já existe um kit com esta composição (assinatura única)." : msg);
    },
  });

  const produtos = produtosQuery.data ?? [];

  if (editando && kitQuery.isLoading) {
    return <p className="text-[var(--cor-texto-suave)]">Carregando kit...</p>;
  }

  if (editando && kitQuery.isError) {
    const msg = kitQuery.error instanceof Error ? kitQuery.error.message : "Nao foi possivel carregar o kit.";
    return (
      <Card className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Erro ao abrir kit</h1>
        <p className="text-sm text-red-700">{msg}</p>
        <Button type="button" onClick={() => navigate("/kits")}>Voltar para kits</Button>
      </Card>
    );
  }

  if (editando && !kitQuery.data) {
    return (
      <Card className="max-w-3xl space-y-3">
        <h1 className="text-xl font-semibold">Kit nao encontrado</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">Esse kit nao existe ou seu usuario nao tem permissao para acessa-lo.</p>
        <Button type="button" onClick={() => navigate("/kits")}>Voltar para kits</Button>
      </Card>
    );
  }

  function atualizarItem(i: number, campo: keyof ItemEdicao, valor: string) {
    setItens((atual) => atual.map((item, idx) => (idx === i ? { ...item, [campo]: valor } : item)));
    setDuplicado(null);
    setErro(null);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{editando ? "Editar kit" : "Novo kit"}</h1>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setDuplicado(null);
          if (!nome.trim()) return setErro("Informe o nome do kit.");
          if (itensValidos.length === 0) return setErro("Inclua ao menos um produto no kit.");
          salvar.mutate();
        }}
      >
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
            <div>
              <Label>Código</Label>
              <Input
                value={codigo}
                readOnly
                placeholder={editando ? "" : "Gerado automaticamente"}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
          </div>
          <div><Label>Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Composição</h2>
            <Button type="button" onClick={() => setItens((a) => [...a, { produtoId: "", quantidade: "1" }])}>
              Adicionar produto
            </Button>
          </div>

          {itens.map((item, i) => (
            <div key={i} className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Produto</Label>
                <select
                  className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
                  value={item.produtoId}
                  onChange={(e) => atualizarItem(i, "produtoId", e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input className="w-28" value={item.quantidade} onChange={(e) => atualizarItem(i, "quantidade", e.target.value)} />
              </div>
              <button
                type="button"
                className="pb-2 text-xs text-red-600 hover:underline"
                onClick={() => setItens((a) => a.filter((_, idx) => idx !== i))}
              >
                Remover
              </button>
            </div>
          ))}

          <div className="rounded-md bg-[var(--cor-fundo)] p-3 text-sm">
            {previa ? (
              <>
                <div className="text-lg font-semibold">CMV do kit: {previa.custo ? reais(previa.custo) : "— (produto sem custo vigente)"}</div>
                <div className="mt-1 break-all text-xs text-[var(--cor-texto-suave)]">Assinatura: {previa.assinatura}</div>
              </>
            ) : (
              <span className="text-[var(--cor-texto-suave)]">Inclua produtos para ver o custo e a assinatura.</span>
            )}
          </div>
        </Card>

        {duplicado && (
          <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
            Já existe um kit com exatamente esta composição: <strong>{duplicado.name}</strong>.{" "}
            <Link className="font-medium underline" to={`/kits/${duplicado.id}`}>
              Abrir o kit existente
            </Link>{" "}
            em vez de duplicar.
          </div>
        )}
        {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          <Button type="button" className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/kits")}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
