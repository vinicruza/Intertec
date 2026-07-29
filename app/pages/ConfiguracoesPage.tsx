import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  atualizarCanal,
  atualizarDifal,
  atualizarIcsm,
  atualizarPortal,
  atualizarRegraMargem,
  listarCanais,
  listarDifal,
  listarIcsm,
  listarPortal,
  listarRegrasMargem,
  gerarCodigosErp,
  obterParametrosCodigoErp,
  salvarParametrosCodigoErp,
  type ParametrosCodigoErp,
  type CanalLinha,
  type DifalLinha,
  type IcsmLinha,
  type PortalLinha,
  type RegraMargemLinha,
} from "../lib/db/configuracoes";
import {
  obterParametrosAprovacao,
  salvarParametrosAprovacao,
  type ParametrosAprovacao,
} from "../lib/db/aprovacao";
import type { Perfil } from "../lib/roles";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

type Aba = "canais" | "margem" | "aprovacao" | "codigoErp" | "icsm" | "difal" | "portal";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "canais", rotulo: "Canais" },
  { id: "margem", rotulo: "Faixas de margem" },
  { id: "aprovacao", rotulo: "Aprovação de pedidos" },
  { id: "codigoErp", rotulo: "Código para o ERP" },
  { id: "icsm", rotulo: "ICSM por UF" },
  { id: "difal", rotulo: "DIFAL por UF" },
  { id: "portal", rotulo: "Frete Portal (Marketplace)" },
];

export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<Aba>("canais");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Configurações</h1>
      <p className="text-sm text-[var(--cor-texto-suave)]">
        Tabelas editáveis pelo Administrador (PRD §6.11). Alterar um parâmetro aqui não recalcula
        pedidos já fechados — eles têm snapshot próprio (D7).
      </p>

      <div className="flex flex-wrap gap-1 border-b border-[var(--cor-borda)]">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              aba === a.id
                ? "border-b-2 border-[var(--cor-primaria)] text-[var(--cor-primaria)]"
                : "text-[var(--cor-texto-suave)] hover:text-[var(--cor-texto)]"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "canais" && <AbaCanais />}
      {aba === "margem" && <AbaMargem />}
      {aba === "aprovacao" && <AbaAprovacao />}
      {aba === "codigoErp" && <AbaCodigoErp />}
      {aba === "icsm" && <AbaIcsm />}
      {aba === "difal" && <AbaDifal />}
      {aba === "portal" && <AbaPortal />}
    </div>
  );
}

// ---------- Canais ----------

function AbaCanais() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["canais"], queryFn: listarCanais });
  const salvar = useMutation({
    mutationFn: (v: { id: string; campos: Parameters<typeof atualizarCanal>[1] }) =>
      atualizarCanal(v.id, v.campos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["canais"] }),
  });

  if (isLoading) return <Carregando />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
            <th className="px-4 py-3 font-medium">Canal</th>
            <th className="px-4 py-3 font-medium">Aplica DIFAL</th>
            <th className="px-4 py-3 font-medium">Comissão padrão</th>
            <th className="px-4 py-3 font-medium">Modelo de frete</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c) => (
            <LinhaCanal key={c.id} canal={c} onSalvar={(campos) => salvar.mutate({ id: c.id, campos })} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LinhaCanal({ canal, onSalvar }: { canal: CanalLinha; onSalvar: (c: Parameters<typeof atualizarCanal>[1]) => void }) {
  const [aplicaDifal, setAplicaDifal] = useState(canal.applies_difal);
  const [comissao, setComissao] = useState(canal.default_commission_rate);
  const [freteModel, setFreteModel] = useState(canal.freight_model);
  const alterado = aplicaDifal !== canal.applies_difal || comissao !== canal.default_commission_rate || freteModel !== canal.freight_model;

  return (
    <tr className="border-b border-[var(--cor-borda)] last:border-0">
      <td className="px-4 py-3 font-medium">{canal.name}</td>
      <td className="px-4 py-3">
        <input type="checkbox" checked={aplicaDifal} onChange={(e) => setAplicaDifal(e.target.checked)} />
      </td>
      <td className="px-4 py-3">
        <Input className="w-24" value={comissao} onChange={(e) => setComissao(e.target.value)} />
      </td>
      <td className="px-4 py-3">
        <select
          className="rounded-md border border-[var(--cor-borda)] px-2 py-1 text-sm"
          value={freteModel}
          onChange={(e) => setFreteModel(e.target.value as CanalLinha["freight_model"])}
        >
          <option value="manual">Manual</option>
          <option value="uf_percent">% da receita por UF (Portal)</option>
        </select>
        {alterado && (
          <Button
            className="ml-2 px-2 py-1 text-xs"
            onClick={() => onSalvar({ applies_difal: aplicaDifal, default_commission_rate: comissao, freight_model: freteModel })}
          >
            Salvar
          </Button>
        )}
      </td>
    </tr>
  );
}

// ---------- Aprovação de pedidos ----------

const PERFIS_APROVADORES: Array<{ id: Perfil; rotulo: string }> = [
  { id: "admin", rotulo: "Administrador" },
  { id: "financeiro", rotulo: "Financeiro" },
  { id: "comercial", rotulo: "Comercial" },
  { id: "producao", rotulo: "Produção" },
];

function AbaAprovacao() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["paramsAprovacao"], queryFn: obterParametrosAprovacao });
  const [form, setForm] = useState<ParametrosAprovacao | null>(null);
  const atual = form ?? data ?? null;

  const salvar = useMutation({
    mutationFn: (p: ParametrosAprovacao) => salvarParametrosAprovacao(p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["paramsAprovacao"] }),
  });

  if (isLoading || !atual) return <Carregando />;

  function mudar(campos: Partial<ParametrosAprovacao>) {
    setForm({ ...(atual as ParametrosAprovacao), ...campos });
  }

  return (
    <Card className="max-w-2xl space-y-4">
      <p className="text-xs text-[var(--cor-texto-suave)]">
        Quem aprova é definido por <strong>perfil</strong>, não por pessoa — assim a regra não
        quebra quando muda quem faz a conferência.
      </p>

      <div>
        <Label>Perfis que podem aprovar</Label>
        <div className="mt-1 flex flex-wrap gap-4">
          {PERFIS_APROVADORES.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={atual.approver_roles.includes(p.id)}
                onChange={(e) =>
                  mudar({
                    approver_roles: e.target.checked
                      ? [...atual.approver_roles, p.id]
                      : atual.approver_roles.filter((r) => r !== p.id),
                  })
                }
              />
              {p.rotulo}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={atual.require_approval}
          onChange={(e) => mudar({ require_approval: e.target.checked })}
        />
        <span>
          <strong>Exigir aprovação para fechar o pedido</strong>
          <span className="block text-xs text-[var(--cor-texto-suave)]">
            Equivale ao papel que hoje vai para a mesa da conferência, só que com a margem à vista.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={atual.hide_margin_numbers_from_sales}
          onChange={(e) => mudar({ hide_margin_numbers_from_sales: e.target.checked })}
        />
        <span>
          <strong>Mostrar ao Comercial só a cor da margem, sem o número</strong>
          <span className="block text-xs text-[var(--cor-texto-suave)]">
            Vendo o percentual, o desconto ganha um alvo — desconta-se até raspar o limite da faixa.
            Vendo só a cor, não dá para saber se está em 52% ou em 80%.
          </span>
        </span>
      </label>

      <div>
        <Label>Travar aprovação abaixo da margem (fração, ex.: 0,20)</Label>
        <Input
          className="w-40"
          value={atual.block_below_margin ?? ""}
          placeholder="vazio = sem trava"
          onChange={(e) => mudar({ block_below_margin: e.target.value.trim().replace(",", ".") || null })}
        />
        <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
          Deixe vazio no começo: a orientação da reunião foi primeiro dar visibilidade e observar o
          que acontece, e só depois decidir se trava.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          disabled={salvar.isPending || atual.approver_roles.length === 0}
          onClick={() => salvar.mutate(atual)}
        >
          {salvar.isPending ? "Salvando…" : "Salvar"}
        </Button>
        {atual.approver_roles.length === 0 && (
          <span className="text-sm text-red-600">Escolha ao menos um perfil aprovador.</span>
        )}
        {salvar.isSuccess && !form && <span className="text-sm text-green-700">Salvo ✓</span>}
      </div>
    </Card>
  );
}

// ---------- Código de produto para o ERP ----------

function AbaCodigoErp() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["paramsCodigoErp"], queryFn: obterParametrosCodigoErp });
  const [form, setForm] = useState<ParametrosCodigoErp | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const atual = form ?? data ?? null;

  const salvar = useMutation({
    mutationFn: (p: ParametrosCodigoErp) => salvarParametrosCodigoErp(p),
    onSuccess: () => { setErro(null); queryClient.invalidateQueries({ queryKey: ["paramsCodigoErp"] }); },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  const gerar = useMutation({
    mutationFn: gerarCodigosErp,
    onSuccess: (n) => { setErro(null); setResultado(`${n} código(s) gerado(s).`); },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao gerar códigos."),
  });

  if (isLoading || !atual) return <Carregando />;

  function mudar(campos: Partial<ParametrosCodigoErp>) {
    setForm({ ...(atual as ParametrosCodigoErp), ...campos });
  }

  const sequenciais = atual.total_digits - atual.category_digits;

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Aguardando confirmação do formato.</strong> A reunião pediu um código numérico para
        o sistema de faturamento, mas o limite real dele não foi confirmado — e foi levantado que os
        atributos do produto podem não caber no código. Por isso este código é{" "}
        <strong>paralelo</strong>: o código semântico atual (PC-0001) continua sendo a identidade
        interna, e nada do catálogo é recodificado. Confirme o formato com o {atual.target_system} e
        só então ligue a geração.
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Sistema de destino</Label>
          <Input value={atual.target_system} onChange={(e) => mudar({ target_system: e.target.value })} />
        </div>
        <div>
          <Label>Total de dígitos</Label>
          <Input
            className="w-28"
            value={String(atual.total_digits)}
            onChange={(e) => mudar({ total_digits: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label>Dígitos da categoria</Label>
          <Input
            className="w-28"
            value={String(atual.category_digits)}
            onChange={(e) => mudar({ category_digits: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="self-end pb-2 text-sm text-[var(--cor-texto-suave)]">
          Sobram <strong>{sequenciais > 0 ? sequenciais : 0}</strong> dígito(s) de sequência —
          até {sequenciais > 0 ? Math.pow(10, sequenciais) - 1 : 0} produtos por categoria.
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={atual.enabled}
          onChange={(e) => mudar({ enabled: e.target.checked })}
        />
        <span>
          <strong>Ligar a geração de código de ERP</strong>
          <span className="block text-xs text-[var(--cor-texto-suave)]">
            Marque só depois de confirmar o formato aceito. O prefixo numérico de cada categoria é
            editado no cadastro de categorias.
          </span>
        </span>
      </label>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {resultado && <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{resultado}</p>}

      <div className="flex items-center gap-3">
        <Button disabled={salvar.isPending} onClick={() => salvar.mutate(atual)}>
          {salvar.isPending ? "Salvando…" : "Salvar formato"}
        </Button>
        <Button
          className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]"
          disabled={!atual.enabled || gerar.isPending}
          onClick={() => {
            setResultado(null);
            if (window.confirm("Gerar os códigos de ERP que ainda faltam? Produtos que já têm código não são alterados.")) {
              gerar.mutate();
            }
          }}
        >
          {gerar.isPending ? "Gerando…" : "Gerar códigos pendentes"}
        </Button>
      </div>
      <p className="text-xs text-[var(--cor-texto-suave)]">
        A geração nunca altera um código já existente: se ele já foi para o ERP, mudar quebraria a
        referência lá.
      </p>
    </Card>
  );
}

// ---------- Faixas de margem ----------

function AbaMargem() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["regrasMargem"], queryFn: listarRegrasMargem });
  const salvar = useMutation({
    mutationFn: (v: { id: string; campos: Parameters<typeof atualizarRegraMargem>[1] }) =>
      atualizarRegraMargem(v.id, v.campos),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regrasMargem"] }),
  });

  if (isLoading) return <Carregando />;
  return (
    <Card className="overflow-x-auto p-0">
      <p className="px-4 pt-4 text-xs text-[var(--cor-texto-suave)]">
        Faixas de status da margem de contribuição, sobre a receita líquida (Decisão D2).
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Mínimo</th>
            <th className="px-4 py-3 font-medium">Máximo</th>
            <th className="px-4 py-3 font-medium">Cor</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((r) => (
            <LinhaMargem key={r.id} regra={r} onSalvar={(campos) => salvar.mutate({ id: r.id, campos })} />
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function LinhaMargem({ regra, onSalvar }: { regra: RegraMargemLinha; onSalvar: (c: Parameters<typeof atualizarRegraMargem>[1]) => void }) {
  const [min, setMin] = useState(regra.min_rate ?? "");
  const [max, setMax] = useState(regra.max_rate ?? "");
  const [cor, setCor] = useState(regra.color ?? "");
  const alterado = min !== (regra.min_rate ?? "") || max !== (regra.max_rate ?? "") || cor !== (regra.color ?? "");

  return (
    <tr className="border-b border-[var(--cor-borda)] last:border-0">
      <td className="px-4 py-3 font-medium">
        <Badge>{regra.label}</Badge>
      </td>
      <td className="px-4 py-3"><Input className="w-24" placeholder="sem piso" value={min} onChange={(e) => setMin(e.target.value)} /></td>
      <td className="px-4 py-3"><Input className="w-24" placeholder="sem teto" value={max} onChange={(e) => setMax(e.target.value)} /></td>
      <td className="px-4 py-3">
        <Input className="w-24" value={cor} onChange={(e) => setCor(e.target.value)} />
        {alterado && (
          <Button className="ml-2 px-2 py-1 text-xs" onClick={() => onSalvar({ min_rate: min || null, max_rate: max || null, color: cor || null })}>
            Salvar
          </Button>
        )}
      </td>
    </tr>
  );
}

// ---------- ICSM ----------

function AbaIcsm() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["icsm"], queryFn: listarIcsm });
  const salvar = useMutation({
    mutationFn: (v: { id: string; icms: string; pis: string }) => atualizarIcsm(v.id, v.icms, v.pis),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["icsm"] }),
  });

  if (isLoading) return <Carregando />;
  return (
    <TabelaUF titulo="Alíquota total = ICMS interestadual + PIS/COFINS (Calculations.md §7.1)">
      <thead>
        <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-4 py-3 font-medium">UF</th>
          <th className="px-4 py-3 font-medium">ICMS</th>
          <th className="px-4 py-3 font-medium">PIS/COFINS</th>
        </tr>
      </thead>
      <tbody>
        {(data ?? []).map((r: IcsmLinha) => (
          <LinhaIcsm key={r.id} linha={r} onSalvar={(icms, pis) => salvar.mutate({ id: r.id, icms, pis })} />
        ))}
      </tbody>
    </TabelaUF>
  );
}

function LinhaIcsm({ linha, onSalvar }: { linha: IcsmLinha; onSalvar: (icms: string, pis: string) => void }) {
  const [icms, setIcms] = useState(linha.icms_rate);
  const [pis, setPis] = useState(linha.pis_cofins_rate);
  const alterado = icms !== linha.icms_rate || pis !== linha.pis_cofins_rate;
  return (
    <tr className="border-b border-[var(--cor-borda)] last:border-0">
      <td className="px-4 py-3 font-medium">{linha.uf}</td>
      <td className="px-4 py-3"><Input className="w-24" value={icms} onChange={(e) => setIcms(e.target.value)} /></td>
      <td className="px-4 py-3">
        <Input className="w-24" value={pis} onChange={(e) => setPis(e.target.value)} />
        {alterado && <Button className="ml-2 px-2 py-1 text-xs" onClick={() => onSalvar(icms, pis)}>Salvar</Button>}
      </td>
    </tr>
  );
}

// ---------- DIFAL ----------

function AbaDifal() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["difal"], queryFn: listarDifal });
  const salvar = useMutation({
    mutationFn: (v: { id: string; final: string }) => atualizarDifal(v.id, v.final),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["difal"] }),
  });

  if (isLoading) return <Carregando />;
  return (
    <TabelaUF titulo="Migrado da planilha como está (Decisão D5). UFs sinalizadas: valor final não bate com Pobreza + Alíquota — confirmar com o contador.">
      <thead>
        <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-4 py-3 font-medium">UF</th>
          <th className="px-4 py-3 font-medium">Pobreza (FCP)</th>
          <th className="px-4 py-3 font-medium">Alíquota base</th>
          <th className="px-4 py-3 font-medium">DIFAL final</th>
        </tr>
      </thead>
      <tbody>
        {(data ?? []).map((r: DifalLinha) => (
          <LinhaDifal key={r.id} linha={r} onSalvar={(final) => salvar.mutate({ id: r.id, final })} />
        ))}
      </tbody>
    </TabelaUF>
  );
}

function LinhaDifal({ linha, onSalvar }: { linha: DifalLinha; onSalvar: (final: string) => void }) {
  const [final, setFinal] = useState(linha.final_rate);
  const alterado = final !== linha.final_rate;
  return (
    <tr className="border-b border-[var(--cor-borda)] last:border-0">
      <td className="px-4 py-3 font-medium">
        {linha.uf}
        {linha.flagged_for_review && <span className="ml-2 text-amber-600" title="Não bate com Pobreza + Alíquota">⚠️</span>}
      </td>
      <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{linha.fcp_rate ?? "—"}</td>
      <td className="px-4 py-3 text-[var(--cor-texto-suave)]">{linha.base_rate ?? "—"}</td>
      <td className="px-4 py-3">
        <Input className="w-24" value={final} onChange={(e) => setFinal(e.target.value)} />
        {alterado && <Button className="ml-2 px-2 py-1 text-xs" onClick={() => onSalvar(final)}>Salvar</Button>}
      </td>
    </tr>
  );
}

// ---------- Frete Portal ----------

function AbaPortal() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: listarPortal });
  const salvar = useMutation({
    mutationFn: (v: { id: string; pct: string }) => atualizarPortal(v.id, v.pct),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal"] }),
  });

  if (isLoading) return <Carregando />;
  return (
    <TabelaUF titulo="Frete estimado como % da receita, usado pelos canais com modelo 'uf_percent' (ex.: Marketplace).">
      <thead>
        <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
          <th className="px-4 py-3 font-medium">UF</th>
          <th className="px-4 py-3 font-medium">% do frete</th>
        </tr>
      </thead>
      <tbody>
        {(data ?? []).map((r: PortalLinha) => (
          <LinhaPortal key={r.id} linha={r} onSalvar={(pct) => salvar.mutate({ id: r.id, pct })} />
        ))}
      </tbody>
    </TabelaUF>
  );
}

function LinhaPortal({ linha, onSalvar }: { linha: PortalLinha; onSalvar: (pct: string) => void }) {
  const [pct, setPct] = useState(linha.freight_percent);
  const alterado = pct !== linha.freight_percent;
  return (
    <tr className="border-b border-[var(--cor-borda)] last:border-0">
      <td className="px-4 py-3 font-medium">{linha.uf}</td>
      <td className="px-4 py-3">
        <Input className="w-24" value={pct} onChange={(e) => setPct(e.target.value)} />
        {alterado && <Button className="ml-2 px-2 py-1 text-xs" onClick={() => onSalvar(pct)}>Salvar</Button>}
      </td>
    </tr>
  );
}

// ---------- Utilitários ----------

function TabelaUF({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto p-0">
      <p className="px-4 pt-4 text-xs text-[var(--cor-texto-suave)]">{titulo}</p>
      <table className="w-full text-sm">{children}</table>
    </Card>
  );
}

function Carregando() {
  return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
}
