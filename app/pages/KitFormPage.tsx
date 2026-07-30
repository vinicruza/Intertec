import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CustoProdutoKit, ItemKit } from "@calc";
import { obterKit, obterOrigemKit, salvarKit, type ResultadoSalvarKit } from "../lib/db/kits";
import { listarInsumos } from "../lib/db/insumos";
import { resolverKitDoPedido, type ModoEmbalagem } from "../lib/sim/kitNoPedido";
import { listarProdutos } from "../lib/db/produtos";
import { useAuth } from "../auth/AuthProvider";
import { perfilPodeAcessar } from "../lib/roles";
import { dataCurta, reais } from "../lib/format";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

type ItemEdicao = { produtoId: string; quantidade: string };
// Envelope e caixas de esterilização: consumidos UMA vez por kit montado
// (reunião Intertech 16/07/2026 — antes disso o custo era aproximado).
type EmbalagemEdicao = { insumoId: string; modo: ModoEmbalagem; quantidade: string };

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
  // Nem todo insumo de embalagem já foi marcado como tal (é o Administrador
  // quem marca, na tela de Insumos) — sem este escape, quem monta o kit e não
  // acha o insumo certo na lista filtrada ficaria travado.
  const [mostrarTodosInsumos, setMostrarTodosInsumos] = useState(false);

  const { perfil } = useAuth();
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const insumosQuery = useQuery({ queryKey: ["insumos"], queryFn: listarInsumos });
  const kitQuery = useQuery({ queryKey: ["kit", id], queryFn: () => obterKit(id!), enabled: editando });
  // Rastreabilidade pedida pelo cliente em 30/07/2026: de onde este kit veio.
  const origemQuery = useQuery({ queryKey: ["origemKit", id], queryFn: () => obterOrigemKit(id!), enabled: editando });

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
    setEmbalagem(k.kit_packaging.map((e) => ({
      insumoId: e.input_id,
      modo: e.quantity_type === "lot" ? ("itensPorCaixa" as const) : ("porKit" as const),
      quantidade: (e.quantity_type === "lot" ? e.lot_size : e.quantity) ?? "1",
    })));
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

  const todosInsumos = insumosQuery.data ?? [];
  // Um insumo já escolhido nunca some da lista, mesmo filtrado.
  function insumosPara(insumoIdAtual: string) {
    if (mostrarTodosInsumos) return todosInsumos;
    return todosInsumos.filter((i) => i.is_packaging || i.id === insumoIdAtual);
  }

  const itensValidos: ItemKit[] = useMemo(
    () =>
      itens
        .filter((i) => i.produtoId && i.quantidade.trim() !== "")
        .map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade.trim().replace(",", ".") })),
    [itens]
  );

  const embalagemValida: EmbalagemEdicao[] = useMemo(
    () =>
      embalagem
        .filter((e) => e.insumoId && e.quantidade.trim() !== "")
        .map((e) => ({ ...e, quantidade: e.quantidade.trim().replace(",", ".") })),
    [embalagem]
  );

  // Prévia ao vivo: assinatura canônica e custo do kit (motor, fora da tela).
  const previa = useMemo(() => {
    if (itensValidos.length === 0) return null;
    const r = resolverKitDoPedido(
      itensValidos.map((i) => ({ produtoId: i.produtoId, quantidade: String(i.quantidade) })),
      embalagemValida,
      {
        custoPorProduto,
        insumoPorId: new Map(
          todosInsumos.map((i) => [i.id, { nome: i.name, precoSemImposto: i.price_without_tax, maoDeObra: i.is_labor }])
        ),
        kitPorAssinatura: new Map(),
      }
    );
    if (r.erro) return null;
    return {
      assinatura: r.assinatura,
      custo: r.cmvUnitario,
      custoProdutos: r.custoProdutos,
      custoEmbalagem: r.custoEmbalagem,
    };
  }, [itensValidos, embalagemValida, custoPorProduto, todosInsumos]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarKit(id ?? null, {
        code: codigo,
        name: nome,
        description: descricao,
        itens: itensValidos,
        embalagem: embalagemValida.map((e) => ({
          insumoId: e.insumoId,
          quantidade:
            e.modo === "itensPorCaixa"
              ? ({ tipo: "lote", tamanhoLote: e.quantidade } as const)
              : ({ tipo: "direta", quantidade: e.quantidade } as const),
        })),
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

      {editando && origemQuery.data && (
        <Card className="flex flex-wrap items-center gap-2 bg-[var(--cor-fundo)] text-sm">
          <span className="text-[var(--cor-texto-suave)]">Origem:</span>
          {origemQuery.data.source_order_id ? (
            <>
              <Badge>Nasceu de um pedido</Badge>
              {perfilPodeAcessar(perfil?.perfil ?? "producao", "/pedidos") ? (
                <Link
                  className="font-medium text-[var(--cor-primaria)] underline"
                  to={`/pedidos/${origemQuery.data.source_order_id}`}
                >
                  {origemQuery.data.source_order_quote_number ?? "ver pedido"}
                </Link>
              ) : (
                origemQuery.data.source_order_quote_number && (
                  <span className="font-mono text-xs">{origemQuery.data.source_order_quote_number}</span>
                )
              )}
            </>
          ) : (
            <Badge>Cadastro manual</Badge>
          )}
          <span className="text-[var(--cor-texto-suave)]">
            · criado {origemQuery.data.created_by_name ? `por ${origemQuery.data.created_by_name}` : ""} em{" "}
            {dataCurta(origemQuery.data.created_at)}
          </span>
        </Card>
      )}

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
                O envelope é <strong>um por kit</strong>. Já a caixa de esterilização atende
                vários kits: informe <strong>quantos itens cabem nela</strong> e o custo é rateado.
                Lançar a caixa como "1 por kit" cobraria a caixa inteira de cada um.
              </p>
            </div>
            <Button type="button" onClick={() => setEmbalagem((a) => [...a, { insumoId: "", modo: "porKit", quantidade: "1" }])}>
              Adicionar embalagem
            </Button>
          </div>

          {embalagem.length === 0 && (
            <p className="text-sm text-[var(--cor-texto-suave)]">
              Nenhum insumo de embalagem informado — o CMV do kit fica só com a soma dos produtos.
            </p>
          )}

          {embalagem.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-[var(--cor-texto-suave)]">
              <input
                type="checkbox"
                checked={mostrarTodosInsumos}
                onChange={(e) => setMostrarTodosInsumos(e.target.checked)}
              />
              Não achei o insumo — mostrar todos os insumos do catálogo
            </label>
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
                  {insumosPara(linha.insumoId).map((ins) => (
                    <option key={ins.id} value={ins.id}>{ins.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Como é consumido</Label>
                <select
                  className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
                  value={linha.modo}
                  onChange={(e) => atualizarEmbalagem(i, "modo", e.target.value)}
                >
                  <option value="porKit">Unidades por kit</option>
                  <option value="itensPorCaixa">Itens por caixa (rateia)</option>
                </select>
              </div>
              <div>
                <Label>{linha.modo === "itensPorCaixa" ? "Itens por caixa" : "Qtd. por kit"}</Label>
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
