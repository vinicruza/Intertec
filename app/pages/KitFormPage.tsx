import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  assinaturaKitCompleta,
  custoKitCompleto,
  type CustoProdutoKit,
  type EmbalagemKit,
  type ItemEmbalagem,
  type ItemKit,
} from "@calc";
import { obterKit, salvarKit, type ResultadoSalvarKit } from "../lib/db/kits";
import { listarInsumos } from "../lib/db/insumos";
import { listarProdutos } from "../lib/db/produtos";
import { reais } from "../lib/format";
import { Button, Card, Input, Label } from "@components/ui/primitives";

type ItemEdicao = { produtoId: string; quantidade: string };
// Envelope e caixas de esterilização: consumidos UMA vez por kit montado
// (reunião Intertech 16/07/2026 — antes disso o custo era aproximado).
type EmbalagemEdicao = { insumoId: string; quantidade: string };

export default function KitFormPage() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [itens, setItens] = useState<ItemEdicao[]>([{ produtoId: "", quantidade: "1" }]);
  const [embalagem, setEmbalagem] = useState<EmbalagemEdicao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicado, setDuplicado] = useState<{ id: string; name: string } | null>(null);

  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const insumosQuery = useQuery({ queryKey: ["insumos"], queryFn: listarInsumos });
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
    setEmbalagem(k.kit_packaging.map((e) => ({ insumoId: e.input_id, quantidade: e.quantity })));
  }, [kitQuery.data]);

  const custoPorProduto = useMemo(
    () =>
      new Map<string, CustoProdutoKit>(
        (produtosQuery.data ?? [])
          .filter((p) => p.cmv !== null)
          .map((p) => [p.id, { cmv: p.cmv as string }])
      ),
    [produtosQuery.data]
  );

  const insumos = insumosQuery.data ?? [];
  const insumoPorId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  const embalagemValida: EmbalagemEdicao[] = useMemo(
    () =>
      embalagem
        .filter((e) => e.insumoId && e.quantidade.trim() !== "")
        .map((e) => ({ insumoId: e.insumoId, quantidade: e.quantidade.trim().replace(",", ".") })),
    [embalagem]
  );

  const embalagemParaAssinatura: ItemEmbalagem[] = useMemo(
    () => embalagemValida.map((e) => ({ insumoId: e.insumoId, quantidade: e.quantidade })),
    [embalagemValida]
  );

  const embalagemParaCusto: EmbalagemKit[] = useMemo(
    () =>
      embalagemValida.flatMap((e) => {
        const insumo = insumoPorId.get(e.insumoId);
        if (!insumo?.price_without_tax) return [];
        return [{
          nome: insumo.name,
          custoUnitario: insumo.price_without_tax,
          quantidade: e.quantidade,
          maoDeObra: insumo.is_labor,
        }];
      }),
    [embalagemValida, insumoPorId]
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
      const assinatura = assinaturaKitCompleta(itensValidos, embalagemParaAssinatura);
      try {
        const r = custoKitCompleto(itensValidos, custoPorProduto, embalagemParaCusto);
        return {
          assinatura,
          custo: r.custoTotal.toString(),
          custoProdutos: r.custoProdutos.toString(),
          custoEmbalagem: r.custoEmbalagem.toString(),
        };
      } catch {
        // algum produto ainda sem custo vigente
        return { assinatura, custo: null, custoProdutos: null, custoEmbalagem: null };
      }
    } catch {
      return null;
    }
  }, [itensValidos, custoPorProduto, embalagemParaAssinatura, embalagemParaCusto]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarKit(id ?? null, {
        code: codigo,
        name: nome,
        description: descricao,
        itens: itensValidos,
        embalagem: embalagemParaAssinatura,
      }),
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

  function atualizarEmbalagem(i: number, campo: keyof EmbalagemEdicao, valor: string) {
    setEmbalagem((atual) => atual.map((linha, idx) => (idx === i ? { ...linha, [campo]: valor } : linha)));
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

        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Embalagem e esterilização do kit</h2>
              <p className="text-xs text-[var(--cor-texto-suave)]">
                Consumidos <strong>uma vez por kit</strong> — o envelope é um só e a caixa é uma só,
                não importa quantos produtos o kit tenha. Somam ao CMV em cima da soma dos produtos.
              </p>
            </div>
            <Button type="button" onClick={() => setEmbalagem((a) => [...a, { insumoId: "", quantidade: "1" }])}>
              Adicionar insumo
            </Button>
          </div>

          {embalagem.length === 0 && (
            <p className="text-sm text-[var(--cor-texto-suave)]">
              Nenhum insumo de embalagem informado — o CMV do kit fica só com a soma dos produtos.
            </p>
          )}

          {embalagem.map((linha, i) => (
            <div key={i} className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Insumo</Label>
                <select
                  className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
                  value={linha.insumoId}
                  onChange={(e) => atualizarEmbalagem(i, "insumoId", e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {insumos.map((ins) => (
                    <option key={ins.id} value={ins.id}>{ins.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Qtd. por kit</Label>
                <Input
                  className="w-28"
                  value={linha.quantidade}
                  onChange={(e) => atualizarEmbalagem(i, "quantidade", e.target.value)}
                />
              </div>
              <button
                type="button"
                className="pb-2 text-xs text-red-600 hover:underline"
                onClick={() => setEmbalagem((a) => a.filter((_, idx) => idx !== i))}
              >
                Remover
              </button>
            </div>
          ))}

          <div className="rounded-md bg-[var(--cor-fundo)] p-3 text-sm">
            {previa ? (
              <>
                <div className="text-lg font-semibold">CMV do kit: {previa.custo ? reais(previa.custo) : "— (produto sem custo vigente)"}</div>
                {previa.custo && (
                  <div className="mt-1 text-xs text-[var(--cor-texto-suave)]">
                    Produtos: {reais(previa.custoProdutos!)} · Embalagem e esterilização:{" "}
                    <strong>{reais(previa.custoEmbalagem!)}</strong>
                  </div>
                )}
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
