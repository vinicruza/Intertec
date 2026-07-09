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
  type CanalLinha,
  type DifalLinha,
  type IcsmLinha,
  type PortalLinha,
  type RegraMargemLinha,
} from "../lib/db/configuracoes";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

type Aba = "canais" | "margem" | "icsm" | "difal" | "portal";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "canais", rotulo: "Canais" },
  { id: "margem", rotulo: "Faixas de margem" },
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
