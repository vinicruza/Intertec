import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ErroCalculoBloqueante, toMoney, type CustoProdutoKit, type ItemPedido } from "@calc";
import { simular, statusMargem } from "../lib/sim/params";
import {
  resolverKitDoPedido,
  type CatalogoParaKit,
  type LinhaCustoEmbalagemKit,
  type LinhaCustoKit,
  type ModoEmbalagem,
} from "../lib/sim/kitNoPedido";
import {
  carregarContextoSimulador,
  salvarCotacao,
  type ContextoSimulador,
  type ItemSimulacao,
} from "../lib/db/pedidos";
import { obterParametrosAprovacao, podeVerNumerosDeMargem } from "../lib/db/aprovacao";
import { useAuth } from "../auth/AuthProvider";
import { reais, percentual } from "../lib/format";
import { formatarCep } from "../../lib/cadastro/documentos";
import { Button, Card, Input, Label } from "@components/ui/primitives";

// "__kit_novo__" abre o montador de kit dentro do próprio pedido. Decisão da
// reunião de 16/07/2026: a pessoa monta o kit aqui, não numa tela separada.
const KIT_NOVO = "__kit_novo__";

type KitNovoEdicao = {
  rotulo: string;
  produtos: Array<{ produtoId: string; quantidade: string }>;
  embalagem: Array<{ insumoId: string; modo: ModoEmbalagem; quantidade: string }>;
};

type LinhaItem = {
  itemId: string;
  quantidade: string;
  preco: string;
  kitNovo: KitNovoEdicao | null;
};

const LINHA_VAZIA: LinhaItem = { itemId: "", quantidade: "1", preco: "", kitNovo: null };

// O que a linha representa depois de resolvida: nome, CMV unitário e, quando é
// kit montado na hora, a assinatura e o kit de catálogo que já tem essa mesma
// composição (para avisar em vez de duplicar).
type LinhaResolvida = {
  nome: string;
  cmvUnitario: string | null;
  assinatura: string | null;
  kitExistente: { id: string; codigo: string; nome: string } | null;
  erro: string | null;
  // Peso de custo por produto/embalagem — só existe quando a linha é um kit
  // montado na hora. Pedido do cliente em 30/07/2026, ver kitNoPedido.ts.
  linhasProdutos: LinhaCustoKit[];
  linhasEmbalagem: LinhaCustoEmbalagemKit[];
};

// Catálogo derivado do contexto, no formato que o módulo de cálculo espera.
function montarCatalogo(ctx: ContextoSimulador): CatalogoParaKit {
  return {
    custoPorProduto: new Map<string, CustoProdutoKit>(
      ctx.produtos.filter((p) => p.cmv !== null).map((p) => [p.id, { cmv: p.cmv as string }])
    ),
    insumoPorId: new Map(
      ctx.insumosEmbalagem.map((i) => [i.id, { nome: i.nome, precoSemImposto: i.precoSemImposto, maoDeObra: i.maoDeObra }])
    ),
    kitPorAssinatura: ctx.kitPorAssinatura,
  };
}

function resolverLinha(l: LinhaItem, ctx: ContextoSimulador, catalogo: CatalogoParaKit): LinhaResolvida | null {
  if (l.itemId && l.itemId !== KIT_NOVO) {
    const item = ctx.itens.find((i) => i.id === l.itemId);
    if (!item) return null;
    return {
      nome: item.nome,
      cmvUnitario: item.cmvUnitario,
      assinatura: null,
      kitExistente: null,
      erro: null,
      linhasProdutos: [],
      linhasEmbalagem: [],
    };
  }

  if (l.itemId !== KIT_NOVO || !l.kitNovo) return null;

  const r = resolverKitDoPedido(l.kitNovo.produtos, l.kitNovo.embalagem, catalogo);
  return {
    nome: l.kitNovo.rotulo.trim() || "Kit montado no pedido",
    cmvUnitario: r.cmvUnitario,
    assinatura: r.assinatura || null,
    kitExistente: r.kitExistente,
    erro: r.erro,
    linhasProdutos: r.linhasProdutos,
    linhasEmbalagem: r.linhasEmbalagem,
  };
}

const CORES: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
};

export default function SimuladorPage() {
  const queryClient = useQueryClient();
  const { perfil } = useAuth();
  const ctxQuery = useQuery({ queryKey: ["ctxSimulador"], queryFn: carregarContextoSimulador });
  const paramsQuery = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  // Comercial vê a COR da margem, não o número (reunião 16/07/2026).
  const verNumeros = podeVerNumerosDeMargem(perfil?.perfil, paramsQuery.data);

  const [vendedorId, setVendedorId] = useState("");
  const [uf, setUf] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [clienteNovo, setClienteNovo] = useState("");
  const [comissao, setComissao] = useState<string | null>(null); // null = padrão do canal
  const [frete, setFrete] = useState("0");
  const [freteCliente, setFreteCliente] = useState(false);
  const [linhas, setLinhas] = useState<LinhaItem[]>([LINHA_VAZIA]);
  // Expedição e condições do formulário de pedido (05/08/2026). Nada disso
  // entra na cascata: é o que a expedição lê para despachar e o financeiro
  // lê para cobrar. Peso e volume podem ficar em branco aqui e ser
  // preenchidos depois, na hora de embalar.
  const [transportadoraId, setTransportadoraId] = useState("");
  const [transportadoraOutra, setTransportadoraOutra] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [volumes, setVolumes] = useState("");
  const [cepEntrega, setCepEntrega] = useState("");
  const [prazoPagamento, setPrazoPagamento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [cotacaoId, setCotacaoId] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<{ quote_number: string; version: number } | null>(null);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const ctx = ctxQuery.data;

  // Comercial lança pedido só para o vendedor vinculado ao acesso dele
  // (decisão de 04/08/2026). Administrador lança por qualquer um. A trava de
  // verdade é o gatilho no banco; aqui a lista já vem reduzida para ninguém
  // escolher um vendedor que o sistema vai recusar só na hora de salvar.
  const soMeuVendedor = perfil?.perfil === "comercial";
  const vendedoresDisponiveis = useMemo(() => {
    if (!ctx) return [];
    if (!soMeuVendedor) return ctx.vendedores;
    return ctx.vendedores.filter((v) => v.id === ctx.meuVendedorId);
  }, [ctx, soMeuVendedor]);
  const semVendedorVinculado = soMeuVendedor && vendedoresDisponiveis.length === 0;

  const vendedor = ctx?.vendedores.find((v) => v.id === vendedorId) ?? null;

  // Com um vendedor só na lista, escolher é burocracia: já vem selecionado.
  useEffect(() => {
    if (vendedoresDisponiveis.length === 1 && !vendedorId) {
      setVendedorId(vendedoresDisponiveis[0].id);
    }
  }, [vendedoresDisponiveis, vendedorId]);

  const catalogo = useMemo(() => (ctx ? montarCatalogo(ctx) : null), [ctx]);

  // Cada linha resolvida uma vez só: nome, CMV e detecção de kit já existente.
  const resolvidas = useMemo(
    () => (ctx && catalogo ? linhas.map((l) => resolverLinha(l, ctx, catalogo)) : []),
    [ctx, catalogo, linhas]
  );

  // Simulação ao vivo: monta os itens e chama o motor. Erro bloqueante (CMV
  // zerado, item sem custo) aparece como erro — nunca zero silencioso.
  const simulacao = useMemo(() => {
    if (!ctx || !vendedor || !uf) return { estado: "incompleto" as const };
    const tabela = ctx.tabelaPorUF.get(uf);
    if (!tabela) return { estado: "incompleto" as const };
    const escolhidas = linhas
      .map((l, i) => ({ linha: l, resolvida: resolvidas[i] }))
      .filter((x) => x.resolvida && x.linha.quantidade && x.linha.preco);
    if (escolhidas.length === 0) return { estado: "incompleto" as const };

    const comErro = escolhidas.find((x) => x.resolvida!.erro);
    if (comErro) return { estado: "bloqueado" as const, msg: comErro.resolvida!.erro! };

    try {
      const itens: ItemPedido[] = escolhidas.map(({ linha, resolvida }) => ({
        nome: resolvida!.nome,
        precoVenda: linha.preco.trim().replace(",", "."),
        quantidade: linha.quantidade.trim().replace(",", "."),
        cmvUnitario: resolvida!.cmvUnitario ?? "0", // 0 dispara o erro bloqueante no motor
        despesaUnitaria: "0",
      }));
      const s = simular({
        itens,
        freteManual: frete.trim().replace(",", ".") || "0",
        fretePorContaCliente: freteCliente,
        comissao: comissao ? comissao.trim().replace(",", ".") : null,
        canal: vendedor.regras,
        uf: tabela,
      });
      return { estado: "ok" as const, ...s };
    } catch (e) {
      if (e instanceof ErroCalculoBloqueante) return { estado: "bloqueado" as const, msg: e.message };
      return { estado: "bloqueado" as const, msg: "Não foi possível calcular." };
    }
  }, [ctx, vendedor, uf, linhas, resolvidas, frete, freteCliente, comissao]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (simulacao.estado !== "ok" || !vendedor || !ctx) throw new Error("Cotação incompleta.");

      const itens: ItemSimulacao[] = linhas.flatMap((l, i): ItemSimulacao[] => {
        const r = resolvidas[i];
        if (!r || !l.quantidade || !l.preco) return [];

        // Kit montado na hora cuja composição já existe: usa o kit de catálogo
        // em vez de criar outro igual (o código é o mesmo, por decisão).
        if (l.itemId === KIT_NOVO && r.kitExistente) {
          return [{ tipo: "kit", refId: r.kitExistente.id, quantidade: l.quantidade, precoVenda: l.preco }];
        }

        if (l.itemId === KIT_NOVO && l.kitNovo && r.assinatura) {
          return [{
            tipo: "kitNovo",
            refId: "",
            quantidade: l.quantidade,
            precoVenda: l.preco,
            kitNovo: {
              assinatura: r.assinatura,
              rotulo: r.nome,
              composicao: l.kitNovo.produtos
                .filter((p) => p.produtoId && p.quantidade.trim() !== "")
                .map((p) => ({ produtoId: p.produtoId, quantidade: p.quantidade.trim().replace(",", ".") })),
              embalagem: l.kitNovo.embalagem
                .filter((e) => e.insumoId && e.quantidade.trim() !== "")
                .map((e) => ({ insumoId: e.insumoId, modo: e.modo, quantidade: e.quantidade.trim().replace(",", ".") })),
            },
          }];
        }

        const item = ctx.itens.find((it) => it.id === l.itemId);
        if (!item) return [];
        return [{ tipo: item.tipo, refId: item.id, quantidade: l.quantidade, precoVenda: l.preco }];
      });

      // A foto da cotação vai junto na versão, para a análise do que não vingou.
      const foto = {
        registrado_em: new Date().toISOString(),
        uf,
        itens: itens.map((i) => ({ tipo: i.tipo, quantidade: i.quantidade, preco: i.precoVenda, rotulo: i.kitNovo?.rotulo })),
        receita_bruta: simulacao.resultado.receitaBruta.toString(),
        cmv_total: simulacao.resultado.cmvTotal.toString(),
        margem_contribuicao: simulacao.resultado.margemContribuicao.toString(),
        margem_contribuicao_pct: simulacao.resultado.margemContribuicaoPct.toString(),
      };

      return salvarCotacao(cotacaoId, {
        clienteId: clienteId || null,
        clienteNovoNome: clienteId ? null : clienteNovo,
        uf,
        vendedorId: vendedor.id,
        channelId: vendedor.channel_id,
        frete: simulacao.freteUsado.toString(),
        fretePorContaCliente: freteCliente,
        comissao: simulacao.comissaoUsada.toString(),
        itens,
        transportadoraId: transportadoraId || null,
        transportadoraOutra: transportadoraPedeNome ? transportadoraOutra : null,
        pesoKg,
        volumes,
        cepEntrega,
        prazoPagamentoDias: prazoPagamento,
        observacao,
      }, foto);
    },
    onSuccess: (r) => {
      setCotacaoId(r.id);
      setSalvo({ quote_number: r.quote_number, version: r.version });
      setErroSalvar(null);
      queryClient.invalidateQueries({ queryKey: ["pedidos"] });
      queryClient.invalidateQueries({ queryKey: ["ctxSimulador"] });
    },
    onError: (e: unknown) => setErroSalvar(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  if (ctxQuery.isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!ctx) return <p className="text-red-600">Erro ao carregar o simulador.</p>;

  function atualizarLinha(i: number, campo: "itemId" | "quantidade" | "preco", valor: string) {
    setLinhas((a) =>
      a.map((l, idx) => {
        if (idx !== i) return l;
        if (campo === "itemId") {
          // Escolher "montar kit novo" abre o montador embutido; sair dele limpa.
          return {
            ...l,
            itemId: valor,
            kitNovo:
              valor === KIT_NOVO
                ? l.kitNovo ?? { rotulo: "", produtos: [{ produtoId: "", quantidade: "1" }], embalagem: [] }
                : null,
          };
        }
        return { ...l, [campo]: valor };
      })
    );
    setSalvo(null);
  }

  function atualizarKitNovo(i: number, muda: (k: KitNovoEdicao) => KitNovoEdicao) {
    setLinhas((a) => a.map((l, idx) => (idx === i && l.kitNovo ? { ...l, kitNovo: muda(l.kitNovo) } : l)));
    setSalvo(null);
  }

  const freteAutomatico = vendedor?.regras.modeloFrete === "uf_percent";
  const transportadora = ctx.transportadoras.find((t) => t.id === transportadoraId) ?? null;
  const transportadoraPedeNome = transportadora?.pedeNome ?? false;
  const clienteEscolhido = ctx.clientes.find((c) => c.id === clienteId) ?? null;
  // O que falta no cadastro do cliente para a ficha sair completa. Avisar
  // aqui, e não na hora de imprimir, é o que dá tempo de resolver antes de o
  // papel chegar à mesa da conferência.
  const faltaNoCadastro = clienteEscolhido
    ? ([
        !clienteEscolhido.tax_id && "CNPJ/CPF",
        !clienteEscolhido.billing_zip && "CEP de faturamento",
        !clienteEscolhido.shipping_zip && "CEP de entrega",
        !clienteEscolhido.contact_name && "contato",
        !clienteEscolhido.phone && "telefone",
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Simulador de pedido</h1>

      <Card className="space-y-4">
        {semVendedorVinculado && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠️ O seu acesso ainda não está vinculado a um vendedor, então não é possível lançar
            pedido. Peça a um Administrador para fazer o vínculo na tela de Usuários.
          </p>
        )}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Vendedor</Label>
            <select
              className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={vendedorId}
              disabled={vendedoresDisponiveis.length <= 1}
              onChange={(e) => { setVendedorId(e.target.value); setComissao(null); }}
            >
              <option value="">Selecione…</option>
              {vendedoresDisponiveis.map((v) => (
                <option key={v.id} value={v.id}>{v.name} — {v.canalNome}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>UF de destino</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={uf} onChange={(e) => setUf(e.target.value)}>
              <option value="">—</option>
              {ctx.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <Label>Cliente</Label>
            <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Novo cliente…</option>
              {ctx.clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!clienteId && (
            <div>
              <Label>Nome do novo cliente</Label>
              <Input value={clienteNovo} onChange={(e) => setClienteNovo(e.target.value)} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Comissão (fração)</Label>
            <Input
              value={comissao ?? vendedor?.regras.comissaoPadrao ?? ""}
              onChange={(e) => setComissao(e.target.value)}
              placeholder="ex.: 0,025"
            />
            {vendedor && comissao !== null && comissao !== vendedor.regras.comissaoPadrao && (
              <p className="mt-1 text-xs text-amber-700">Override do padrão do canal ({vendedor.regras.comissaoPadrao}) — registrado em auditoria ao fechar.</p>
            )}
          </div>
          <div>
            <Label>Frete (R$)</Label>
            {/* Frete por conta do cliente: o campo é bloqueado e vale 0. Nada de
                digitar um valor que o sistema depois ignora — ou pior, desconta. */}
            {freteCliente ? (
              <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm text-[var(--cor-texto-suave)]">
                R$ 0,00 — por conta do cliente
              </p>
            ) : freteAutomatico ? (
              <p className="rounded-md bg-[var(--cor-fundo)] px-3 py-2 text-sm">
                {simulacao.estado === "ok" ? reais(simulacao.freteUsado.toString()) : "—"} (automático: % da receita por UF)
              </p>
            ) : (
              <Input value={frete} onChange={(e) => setFrete(e.target.value)} />
            )}
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={freteCliente}
              onChange={(e) => {
                setFreteCliente(e.target.checked);
                if (e.target.checked) setFrete("0");
              }}
            />
            Frete por conta do cliente
          </label>
        </div>

        {/* Cadastro incompleto não impede de cotar — impede de imprimir uma
            ficha completa. O aviso aparece cedo, com o caminho para resolver. */}
        {faltaNoCadastro.length > 0 && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O cadastro de <strong>{clienteEscolhido?.name}</strong> está sem{" "}
            {faltaNoCadastro.join(", ")}. A ficha do pedido vai sair com o cabeçalho incompleto.{" "}
            <Link to={`/clientes/${clienteEscolhido?.id}`} className="font-semibold underline">
              Completar o cadastro
            </Link>
          </p>
        )}
      </Card>

      {/* ------------------------------------------------------------------
          Expedição e condições — o bloco de baixo do formulário de papel.
          Nenhum destes campos entra na cascata de margem.
          ------------------------------------------------------------------ */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Expedição e condições</h2>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            O que a expedição precisa para despachar e o financeiro para cobrar. Peso e volume
            podem ficar em branco agora e ser preenchidos na hora de embalar, na tela do pedido.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <Label>Transportadora</Label>
            <select
              className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={transportadoraId}
              onChange={(e) => setTransportadoraId(e.target.value)}
            >
              <option value="">—</option>
              {ctx.transportadoras.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          {transportadoraPedeNome && (
            <div>
              <Label>Qual transportadora</Label>
              <Input
                value={transportadoraOutra}
                onChange={(e) => setTransportadoraOutra(e.target.value)}
                placeholder="Nome da transportadora"
              />
            </div>
          )}
          <div>
            <Label>Peso (kg)</Label>
            <Input value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} placeholder="ex.: 12,5" />
          </div>
          <div>
            <Label>Volumes</Label>
            <Input value={volumes} onChange={(e) => setVolumes(e.target.value)} placeholder="ex.: 3" />
          </div>
          <div>
            <Label>Pagamento (dias)</Label>
            <Input
              value={prazoPagamento}
              onChange={(e) => setPrazoPagamento(e.target.value)}
              placeholder="ex.: 30"
            />
          </div>
          <div>
            <Label>CEP de entrega</Label>
            <Input
              value={cepEntrega}
              onChange={(e) => setCepEntrega(e.target.value)}
              placeholder={
                clienteEscolhido?.shipping_zip
                  ? formatarCep(clienteEscolhido.shipping_zip)
                  : "00000-000"
              }
            />
            {/* Só se digita aqui quando a entrega foge do endereço de sempre.
                Em branco, vale o do cadastro — e o cadastro não é alterado. */}
            <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
              {clienteEscolhido?.shipping_zip
                ? "Em branco, vale o do cadastro do cliente."
                : "O cliente não tem CEP de entrega no cadastro."}
            </p>
          </div>
        </div>
        <div>
          <Label>Observação</Label>
          <textarea
            className="w-full rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Sai impressa na ficha do pedido."
          />
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Itens</h2>
          <Button type="button" onClick={() => setLinhas((a) => [...a, LINHA_VAZIA])}>
            Adicionar item
          </Button>
        </div>
        {linhas.map((l, i) => {
          const r = resolvidas[i];
          return (
            <div key={i} className="space-y-2 rounded-md border border-[var(--cor-borda)] p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-72 flex-1">
                <Label>Produto ou kit</Label>
                <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" value={l.itemId} onChange={(e) => atualizarLinha(i, "itemId", e.target.value)}>
                  <option value="">Selecione…</option>
                  <option value={KIT_NOVO}>➕ Montar um kit novo aqui</option>
                  {ctx.itens.map((it) => <option key={it.id} value={it.id}>{it.codigo} — {it.nome}</option>)}
                </select>
              </div>
              <div>
                <Label>{l.itemId === KIT_NOVO ? "Quantidade de kits" : "Quantidade"}</Label>
                <Input className="w-28" value={l.quantidade} onChange={(e) => atualizarLinha(i, "quantidade", e.target.value)} />
              </div>
              <div>
                <Label>{l.itemId === KIT_NOVO ? "Preço por kit" : "Preço de venda"}</Label>
                <Input className="w-28" value={l.preco} onChange={(e) => atualizarLinha(i, "preco", e.target.value)} />
              </div>
              <div className="pb-2 text-xs text-[var(--cor-texto-suave)]">
                {r && !r.erro && (r.cmvUnitario
                  ? (verNumeros ? <>CMV un.: {reais(r.cmvUnitario)}</> : null)
                  : <span className="text-red-600">sem custo vigente (bloqueante)</span>)}
              </div>
              <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={() => setLinhas((a) => a.filter((_, idx) => idx !== i))}>
                Remover
              </button>
            </div>

            {l.itemId === KIT_NOVO && l.kitNovo && (
              <MontadorKit
                ctx={ctx}
                kit={l.kitNovo}
                resolvida={r}
                verNumeros={verNumeros}
                aoMudar={(muda) => atualizarKitNovo(i, muda)}
              />
            )}
            </div>
          );
        })}
      </Card>

      {simulacao.estado === "bloqueado" && (
        <p className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-700">🛑 {simulacao.msg}</p>
      )}

      {simulacao.estado === "ok" && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Cascata do pedido</h2>
            {(() => {
              const st = statusMargem(simulacao.resultado.margemContribuicaoPct, ctx.regrasMargem);
              return st ? (
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${CORES[st.color ?? ""] ?? "bg-gray-100 text-gray-800"}`}>
                  {st.label}
                </span>
              ) : null;
            })()}
          </div>

          {!verNumeros && (
            <p className="text-sm text-[var(--cor-texto-suave)]">
              A faixa acima indica a saúde da margem deste pedido. Os valores de custo e margem
              ficam visíveis para quem aprova.
            </p>
          )}

          {verNumeros && <table className="w-full text-sm">
            <tbody>
              <LinhaCascata rotulo="Receita bruta" valor={simulacao.resultado.receitaBruta.toString()} />
              <LinhaCascata rotulo="(−) Impostos sobre venda + DIFAL" valor={simulacao.resultado.imposto.plus(simulacao.resultado.difal).negated().toString()} />
              <LinhaCascata rotulo="= Receita líquida (após frete/comissão)" valor={simulacao.resultado.receitaLiquida.toString()} pct="100,00%" destaque />
              <LinhaCascata rotulo="(−) CMV" valor={simulacao.resultado.cmvTotal.negated().toString()} />
              <LinhaCascata
                rotulo="= MARGEM DE CONTRIBUIÇÃO (métrica oficial)"
                valor={simulacao.resultado.margemContribuicao.toString()}
                pct={percentual(simulacao.resultado.margemContribuicaoPct.toString())}
                destaque
              />
            </tbody>
          </table>}
          {verNumeros && <p className="text-xs text-[var(--cor-texto-suave)]">
            Deduções da receita líquida: frete {toMoney(simulacao.freteUsado).replace(".", ",")} · imposto frete{" "}
            {toMoney(simulacao.resultado.impostoFrete).replace(".", ",")} · comissão {toMoney(simulacao.resultado.comissao).replace(".", ",")}
            {freteCliente ? " · frete por conta do cliente (não entra no resultado)" : ""}
          </p>}

          {simulacao.avisos.map((a, i) => (
            <p key={i} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠️ {a}</p>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : cotacaoId ? "Salvar nova versão" : "Salvar cotação"}
            </Button>
            {salvo && (
              <span className="text-sm text-green-700">
                Cotação <strong>{salvo.quote_number}</strong> salva — versão {salvo.version} ✓
              </span>
            )}
            {erroSalvar && <span className="text-sm text-red-600">{erroSalvar}</span>}
          </div>
        </Card>
      )}
    </div>
  );
}

// Montador de kit embutido no pedido. Antes eram duas telas — criar o kit e
// depois puxar o código no simulador. A reunião de 16/07/2026 inverteu: o kit
// nasce aqui, e a tela de Kits vira consulta.
function MontadorKit({
  ctx,
  kit,
  resolvida,
  verNumeros,
  aoMudar,
}: {
  ctx: ContextoSimulador;
  kit: KitNovoEdicao;
  resolvida: LinhaResolvida | null;
  verNumeros: boolean;
  aoMudar: (muda: (k: KitNovoEdicao) => KitNovoEdicao) => void;
}) {
  // Escape hatch: nem todo insumo de embalagem já foi marcado como tal na
  // tela de Insumos (é o Administrador quem marca). Sem isto, quem monta o
  // kit e não acha o insumo certo na lista filtrada ficaria travado — e
  // Comercial nem tem acesso à tela de Insumos para corrigir sozinho.
  const [mostrarTodos, setMostrarTodos] = useState(false);
  // Um insumo já escolhido nunca some da lista, mesmo filtrado: senão, tirar
  // o "mostrar todos" depois de escolher um insumo fora da marcação faria a
  // seleção sumir da tela sem avisar.
  function opcoesPara(insumoIdAtual: string): typeof ctx.insumosEmbalagem {
    if (mostrarTodos) return ctx.insumosEmbalagem;
    return ctx.insumosEmbalagem.filter((i) => i.embalagem || i.id === insumoIdAtual);
  }

  return (
    <div className="space-y-3 rounded-md bg-[var(--cor-fundo)] p-3">
      <p className="text-sm text-[var(--cor-texto-suave)]">
        A quantidade e o preço acima são da <strong>venda deste kit</strong>. Aqui embaixo é a{" "}
        <strong>receita do kit</strong> — o que entra dentro de cada um.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label>Como chamar este kit (uso interno)</Label>
          <Input
            value={kit.rotulo}
            placeholder="ex.: Kit catarata Hospital X"
            onChange={(e) => aoMudar((k) => ({ ...k, rotulo: e.target.value }))}
          />
        </div>
        <p className="pb-2 text-xs text-[var(--cor-texto-suave)]">
          O código oficial só é gerado quando o pedido for ganho.
        </p>
      </div>

      {/* Aviso de composição já existente — pedido explícito na reunião:
          "a hora que ela jogar ali, o próprio sistema acusasse que aquele kit já existe". */}
      {resolvida?.kitExistente && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ Esta composição já existe: <strong>{resolvida.kitExistente.codigo}</strong>{" "}
          ({resolvida.kitExistente.nome}). Ao salvar, o pedido usará esse kit — o código é o mesmo,
          não será criado um duplicado.
        </p>
      )}
      {resolvida?.erro && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">🛑 {resolvida.erro}</p>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label>Produtos do kit</Label>
            <p className="text-xs text-[var(--cor-texto-suave)]">
              Quantas unidades de cada produto entram em <strong>1 kit</strong> — não é a venda.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-[var(--cor-primaria)] hover:underline"
            onClick={() => aoMudar((k) => ({ ...k, produtos: [...k.produtos, { produtoId: "", quantidade: "1" }] }))}
          >
            + Adicionar produto
          </button>
        </div>
        {kit.produtos.length > 0 && (
          <div className="flex gap-2 px-1 text-xs text-[var(--cor-texto-suave)]">
            <span className="flex-1">Produto</span>
            <span className="w-24">Qtd. no kit</span>
          </div>
        )}
        {kit.produtos.map((p, j) => (
          <div key={j} className="flex items-end gap-2">
            <select
              className="flex-1 rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={p.produtoId}
              onChange={(e) =>
                aoMudar((k) => ({
                  ...k,
                  produtos: k.produtos.map((x, idx) => (idx === j ? { ...x, produtoId: e.target.value } : x)),
                }))
              }
            >
              <option value="">Selecione…</option>
              {ctx.produtos.map((prod) => (
                <option key={prod.id} value={prod.id}>{prod.codigo} — {prod.nome}</option>
              ))}
            </select>
            <Input
              className="w-24"
              value={p.quantidade}
              onChange={(e) =>
                aoMudar((k) => ({
                  ...k,
                  produtos: k.produtos.map((x, idx) => (idx === j ? { ...x, quantidade: e.target.value } : x)),
                }))
              }
            />
            <button
              type="button"
              className="pb-2 text-xs text-red-600 hover:underline"
              onClick={() => aoMudar((k) => ({ ...k, produtos: k.produtos.filter((_, idx) => idx !== j) }))}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <Label>Embalagem e esterilização</Label>
            <p className="text-xs text-[var(--cor-texto-suave)]">
              O envelope é <strong>um por kit</strong>. A caixa de esterilização atende vários
              kits: escolha "itens por caixa" e diga quantos kits ela atende — o custo é rateado
              automaticamente, não é a quantidade de caixas.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-[var(--cor-primaria)] hover:underline"
            onClick={() => aoMudar((k) => ({ ...k, embalagem: [...k.embalagem, { insumoId: "", modo: "porKit", quantidade: "1" }] }))}
          >
            + Adicionar embalagem
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--cor-texto-suave)]">
          <input type="checkbox" checked={mostrarTodos} onChange={(e) => setMostrarTodos(e.target.checked)} />
          Não achei o insumo — mostrar todos os insumos do catálogo
        </label>
        {kit.embalagem.map((e, j) => (
          <div key={j} className="flex items-end gap-2">
            <select
              className="flex-1 rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={e.insumoId}
              onChange={(ev) =>
                aoMudar((k) => ({
                  ...k,
                  embalagem: k.embalagem.map((x, idx) => (idx === j ? { ...x, insumoId: ev.target.value } : x)),
                }))
              }
            >
              <option value="">Selecione…</option>
              {opcoesPara(e.insumoId).map((ins) => (
                <option key={ins.id} value={ins.id}>{ins.nome}</option>
              ))}
            </select>
            <select
              className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
              value={e.modo}
              onChange={(ev) =>
                aoMudar((k) => ({
                  ...k,
                  embalagem: k.embalagem.map((x, idx) =>
                    idx === j ? { ...x, modo: ev.target.value as ModoEmbalagem } : x
                  ),
                }))
              }
            >
              <option value="porKit">un. por kit</option>
              <option value="itensPorCaixa">itens por caixa</option>
            </select>
            <div>
              <Input
                className="w-24"
                value={e.quantidade}
                onChange={(ev) =>
                  aoMudar((k) => ({
                    ...k,
                    embalagem: k.embalagem.map((x, idx) => (idx === j ? { ...x, quantidade: ev.target.value } : x)),
                  }))
                }
              />
              <span className="text-[0.65rem] text-[var(--cor-texto-suave)]">
                {e.modo === "itensPorCaixa" ? "kits por caixa" : "un. por kit"}
              </span>
            </div>
            <button
              type="button"
              className="pb-2 text-xs text-red-600 hover:underline"
              onClick={() => aoMudar((k) => ({ ...k, embalagem: k.embalagem.filter((_, idx) => idx !== j) }))}
            >
              Remover
            </button>
          </div>
        ))}
      </div>

      {verNumeros && resolvida && !resolvida.erro && resolvida.linhasProdutos.length > 0 && (
        <PesoDeCustoDoKit ctx={ctx} resolvida={resolvida} />
      )}
    </div>
  );
}

// Peso de cada produto e embalagem no custo do kit — pedido do cliente em
// 30/07/2026: "não saberemos qual produto deu maior ou menor margem em cada
// kit". Não existe preço por produto dentro do kit (o cliente negocia o kit
// inteiro, não a peça); o que existe é o custo de cada um, e isso já responde
// "qual item está pesando mais" sem inventar um preço que não existe.
function PesoDeCustoDoKit({ ctx, resolvida }: { ctx: ContextoSimulador; resolvida: LinhaResolvida }) {
  const nomeDoProduto = (produtoId: string) => ctx.produtos.find((p) => p.id === produtoId)?.nome ?? produtoId;
  const linhas = [
    ...resolvida.linhasProdutos.map((l) => ({ nome: nomeDoProduto(l.produtoId), custo: l.custo, participacao: l.participacao })),
    ...resolvida.linhasEmbalagem.map((l) => ({ nome: l.nome, custo: l.custo, participacao: l.participacao })),
  ].sort((a, b) => Number(b.participacao) - Number(a.participacao));

  return (
    <div className="space-y-1 rounded-md border border-[var(--cor-borda)] bg-white p-3">
      <Label>Peso de cada item no custo do kit</Label>
      <table className="w-full text-sm">
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-[var(--cor-borda)] last:border-0">
              <td className="py-1">{l.nome}</td>
              <td className="py-1 text-right text-[var(--cor-texto-suave)]">{reais(l.custo)}</td>
              <td className="w-16 py-1 text-right font-medium">{percentual(l.participacao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhaCascata({ rotulo, valor, pct, destaque }: { rotulo: string; valor: string; pct?: string; destaque?: boolean }) {
  return (
    <tr className={destaque ? "font-semibold" : ""}>
      <td className="py-1">{rotulo}</td>
      <td className="py-1 text-right">{reais(valor)}</td>
      <td className="w-24 py-1 text-right text-[var(--cor-texto-suave)]">{pct ?? ""}</td>
    </tr>
  );
}
