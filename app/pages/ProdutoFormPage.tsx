import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  calcularFicha,
  type ComponenteRef,
  type ProdutoCascata,
} from "@calc";
import {
  carregarBaseCascata,
  obterProduto,
  quantidadeDoComponente,
  salvarProduto,
  type ComponenteForm,
  type ProdutoForm,
  listarCategoriasProduto,
} from "../lib/db/produtos";
import { descricaoNFdoProduto } from "../../lib/nomenclatura/descricaoNF";
import { familiasAtivas, listarFamiliasNF } from "../lib/db/nomenclaturaNF";
import { listarInsumos } from "../lib/db/insumos";
import {
  definirStatusDoProduto,
  excluirProduto,
  listarProdutos,
  obterUsoDoProduto,
} from "../lib/db/produtos";
import { reais, percentual } from "../lib/format";
import { useAuth } from "../auth/AuthProvider";
import {
  confirmacaoDeExclusaoDoProduto,
  confirmacaoDeStatusDoProduto,
  podeExcluirProduto,
  podeInativarProduto,
  produtoPodeSerExcluido,
} from "../lib/sim/catalogoDeProdutos";
import { perfilPodeEditarProduto } from "../lib/roles";
import { Button, Card, Input, Label } from "@components/ui/primitives";
import { mensagemDeErro } from "../lib/erros";

const ID_EDITANDO = "__editando__";

const COMPONENTE_VAZIO: ComponenteForm = {
  tipo: "insumo", refId: "", quantity_type: "direct",
  quantity: "1", width: "", length: "", yield_rate: "0.99", lot_size: "",
};

const textoCampo = (valor: unknown): string => String(valor ?? "");

export default function ProdutoFormPage() {
  const { id } = useParams();
  const { perfil } = useAuth();
  const podeEditar = perfil ? perfilPodeEditarProduto(perfil.perfil) : false;
  const editando = Boolean(id);
  const idAtual = id ?? ID_EDITANDO;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const { register, control, handleSubmit, reset, watch, setValue } = useForm<ProdutoForm>({
    defaultValues: {
      code: "", name: "", categoryId: "", type: "", sterile: false, size: "", grammage: "",
      nfDescription: "", componentes: [COMPONENTE_VAZIO],
    },
  });
  const ficha = useFieldArray({ control, name: "componentes" });

  const insumosQuery = useQuery({ queryKey: ["insumos"], queryFn: listarInsumos, enabled: podeEditar });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos, enabled: podeEditar });
  const categoriasQuery = useQuery({ queryKey: ["categorias-produto"], queryFn: listarCategoriasProduto, enabled: podeEditar });
  const baseQuery = useQuery({ queryKey: ["baseCascata", id ?? "novo"], queryFn: () => carregarBaseCascata(id ?? null), enabled: podeEditar });
  const produtoQuery = useQuery({ queryKey: ["produto", id], queryFn: () => obterProduto(id!), enabled: podeEditar && editando });
  // A regra de nomenclatura é cadastro (Cadastros → Nomenclatura NF), não
  // código: a tela carrega as famílias e as entrega para a função pura.
  const familiasQuery = useQuery({ queryKey: ["familiasNF"], queryFn: listarFamiliasNF, enabled: podeEditar });

  useEffect(() => {
    const p = produtoQuery.data;
    if (!p) return;
    reset({
      code: p.produto.code, name: p.produto.name, categoryId: p.produto.category_id,
      type: p.produto.type ?? "", sterile: p.produto.sterile ?? false,
      size: p.produto.size ?? "", grammage: p.produto.grammage ?? "",
      nfDescription: p.produto.nf_description ?? "",
      componentes: p.componentes.length
        ? p.componentes.map((c) => ({
            tipo: c.component_input_id ? "insumo" : "produto",
            refId: c.component_input_id ?? c.component_product_id ?? "",
            quantity_type: c.quantity_type,
            quantity: textoCampo(c.quantity), width: textoCampo(c.width), length: textoCampo(c.length),
            yield_rate: textoCampo(c.yield_rate), lot_size: textoCampo(c.lot_size),
          }))
        : [COMPONENTE_VAZIO],
    });
  }, [produtoQuery.data, reset]);

  const componentes = watch("componentes");

  // Descrição de NF que a regra produziria para o nome digitado. Só aparece
  // como sugestão: quem cadastra continua livre para escrever outro texto, e o
  // que for escrito à mão fica marcado como manual e a salvo da regra.
  const nomeAtual = watch("name");
  const nfDescriptionAtual = watch("nfDescription");
  const familias = useMemo(() => familiasAtivas(familiasQuery.data ?? []), [familiasQuery.data]);
  const sugestaoNF = useMemo(() => descricaoNFdoProduto(nomeAtual, familias), [nomeAtual, familias]);

  // Prévia ao vivo do CMV e participação (cálculo no motor). Só computa quando
  // todos os componentes têm referência escolhida; senão, mostra pendente.
  const previa = useMemo(() => {
    const base = baseQuery.data;
    if (!base) return { estado: "carregando" as const };
    if (!componentes.every((c) => c.refId)) return { estado: "incompleto" as const };
    try {
      const refs: ComponenteRef[] = componentes.map((c) => {
        const { estrutura } = quantidadeDoComponente(c);
        return c.tipo === "insumo"
          ? { tipo: "insumo", insumoId: c.refId, quantidade: estrutura }
          : { tipo: "produto", produtoId: c.refId, quantidade: estrutura };
      });
      const produtos: ProdutoCascata[] = [...base.produtos, { id: idAtual, componentes: refs }];
      const r = calcularFicha(idAtual, base.insumos, produtos);
      return { estado: "ok" as const, ...r };
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Não foi possível calcular a ficha.";
      return { estado: "erro" as const, msg };
    }
  }, [componentes, baseQuery.data, idAtual]);

  // ---------- Situação no catálogo (Patricia, 08/09/2026) ----------
  //
  // Quem recusa de verdade é o banco (`set_product_status` e `delete_product`);
  // a tela só evita oferecer o que vai ser recusado. O uso do produto é
  // carregado à parte porque é ele que decide se excluir sequer aparece.
  const usoQuery = useQuery({
    queryKey: ["usoDoProduto", id],
    queryFn: () => obterUsoDoProduto(id!),
    enabled: podeEditar && editando && podeInativarProduto(perfil?.perfil),
  });

  const alterarStatus = useMutation({
    mutationFn: (ativo: boolean) => definirStatusDoProduto(id!, ativo),
    onSuccess: () => {
      setErroSalvar(null);
      queryClient.invalidateQueries({ queryKey: ["produto", id] });
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["ctxSimulador"] });
    },
    onError: (e: unknown) => setErroSalvar(mensagemErro(e)),
  });

  const excluir = useMutation({
    mutationFn: () => excluirProduto(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      queryClient.invalidateQueries({ queryKey: ["ctxSimulador"] });
      navigate("/produtos");
    },
    onError: (e: unknown) => setErroSalvar(mensagemErro(e)),
  });

  const salvar = useMutation({
    mutationFn: async (form: ProdutoForm) => {
      await salvarProduto(id ?? null, form, familias);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      navigate("/produtos");
    },
    onError: (e: unknown) => setErroSalvar(mensagemErro(e)),
  });

  const insumos = insumosQuery.data ?? [];
  const produtosRef = (produtosQuery.data ?? []).filter((p) => p.id !== id);
  const produtoInativo = produtoQuery.data?.produto.status === "inactive";
  const usoResumo = {
    emPedidos: usoQuery.data?.em_pedidos ?? 0,
    emKits: usoQuery.data?.em_kits ?? 0,
    emFichas: usoQuery.data?.em_fichas ?? 0,
    emVendas: usoQuery.data?.em_vendas ?? 0,
    emDespesas: usoQuery.data?.em_despesas ?? 0,
  };

  if (!podeEditar) {
    return <Navigate to="/produtos" replace />;
  }

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">{editando ? "Editar produto" : "Novo produto"}</h1>

      {/* ---------- Situação no catálogo (pedido da Patricia, 08/09/2026) ----------
          Fora do formulário de propósito: tirar um produto de circulação é uma
          decisão por si só, não algo que se salva junto com uma edição de
          ficha técnica. */}
      {editando && produtoQuery.data && podeInativarProduto(perfil?.perfil) && (
        <Card className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--cor-texto-suave)]">Situação no catálogo:</span>
              {produtoInativo ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  inativo — não aparece para vender
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                  ativo
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className={produtoInativo ? "" : "bg-transparent text-[var(--cor-primaria)] hover:bg-[var(--cor-fundo)]"}
                disabled={alterarStatus.isPending || excluir.isPending}
                onClick={() => {
                  const ativando = produtoInativo;
                  const texto = confirmacaoDeStatusDoProduto({
                    ativando,
                    codigo: produtoQuery.data?.produto.code ?? null,
                    nome: produtoQuery.data?.produto.name ?? "",
                    uso: usoResumo,
                  });
                  if (window.confirm(texto)) alterarStatus.mutate(ativando);
                }}
              >
                {alterarStatus.isPending ? "Alterando…" : produtoInativo ? "Reativar produto" : "Inativar produto"}
              </Button>
              {/* Excluir só aparece quando é possível: produto que nunca andou.
                  Oferecer e recusar depois seria pior do que não oferecer. */}
              {podeExcluirProduto(perfil?.perfil) && usoQuery.data && produtoPodeSerExcluido(usoResumo) && (
                <Button
                  type="button"
                  className="bg-transparent text-red-700 hover:bg-red-50"
                  disabled={excluir.isPending || alterarStatus.isPending}
                  onClick={() => {
                    const texto = confirmacaoDeExclusaoDoProduto({
                      codigo: produtoQuery.data?.produto.code ?? null,
                      nome: produtoQuery.data?.produto.name ?? "",
                    });
                    if (window.confirm(texto)) excluir.mutate();
                  }}
                >
                  {excluir.isPending ? "Excluindo…" : "Excluir produto"}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-[var(--cor-texto-suave)]">
            Produto inativo sai da lista de itens do pedido e da montagem de kits, mas nada é
            apagado: pedidos e kits já feitos não mudam, e dá para reativar quando quiser.
            {usoQuery.data && !produtoPodeSerExcluido(usoResumo)
              ? " Excluir não é possível porque ele já foi usado — apagar levaria junto o histórico que o menciona."
              : " Excluir só está disponível porque ele nunca foi usado em lugar nenhum."}
          </p>
          {usoQuery.data && usoResumo.emKits > 0 && !produtoInativo && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Este produto está em {usoResumo.emKits} kit(s). Inativá-lo não tira esses kits de
              venda — eles continuam à venda com ele dentro.
            </p>
          )}
        </Card>
      )}

      <form onSubmit={handleSubmit((f) => salvar.mutate(f))} className="space-y-4" noValidate>
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Código</Label>
              <Input
                {...register("code")}
                readOnly
                placeholder={editando ? "" : "Gerado automaticamente"}
              />
            </div>
            <div><Label>Nome</Label><Input {...register("name", { required: true })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Categoria</Label><select className="w-full min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm" {...register("categoryId", { required: true })}>
              <option value="">Selecione…</option>
              {(categoriasQuery.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.prefix} — {c.name}</option>)}
            </select></div>
            <div><Label>Tamanho</Label><Input {...register("size")} /></div>
            <div><Label>Gramatura</Label><Input {...register("grammage")} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("sterile")} /> Estéril
          </label>
          <div>
            <Label>Descrição NF</Label>
            <Input {...register("nfDescription")} placeholder="Texto que sai na nota fiscal ao faturar este produto" />
            <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
              Guardado aqui para não depender de decorar ou copiar de outro lugar na hora de
              faturar. O sistema ainda não emite nota fiscal — isso continua manual, fora daqui.
            </p>
            {sugestaoNF && sugestaoNF !== textoCampo(nfDescriptionAtual).trim() && (
              <p className="mt-2 text-xs">
                <span className="text-[var(--cor-texto-suave)]">Pela regra de nomenclatura: </span>
                <strong>{sugestaoNF}</strong>{" "}
                <button
                  type="button"
                  className="text-[var(--cor-primaria)] hover:underline"
                  onClick={() => setValue("nfDescription", sugestaoNF, { shouldDirty: true })}
                >
                  usar esta
                </button>
              </p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Ficha técnica</h2>
            <Button type="button" onClick={() => ficha.append(COMPONENTE_VAZIO)}>Adicionar componente</Button>
          </div>

          <div className="space-y-3">
            {ficha.fields.map((campo, i) => {
              const tipo = componentes[i]?.tipo;
              const qt = componentes[i]?.quantity_type;
              const linha = previa.estado === "ok" ? previa.linhas[i] : undefined;
              return (
                <div key={campo.id} className="rounded-md border border-[var(--cor-borda)] p-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <Label>Tipo</Label>
                      <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" {...register(`componentes.${i}.tipo`)}>
                        <option value="insumo">Insumo</option>
                        <option value="produto">Produto (kit)</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <Label>{tipo === "produto" ? "Produto" : "Insumo"}</Label>
                      <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" {...register(`componentes.${i}.refId`)}>
                        <option value="">Selecione…</option>
                        {(tipo === "produto" ? produtosRef : insumos).map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Quantidade por</Label>
                      <select className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm" {...register(`componentes.${i}.quantity_type`)}>
                        <option value="direct">Direta</option>
                        <option value="area">Área (L×C÷rend.)</option>
                        <option value="lot">Lote (1÷tam.)</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {qt === "direct" && <CampoQtd label="Quantidade" reg={register(`componentes.${i}.quantity`)} />}
                    {qt === "area" && <>
                      <CampoQtd label="Largura" reg={register(`componentes.${i}.width`)} />
                      <CampoQtd label="Comprimento" reg={register(`componentes.${i}.length`)} />
                      <CampoQtd label="Rendimento" reg={register(`componentes.${i}.yield_rate`)} />
                    </>}
                    {qt === "lot" && <CampoQtd label="Tamanho do lote" reg={register(`componentes.${i}.lot_size`)} />}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-[var(--cor-texto-suave)]">
                      {linha ? <>Custo: {reais(linha.custo.toString())} · Participação: {percentual(linha.participacao.toString())}</> : "—"}
                    </span>
                    <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => ficha.remove(i)}>Remover</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-md bg-[var(--cor-fundo)] p-3 text-sm">
            {previa.estado === "ok" && <div className="text-lg font-semibold">CMV do produto: {reais(previa.cmv.toString())}</div>}
            {previa.estado === "incompleto" && <span className="text-[var(--cor-texto-suave)]">Selecione todos os componentes para ver o CMV.</span>}
            {previa.estado === "erro" && <span className="text-red-600">{previa.msg}</span>}
            {previa.estado === "carregando" && <span className="text-[var(--cor-texto-suave)]">Carregando base de cálculo…</span>}
          </div>
        </Card>

        {erroSalvar && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erroSalvar}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar"}</Button>
          <Button type="button" className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/produtos")}>Cancelar</Button>
        </div>
      </form>
    </div>
  );
}

function CampoQtd({ label, reg }: { label: string; reg: UseFormRegisterReturn }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input {...reg} />
    </div>
  );
}

// A validação de referência circular é do banco (trigger). Traduz a mensagem.
function mensagemErro(e: unknown): string {
  // Duas regras próprias desta tela; o resto sai da tradução comum, que já
  // conhece as travas do banco e nunca despeja o nome delas na tela.
  const cru = e instanceof Error ? e.message : String(e);
  if (/circular|ciclo/i.test(cru)) {
    return "Referência circular: um produto não pode conter a si mesmo (direta ou indiretamente).";
  }
  if (/duplicate key|unique/i.test(cru)) return "Já existe um produto com este código.";
  return mensagemDeErro(e, "Não foi possível salvar o produto.");
}
