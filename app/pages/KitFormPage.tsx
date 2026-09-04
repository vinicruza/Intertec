import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CustoProdutoKit, ItemKit } from "@calc";
import {
  definirStatusDoKit,
  listarAuditoriaKits,
  obterKit,
  obterOrigemKit,
  salvarKit,
  type ResultadoSalvarKit,
} from "../lib/db/kits";
import { listarInsumos } from "../lib/db/insumos";
import { resolverKitDoPedido, type ModoEmbalagem } from "../lib/sim/kitNoPedido";
import { listarProdutos } from "../lib/db/produtos";
import { useAuth } from "../auth/AuthProvider";
import {
  avisoAoInativarKit,
  confirmacaoDeStatusDoKit,
  podeInativarKit,
} from "../lib/sim/catalogoDeKits";
import { perfilPodeAcessar } from "../lib/roles";
import { dataCurta, percentual, reais } from "../lib/format";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";
import { EscolhaComBusca, type OpcaoDeBusca } from "@components/ui/EscolhaComBusca";
import { mensagemDeErro } from "../lib/erros";

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
  const [duplicado, setDuplicado] = useState<
    { id: string; name: string; code: string | null; status: "active" | "inactive" } | null
  >(null);
  // Nem todo insumo de embalagem já foi marcado como tal (é o Administrador
  // quem marca, na tela de Insumos) — sem este escape, quem monta o kit e não
  // acha o insumo certo na lista filtrada ficaria travado.
  const [mostrarTodosInsumos, setMostrarTodosInsumos] = useState(false);
  const [erroStatus, setErroStatus] = useState<string | null>(null);

  const { perfil } = useAuth();
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });
  const insumosQuery = useQuery({ queryKey: ["insumos"], queryFn: listarInsumos });
  const kitQuery = useQuery({ queryKey: ["kit", id], queryFn: () => obterKit(id!), enabled: editando });
  // Rastreabilidade pedida pelo cliente em 30/07/2026: de onde este kit veio.
  const origemQuery = useQuery({ queryKey: ["origemKit", id], queryFn: () => obterOrigemKit(id!), enabled: editando });
  // Auditoria de uso, só para saber quantos ORÇAMENTOS EM ABERTO usam este kit
  // — é o aviso que aparece antes de inativar. Mesma chave da tela de Kits,
  // então as duas telas dividem a resposta em vez de pedir duas vezes.
  const auditoriaQuery = useQuery({
    queryKey: ["kits", "auditoria"],
    queryFn: listarAuditoriaKits,
    enabled: editando && podeInativarKit(perfil?.perfil),
  });

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
          todosInsumos.map((i) => [i.id, { nome: i.name, precoSemImposto: i.price_without_tax === null ? null : String(i.price_without_tax), maoDeObra: i.is_labor }])
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
      // Peso de cada item no custo do kit — pedido do cliente em 30/07/2026.
      linhasProdutos: r.linhasProdutos,
      linhasEmbalagem: r.linhasEmbalagem,
    };
  }, [itensValidos, embalagemValida, custoPorProduto, todosInsumos]);

  const pendenciasFormulario = useMemo(() => {
    const pendencias: string[] = [];
    if (!nome.trim()) pendencias.push("Informe o nome do kit.");

    const produtosParciais = itens.some(
      (i) => (i.produtoId && i.quantidade.trim() === "") || (!i.produtoId && i.quantidade.trim() !== "")
    );
    if (produtosParciais) pendencias.push("Complete produto e quantidade em todas as linhas da composição.");
    if (itensValidos.length === 0) pendencias.push("Inclua ao menos um produto no kit.");
    if (itensValidos.some((i) => !numeroPositivo(String(i.quantidade)))) {
      pendencias.push("As quantidades dos produtos precisam ser maiores que zero.");
    }

    const embalagemParcial = embalagem.some(
      (e) => (e.insumoId && e.quantidade.trim() === "") || (!e.insumoId && e.quantidade.trim() !== "")
    );
    if (embalagemParcial) pendencias.push("Complete insumo e quantidade nas linhas de embalagem.");
    if (embalagemValida.some((e) => !numeroPositivo(e.quantidade))) {
      pendencias.push("As quantidades de embalagem precisam ser maiores que zero.");
    }

    if (itensValidos.length > 0 && previa && previa.custo === null) {
      pendencias.push("Existe produto sem custo vigente; o kit ficaria sem CMV calculável.");
    }
    if (itensValidos.length > 0 && !previa) {
      pendencias.push("Não foi possível calcular a assinatura do kit. Confira composição e embalagem.");
    }

    return pendencias;
  }, [nome, itens, itensValidos, embalagem, embalagemValida, previa]);

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
      const msg = mensagemDeErro(e, "Erro ao salvar kit.");
      setErro(/unique|duplicate/i.test(msg) ? "Já existe um kit com esta composição (assinatura única)." : msg);
    },
  });

  // ---------- Situação no catálogo (Patricia, 04/09/2026) ----------
  //
  // Inativar tira o kit da lista de itens vendáveis sem apagar nada: código e
  // composição continuam reservados, e o histórico não muda. Quem recusa de
  // verdade é o banco (`set_kit_status`, Admin e Financeiro); a tela só evita
  // oferecer o botão a quem vai ouvir não.
  const alterarStatus = useMutation({
    mutationFn: (ativo: boolean) => definirStatusDoKit(id!, ativo),
    onSuccess: () => {
      setErroStatus(null);
      queryClient.invalidateQueries({ queryKey: ["kit", id] });
      queryClient.invalidateQueries({ queryKey: ["kits"] });
    },
    onError: (e: unknown) => setErroStatus(mensagemDeErro(e, "Não foi possível alterar a situação do kit.")),
  });

  const kitInativo = kitQuery.data?.status === "inactive";
  // Quantos orçamentos EM ABERTO usam este kit: é o único efeito colateral da
  // inativação que exige alguém agir antes.
  const orcamentosEmAberto =
    (auditoriaQuery.data ?? []).find((linha) => linha.kit_id === id)?.open_orders_count ?? 0;
  const avisoDeInativacao = avisoAoInativarKit({ orcamentosEmAberto });

  const produtos = produtosQuery.data ?? [];
  const opcoesDeProduto: OpcaoDeBusca[] = produtos.map((p) => ({
    id: p.id,
    codigo: p.code,
    nome: p.name,
    detalhe: p.cmv === null ? "sem custo vigente" : undefined,
  }));

  // Kit que nasceu de pedido gerado: composição imutável. O código já foi para
  // o papel e para a nota — mudar o que ele significa quebra a promessa de
  // "um código, uma composição", e muda por baixo o custo de cotações em
  // aberto que usam este kit. O banco recusa; aqui a tela evita a digitação.
  const composicaoTravada = Boolean(kitQuery.data?.source_order_id);

  if (editando && kitQuery.isLoading) {
    return <p className="text-[var(--cor-texto-suave)]">Carregando kit...</p>;
  }

  if (editando && kitQuery.isError) {
    const msg = mensagemDeErro(kitQuery.error, "Não foi possível carregar o kit.");
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

      {/* ---------- Situação no catálogo (pedido da Patricia, 04/09/2026) ----------
          Fica FORA do formulário de propósito: mudar a situação do kit é uma
          decisão por si só, não algo que se salva junto com uma edição de
          composição. Assim também não há como sair da tela sem querer com o
          kit num estado que ninguém escolheu. */}
      {editando && kitQuery.data && (
        <Card className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--cor-texto-suave)]">Situação no catálogo:</span>
              {kitInativo ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  inativo — não aparece para vender
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                  ativo
                </span>
              )}
            </div>
            {podeInativarKit(perfil?.perfil) && (
              <Button
                type="button"
                className={kitInativo ? "" : "bg-transparent text-[var(--cor-primaria)] hover:bg-[var(--cor-fundo)]"}
                disabled={alterarStatus.isPending}
                onClick={() => {
                  const ativando = kitInativo;
                  const texto = confirmacaoDeStatusDoKit({
                    ativando,
                    codigo: kitQuery.data?.code ?? null,
                    nome: kitQuery.data?.name ?? "",
                    orcamentosEmAberto,
                  });
                  if (window.confirm(texto)) alterarStatus.mutate(ativando);
                }}
              >
                {alterarStatus.isPending
                  ? "Alterando…"
                  : kitInativo
                    ? "Reativar kit"
                    : "Inativar kit"}
              </Button>
            )}
          </div>
          <p className="text-xs text-[var(--cor-texto-suave)]">
            Kit inativo sai da lista de itens do pedido, mas nada é apagado: o código e a composição
            continuam reservados (montar a mesma composição cai neste kit), os pedidos já feitos não
            mudam, e dá para reativar quando quiser.
          </p>
          {!kitInativo && avisoDeInativacao && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{avisoDeInativacao}</p>
          )}
          {erroStatus && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erroStatus}</p>}
        </Card>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setDuplicado(null);
          if (pendenciasFormulario.length > 0) return setErro(pendenciasFormulario.join(" "));
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
            {!composicaoTravada && (
              <Button type="button" onClick={() => setItens((a) => [...a, { produtoId: "", quantidade: "1" }])}>
                Adicionar produto
              </Button>
            )}
          </div>

          {/* Kit que nasceu de pedido gerado: o código já circulou em papel e em
              nota. Mudar a composição faria o código deixar de valer para quem
              o recebeu — e cotações em aberto que usam este kit passariam a
              valer outro custo, sem aviso. O banco recusa; aqui a tela explica
              antes de a pessoa digitar. */}
          {composicaoTravada && (
            <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm text-[var(--cor-texto-suave)]">
              Este kit nasceu de um pedido gerado, então a composição dele não muda mais: o código{" "}
              <strong className="font-mono">{codigo}</strong> já foi para o papel e para a nota, e
              precisa continuar significando exatamente isto. <strong>Nome e descrição</strong> você
              pode ajustar aqui. Para uma composição diferente,{" "}
              <Link className="font-medium underline" to="/simulador">
                monte um kit novo no simulador
              </Link>{" "}
              — ele ganha código próprio.
            </p>
          )}

          {itens.map((item, i) => (
            <div key={i} className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Produto</Label>
                {composicaoTravada ? (
                  <p className="min-h-10 rounded-[0.625rem] bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                    {produtos.find((p) => p.id === item.produtoId)?.name ?? item.produtoId}
                  </p>
                ) : (
                  <EscolhaComBusca
                    valor={item.produtoId}
                    opcoes={opcoesDeProduto}
                    placeholder="Digite o código ou o nome…"
                    aoEscolher={(id) => atualizarItem(i, "produtoId", id)}
                  />
                )}
              </div>
              <div>
                <Label>Quantidade</Label>
                {composicaoTravada ? (
                  <p className="min-h-10 w-28 rounded-[0.625rem] bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                    {item.quantidade}
                  </p>
                ) : (
                  <Input className="w-28" value={item.quantidade} onChange={(e) => atualizarItem(i, "quantidade", e.target.value)} />
                )}
              </div>
              {!composicaoTravada && (
                <button
                  type="button"
                  className="pb-2 text-xs text-red-600 hover:underline"
                  onClick={() => setItens((a) => a.filter((_, idx) => idx !== i))}
                >
                  Remover
                </button>
              )}
            </div>
          ))}

        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Embalagem e esterilização do kit</h2>
              <p className="text-xs text-[var(--cor-texto-suave)]">
                O envelope é <strong>um por kit</strong>. Já a caixa de esterilização atende
                vários kits: escolha <strong>"kits por caixa"</strong>, informe quantos kits cabem
                nela, e o custo é rateado. Lançar a caixa como "1 por kit" cobraria a caixa
                inteira de cada um.
              </p>
            </div>
            {!composicaoTravada && (
              <Button type="button" onClick={() => setEmbalagem((a) => [...a, { insumoId: "", modo: "porKit", quantidade: "1" }])}>
                Adicionar embalagem
              </Button>
            )}
          </div>

          {embalagem.length === 0 && (
            <p className="text-sm text-[var(--cor-texto-suave)]">
              Nenhum insumo de embalagem informado — o CMV do kit fica só com a soma dos produtos.
            </p>
          )}

          {embalagem.length > 0 && !composicaoTravada && (
            <label className="flex items-center gap-2 text-xs text-[var(--cor-texto-suave)]">
              <input
                type="checkbox"
                checked={mostrarTodosInsumos}
                onChange={(e) => setMostrarTodosInsumos(e.target.checked)}
              />
              Não achei o insumo — mostrar todos os insumos do catálogo
            </label>
          )}

          {/* Embalagem entra na assinatura do kit: se a composição está
              travada, ela também está. */}
          {composicaoTravada &&
            embalagem.map((linha, i) => (
              <p key={i} className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                {todosInsumos.find((ins) => ins.id === linha.insumoId)?.name ?? linha.insumoId} —{" "}
                {linha.modo === "itensPorCaixa"
                  ? `1 caixa para ${linha.quantidade} kits (rateada)`
                  : `${linha.quantidade} por kit`}
              </p>
            ))}

          {!composicaoTravada && embalagem.map((linha, i) => (
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
                  <option value="itensPorCaixa">Kits por caixa (rateia)</option>
                </select>
              </div>
              <div>
                <Label>{linha.modo === "itensPorCaixa" ? "Kits por caixa" : "Qtd. por kit"}</Label>
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

          {previa?.custo && (previa.linhasProdutos.length > 0 || previa.linhasEmbalagem.length > 0) && (
            <div className="space-y-1 rounded-md border border-[var(--cor-borda)] p-3 text-sm">
              <Label>Peso de cada item no custo do kit</Label>
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ...previa.linhasProdutos.map((l) => ({
                      nome: produtos.find((p) => p.id === l.produtoId)?.name ?? l.produtoId,
                      custo: l.custo,
                      participacao: l.participacao,
                    })),
                    ...previa.linhasEmbalagem.map((l) => ({ nome: l.nome, custo: l.custo, participacao: l.participacao })),
                  ]
                    .sort((a, b) => Number(b.participacao) - Number(a.participacao))
                    .map((l, i) => (
                      <tr key={i} className="border-b border-[var(--cor-borda)] last:border-0">
                        <td className="py-1">{l.nome}</td>
                        <td className="py-1 text-right text-[var(--cor-texto-suave)]">{reais(l.custo)}</td>
                        <td className="w-16 py-1 text-right font-medium">{percentual(l.participacao)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {duplicado && (
          <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
            Já existe um kit com exatamente esta composição:{" "}
            <strong className="font-mono">{duplicado.code ?? "sem código"}</strong> —{" "}
            {duplicado.name}
            {duplicado.status === "inactive" && <> (kit <strong>inativo</strong> no catálogo)</>}.
            Use esse código no pedido em vez de criar outro igual.{" "}
            <Link className="font-medium underline" to={`/kits/${duplicado.id}`}>
              Abrir o kit existente
            </Link>
          </div>
        )}
        {pendenciasFormulario.length > 0 && !erro && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {pendenciasFormulario.slice(0, 2).join(" ")}
            {pendenciasFormulario.length > 2 ? ` Mais ${pendenciasFormulario.length - 2} pendência(s).` : ""}
          </p>
        )}
        {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={salvar.isPending || pendenciasFormulario.length > 0}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
          <Button type="button" className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/kits")}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

function numeroPositivo(valor: string): boolean {
  const normalizado = valor.trim().replace(",", ".");
  if (!normalizado) return false;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0;
}
