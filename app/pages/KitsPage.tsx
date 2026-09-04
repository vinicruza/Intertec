import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { custoKitCompleto, type CustoProdutoKit, type EmbalagemKit } from "@calc";
import { listarAuditoriaKits, listarKits, type AuditoriaKit, type KitLinha } from "../lib/db/kits";
import { listarProdutos } from "../lib/db/produtos";
import { dataCurta, reais } from "../lib/format";
import { Badge, Card, Input, Label } from "@components/ui/primitives";

// "ativos" e "inativos" entraram em 04/09/2026, junto com o botão de inativar:
// sem eles, achar o que já foi tirado de circulação exigia varrer a lista
// inteira procurando o selo.
type FiltroAuditoria =
  | "todos"
  | "risco"
  | "cmv"
  | "sem-uso"
  | "de-pedido"
  | "manual"
  | "ativos"
  | "inativos";

export default function KitsPage() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroAuditoria>("todos");
  const kitsQuery = useQuery({ queryKey: ["kits"], queryFn: listarKits });
  const auditoriaQuery = useQuery({ queryKey: ["kits", "auditoria"], queryFn: listarAuditoriaKits });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });

  // CMV vigente por produto (de product_costs) para o custo do kit em cascata.
  const custoPorProduto = new Map<string, CustoProdutoKit>(
    (produtosQuery.data ?? []).filter((p) => p.cmv !== null).map((p) => [p.id, { cmv: p.cmv as string }])
  );

  // Custo do kit = produtos + embalagem/esterilização consumida uma vez por kit.
  function cmvDoKit(kit: KitLinha): string | null {
    const embalagem: EmbalagemKit[] = kit.kit_packaging.flatMap((e) =>
      e.inputs?.price_without_tax
        ? [{
            nome: e.inputs.name,
            custoUnitario: e.inputs.price_without_tax,
            quantidade:
              e.quantity_type === "lot"
                ? ({ tipo: "lote", tamanhoLote: String(e.lot_size) } as const)
                : ({ tipo: "direta", quantidade: String(e.quantity) } as const),
            maoDeObra: e.inputs.is_labor,
          }]
        : []
    );
    try {
      return custoKitCompleto(
        kit.kit_items.map((i) => ({ produtoId: i.product_id, quantidade: i.quantity })),
        custoPorProduto,
        embalagem
      ).custoTotal.toString();
    } catch {
      return null; // produto do kit sem custo vigente ainda
    }
  }

  const kits = kitsQuery.data ?? [];
  const auditoriaPorKit = useMemo(
    () => new Map((auditoriaQuery.data ?? []).map((linha) => [linha.kit_id, linha])),
    [auditoriaQuery.data]
  );
  const semCodigo = kits.filter((k) => !k.code?.trim()).length;
  const dePedido = kits.filter((k) => k.source_order_id).length;
  const inativos = kits.filter((k) => k.status === "inactive").length;
  const cmvPorKit = new Map(kits.map((k) => [k.id, cmvDoKit(k)]));
  const semComposicao = kits.filter((k) => k.kit_items.length === 0).length;
  const cmvPendente = kits.filter((k) => cmvPorKit.get(k.id) === null).length;
  const semUso = kits.filter((k) => (auditoriaPorKit.get(k.id)?.used_in_orders_count ?? 0) === 0).length;
  const usadosEmPedido = kits.filter((k) => (auditoriaPorKit.get(k.id)?.used_in_orders_count ?? 0) > 0).length;

  const kitsFiltrados = kits.filter((k) => {
    const auditoria = auditoriaPorKit.get(k.id);
    const cmv = cmvPorKit.get(k.id);
    const termo = busca.trim().toLowerCase();
    const texto = [
      k.code,
      k.legacy_code,
      k.name,
      k.description,
      auditoria?.source_order_quote_number,
      auditoria?.source_order_number,
      auditoria?.source_order_customer_name,
      ...(auditoria?.recent_orders ?? []).flatMap((p) => [p.quote_number, p.order_number, p.customer_name]),
      ...k.kit_items.map((i) => i.products?.name),
    ].filter(Boolean).join(" ").toLowerCase();
    const passaBusca = !termo || texto.includes(termo);
    const temRisco = !k.code?.trim() || k.kit_items.length === 0 || cmv === null;
    const passaFiltro =
      filtro === "todos" ||
      (filtro === "risco" && temRisco) ||
      (filtro === "cmv" && cmv === null) ||
      (filtro === "sem-uso" && (auditoria?.used_in_orders_count ?? 0) === 0) ||
      (filtro === "de-pedido" && Boolean(k.source_order_id)) ||
      (filtro === "manual" && !k.source_order_id) ||
      (filtro === "ativos" && k.status !== "inactive") ||
      (filtro === "inativos" && k.status === "inactive");
    return passaBusca && passaFiltro;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Kits</h1>
        {/* Reunião 16/07/2026: o kit passa a nascer dentro do pedido; esta tela
            vira o registro de consulta do que já foi criado. */}
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Registro dos kits já criados. Kits novos são montados dentro do{" "}
          <Link className="font-medium underline" to="/simulador">simulador de pedido</Link>, e o
          código oficial nasce ao clicar em Gerar Pedido.
        </p>
      </div>

      {kits.length > 0 && (
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <Card className="py-3">
            <div className="text-xs text-[var(--cor-texto-suave)]">Kits no catálogo</div>
            <div className="text-xl font-semibold">{kits.length}</div>
          </Card>
          <Card className="py-3">
            <div className="text-xs text-[var(--cor-texto-suave)]">Nascidos de pedido</div>
            <div className="text-xl font-semibold">{dePedido}</div>
          </Card>
          <Card className="py-3">
            <div className="text-xs text-[var(--cor-texto-suave)]">Inativos</div>
            <div className="text-xl font-semibold">{inativos}</div>
          </Card>
          <Card className={`py-3 ${semCodigo > 0 ? "border-red-200 bg-red-50" : ""}`}>
            <div className="text-xs text-[var(--cor-texto-suave)]">Sem código</div>
            <div className="text-xl font-semibold">{semCodigo}</div>
          </Card>
        </div>
      )}

      {kits.length > 0 && (
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <Card className={`py-3 ${semComposicao > 0 ? "border-red-200 bg-red-50" : ""}`}>
            <div className="text-xs text-[var(--cor-texto-suave)]">Sem composição</div>
            <div className="text-xl font-semibold">{semComposicao}</div>
          </Card>
          <Card className={`py-3 ${cmvPendente > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
            <div className="text-xs text-[var(--cor-texto-suave)]">CMV pendente</div>
            <div className="text-xl font-semibold">{cmvPendente}</div>
          </Card>
          <Card className="py-3">
            <div className="text-xs text-[var(--cor-texto-suave)]">Usados em pedidos</div>
            <div className="text-xl font-semibold">{usadosEmPedido}</div>
          </Card>
          <Card className="py-3">
            <div className="text-xs text-[var(--cor-texto-suave)]">Nunca usados</div>
            <div className="text-xl font-semibold">{semUso}</div>
          </Card>
        </div>
      )}

      {kits.length > 0 && (
        <Card className="grid gap-3 md:grid-cols-[1fr_220px]">
          <div>
            <Label>Buscar na auditoria</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código, kit, produto, cliente, orçamento ou pedido..."
            />
          </div>
          <div>
            <Label>Filtro</Label>
            <select
              className="h-10 w-full rounded-md border border-[var(--cor-borda)] px-2 text-sm"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as FiltroAuditoria)}
            >
              <option value="todos">Todos</option>
              <option value="risco">Com risco</option>
              <option value="cmv">CMV pendente</option>
              <option value="sem-uso">Nunca usados</option>
              <option value="de-pedido">Nascidos de pedido</option>
              <option value="manual">Cadastro manual</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
            </select>
          </div>
        </Card>
      )}

      {kitsQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {auditoriaQuery.isError && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Não foi possível carregar a auditoria de uso dos kits. A lista principal continua disponível.
        </p>
      )}

      {kits.length === 0 && !kitsQuery.isLoading && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Nenhum kit ainda. Monte o primeiro dentro do simulador de pedido — a assinatura única
            impede que a mesma composição receba dois códigos diferentes.
          </p>
        </Card>
      )}

      {kits.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Auditoria</th>
                <th className="px-4 py-3 font-medium">Composição e CMV</th>
                <th className="px-4 py-3 font-medium">Uso em pedidos</th>
                <th className="px-4 py-3 font-medium">CMV do kit</th>
              </tr>
            </thead>
            <tbody>
              {kitsFiltrados.map((k) => {
                const auditoria = auditoriaPorKit.get(k.id);
                const cmv = cmvPorKit.get(k.id) ?? null;
                return (
                  <tr
                    key={k.id}
                    className="cursor-pointer border-b border-[var(--cor-borda)] last:border-0 hover:bg-[var(--cor-fundo)]"
                    onClick={() => navigate(`/kits/${k.id}`)}
                  >
                    <td className="px-4 py-3 align-top">
                      {k.code ? (
                        <strong className="font-mono text-base text-[var(--cor-primaria)]">{k.code}</strong>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                          sem código
                        </span>
                      )}
                      <div className="max-w-64 text-xs text-[var(--cor-texto-suave)]">{k.name}</div>
                      {k.legacy_code && <div className="text-xs text-[var(--cor-texto-suave)]">antigo {k.legacy_code}</div>}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge>{k.source_order_id ? "de um pedido" : "cadastro manual"}</Badge>
                        {k.status === "inactive" && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            inativo
                          </span>
                        )}
                        {cmv === null && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            CMV pendente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-[var(--cor-texto-suave)]">
                      <div>Criado {auditoria?.created_by_name ? `por ${auditoria.created_by_name}` : ""} em {dataCurta(auditoria?.created_at)}</div>
                      {auditoria?.source_order_id ? (
                        <div className="mt-1">
                          Origem:{" "}
                          <Link
                            className="font-medium text-[var(--cor-primaria)] underline"
                            to={`/pedidos/${auditoria.source_order_id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {rotuloPedido(auditoria)}
                          </Link>
                          {auditoria.source_order_customer_name && <> · {auditoria.source_order_customer_name}</>}
                        </div>
                      ) : (
                        <div className="mt-1">Origem: cadastro manual</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-[var(--cor-texto-suave)]">
                      {k.kit_items.length > 0 ? (
                        k.kit_items.map((i) => `${i.quantity}× ${i.products?.name ?? "?"}`).join(" · ")
                      ) : (
                        <span className="text-red-700">sem composição</span>
                      )}
                      {k.kit_packaging.length > 0 && (
                        <div className="mt-1 text-xs">
                          Embalagem: {k.kit_packaging.map((e) =>
                            e.quantity_type === "lot"
                              ? `${e.inputs?.name ?? "?"} (1 para ${e.lot_size} kits)`
                              : `${e.quantity}× ${e.inputs?.name ?? "?"}`
                          ).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-[var(--cor-texto-suave)]">
                      {auditoria ? (
                        <>
                          <div className="font-medium text-[var(--cor-texto)]">
                            {auditoria.used_in_orders_count} pedido(s) · {Number(auditoria.total_quantity).toLocaleString("pt-BR")} kit(s)
                          </div>
                          {auditoria.last_used_at && <div>Último uso: {dataCurta(auditoria.last_used_at)}</div>}
                          {auditoria.recent_orders.length > 0 && (
                            <div className="mt-1 space-y-1">
                              {auditoria.recent_orders.slice(0, 3).map((p) => (
                                <Link
                                  key={p.order_id}
                                  className="block text-[var(--cor-primaria)] underline"
                                  to={`/pedidos/${p.order_id}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {rotuloPedido(p)} · {p.customer_name ?? "sem cliente"} · {Number(p.quantity).toLocaleString("pt-BR")} un.
                                </Link>
                              ))}
                            </div>
                          )}
                        </>
                      ) : auditoriaQuery.isLoading ? (
                        "Carregando auditoria..."
                      ) : (
                        "Sem dados de uso"
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">{reais(cmv)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {kitsFiltrados.length === 0 && (
            <p className="px-4 py-6 text-sm text-[var(--cor-texto-suave)]">
              Nenhum kit encontrado com os filtros atuais.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function rotuloPedido(
  pedido: Pick<AuditoriaKit, "source_order_number" | "source_order_quote_number"> | {
    order_number: string | null;
    quote_number: string | null;
  }
): string {
  if ("order_number" in pedido) {
    return [pedido.order_number, pedido.quote_number].filter(Boolean).join(" / ") || "ver pedido";
  }
  return [pedido.source_order_number, pedido.source_order_quote_number].filter(Boolean).join(" / ") || "ver pedido";
}
