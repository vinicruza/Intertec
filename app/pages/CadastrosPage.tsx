import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  excluirTransportadora,
  listarTransportadorasCadastro,
  salvarTransportadora,
  type Transportadora,
  excluirMotivo,
  excluirSegmento,
  listarCategoriasProduto,
  listarMotivosCadastro,
  listarSegmentos,
  salvarMotivo,
  salvarPrefixoErp,
  salvarSegmento,
  type ItemSegmento,
  type TabelaSegmento,
} from "../lib/db/cadastros";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";
import AbaNomenclaturaNF from "./AbaNomenclaturaNF";

// ============================================================
// Cadastros — listas de referência do sistema
// ============================================================
//
// Tipo de cliente, área de atuação e motivo de perda nasceram como partida
// sugerida: a Intertech ainda não fechou nenhuma dessas listas. Esta tela
// existe para que a decisão não dependa de mexer no banco.

type Aba = "tipos" | "areas" | "motivos" | "categorias" | "nomenclatura" | "transportadoras";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "tipos", rotulo: "Tipos de cliente" },
  { id: "areas", rotulo: "Áreas de atuação" },
  { id: "motivos", rotulo: "Motivos de perda" },
  { id: "categorias", rotulo: "Categorias de produto" },
  { id: "nomenclatura", rotulo: "Nomenclatura NF" },
  { id: "transportadoras", rotulo: "Transportadoras" },
];

export default function CadastrosPage() {
  const [aba, setAba] = useState<Aba>("tipos");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Cadastros</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Listas que alimentam o resto do sistema. As sugestões iniciais podem ser trocadas à
          vontade — nada aqui está fixo no código.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--cor-borda)]">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`px-3 py-2 text-sm ${
              aba === a.id
                ? "border-b-2 border-[var(--cor-primaria)] font-medium text-[var(--cor-primaria)]"
                : "text-[var(--cor-texto-suave)]"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "tipos" && (
        <AbaSegmento
          tabela="tipo"
          titulo="Tipos de cliente"
          ajuda="Primeiro campo do código do cliente. Ex.: Hospital, Clínica, Veterinário."
        />
      )}
      {aba === "areas" && (
        <AbaSegmento
          tabela="area"
          titulo="Áreas de atuação"
          ajuda="Segundo campo do código do cliente. Ex.: Oftalmologia, Ginecologia, Ortopedia."
        />
      )}
      {aba === "motivos" && <AbaMotivos />}
      {aba === "categorias" && <AbaCategorias />}
      {aba === "nomenclatura" && <AbaNomenclaturaNF />}
      {aba === "transportadoras" && <AbaTransportadoras />}
    </div>
  );
}

// ---------- Tipos de cliente e áreas de atuação ----------

function AbaSegmento({
  tabela,
  titulo,
  ajuda,
}: {
  tabela: TabelaSegmento;
  titulo: string;
  ajuda: string;
}) {
  const queryClient = useQueryClient();
  const chave = ["segmentos", tabela];
  const { data, isLoading } = useQuery({ queryKey: chave, queryFn: () => listarSegmentos(tabela) });
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState({ name: "", code_prefix: "", sort_order: "0" });

  const invalidar = () => {
    setErro(null);
    queryClient.invalidateQueries({ queryKey: chave });
    queryClient.invalidateQueries({ queryKey: ["tiposCliente"] });
    queryClient.invalidateQueries({ queryKey: ["areasCliente"] });
  };
  const aoErrar = (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar.");

  const salvar = useMutation({
    mutationFn: (item: Parameters<typeof salvarSegmento>[1]) => salvarSegmento(tabela, item),
    onSuccess: () => { invalidar(); setNovo({ name: "", code_prefix: "", sort_order: "0" }); },
    onError: aoErrar,
  });
  const excluir = useMutation({
    mutationFn: (id: string) => excluirSegmento(tabela, id),
    onSuccess: invalidar,
    onError: aoErrar,
  });

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--cor-texto-suave)]">{ajuda}</p>
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {(data ?? []).map((item) => (
        <LinhaSegmento
          key={item.id}
          item={item}
          salvando={salvar.isPending}
          aoSalvar={(campos) => salvar.mutate({ id: item.id, code_prefix: item.code_prefix, ...campos })}
          aoExcluir={() => {
            if (window.confirm(`Excluir "${item.name}"? Só é possível se ninguém estiver usando.`)) {
              excluir.mutate(item.id);
            }
          }}
        />
      ))}

      <Card className="space-y-3">
        <h3 className="font-semibold">Adicionar a {titulo.toLowerCase()}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label>Nome</Label>
            <Input value={novo.name} onChange={(e) => setNovo({ ...novo, name: e.target.value })} />
          </div>
          <div>
            <Label>Prefixo (2 dígitos)</Label>
            <Input
              className="w-28"
              value={novo.code_prefix}
              placeholder="ex.: 60"
              onChange={(e) => setNovo({ ...novo, code_prefix: e.target.value })}
            />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input
              className="w-24"
              value={novo.sort_order}
              onChange={(e) => setNovo({ ...novo, sort_order: e.target.value })}
            />
          </div>
          <Button
            disabled={!novo.name.trim() || !/^\d{2}$/.test(novo.code_prefix) || salvar.isPending}
            onClick={() =>
              salvar.mutate({
                id: null,
                name: novo.name,
                code_prefix: novo.code_prefix,
                sort_order: Number(novo.sort_order) || 0,
                active: true,
              })
            }
          >
            Adicionar
          </Button>
        </div>
        <p className="text-xs text-[var(--cor-texto-suave)]">
          O prefixo entra no código dos clientes e <strong>não muda depois de criado</strong>:
          alterá-lo faria o código dos clientes já categorizados mentir sobre o segmento.
        </p>
      </Card>
    </div>
  );
}

function LinhaSegmento({
  item,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  item: ItemSegmento;
  salvando: boolean;
  aoSalvar: (campos: { name: string; sort_order: number; active: boolean }) => void;
  aoExcluir: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [ordem, setOrdem] = useState(String(item.sort_order));
  const [active, setActive] = useState(item.active);
  const mudou = name !== item.name || Number(ordem) !== item.sort_order || active !== item.active;

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="w-20">
        <Label>Prefixo</Label>
        <div className="rounded-md bg-[var(--cor-fundo)] px-2 py-2 font-mono text-sm">{item.code_prefix}</div>
      </div>
      <div className="min-w-56 flex-1">
        <Label>Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Ordem</Label>
        <Input className="w-24" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativo
      </label>
      <Button
        disabled={!mudou || salvando}
        onClick={() => aoSalvar({ name, sort_order: Number(ordem) || 0, active })}
      >
        Salvar
      </Button>
      <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={aoExcluir}>
        Excluir
      </button>
    </Card>
  );
}

// ---------- Motivos de perda ----------

function AbaMotivos() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["motivosCadastro"], queryFn: listarMotivosCadastro });
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState("");

  const invalidar = () => {
    setErro(null);
    queryClient.invalidateQueries({ queryKey: ["motivosCadastro"] });
    queryClient.invalidateQueries({ queryKey: ["motivosPerda"] });
  };
  const aoErrar = (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar.");

  const salvar = useMutation({
    mutationFn: salvarMotivo,
    onSuccess: () => { invalidar(); setNovo(""); },
    onError: aoErrar,
  });
  const excluir = useMutation({ mutationFn: excluirMotivo, onSuccess: invalidar, onError: aoErrar });

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--cor-texto-suave)]">
        Aparecem ao marcar uma cotação como perdida. É o que responde depois “por que a gente não
        vendeu?”.
      </p>
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {(data ?? []).map((m) => (
        <LinhaMotivo
          key={m.id}
          motivo={m}
          salvando={salvar.isPending}
          aoSalvar={(label, sort_order, active) =>
            salvar.mutate({ id: m.id, label, sort_order, active })
          }
          aoExcluir={() => {
            if (window.confirm(`Excluir "${m.label}"? Só é possível se nenhuma cotação usou.`)) {
              excluir.mutate(m.id);
            }
          }}
        />
      ))}

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label>Novo motivo</Label>
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="ex.: Frete inviável" />
        </div>
        <Button
          disabled={!novo.trim() || salvar.isPending}
          onClick={() =>
            salvar.mutate({ id: null, label: novo, sort_order: ((data ?? []).length + 1) * 10, active: true })
          }
        >
          Adicionar
        </Button>
      </Card>
    </div>
  );
}

function LinhaMotivo({
  motivo,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  motivo: { id: string; label: string; sort_order: number; active: boolean };
  salvando: boolean;
  aoSalvar: (label: string, sort_order: number, active: boolean) => void;
  aoExcluir: () => void;
}) {
  const [label, setLabel] = useState(motivo.label);
  const [ordem, setOrdem] = useState(String(motivo.sort_order));
  const [active, setActive] = useState(motivo.active);
  const mudou = label !== motivo.label || Number(ordem) !== motivo.sort_order || active !== motivo.active;

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1">
        <Label>Motivo</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div>
        <Label>Ordem</Label>
        <Input className="w-24" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativo
      </label>
      <Button disabled={!mudou || salvando} onClick={() => aoSalvar(label, Number(ordem) || 0, active)}>
        Salvar
      </Button>
      <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={aoExcluir}>
        Excluir
      </button>
    </Card>
  );
}

// ---------- Categorias de produto ----------

function AbaCategorias() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["categoriasProduto"], queryFn: listarCategoriasProduto });
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (v: { id: string; prefixo: string }) => salvarPrefixoErp(v.id, v.prefixo),
    onSuccess: () => {
      setErro(null);
      queryClient.invalidateQueries({ queryKey: ["categoriasProduto"] });
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--cor-texto-suave)]">
        O prefixo numérico é o começo do código de produto enviado ao sistema de faturamento. Só
        entra em uso quando a geração de código de ERP for ligada em Configurações.
      </p>
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {(data ?? []).map((c) => (
        <LinhaCategoria
          key={c.id}
          categoria={c}
          salvando={salvar.isPending}
          aoSalvar={(prefixo) => salvar.mutate({ id: c.id, prefixo })}
        />
      ))}
    </div>
  );
}

function LinhaCategoria({
  categoria,
  salvando,
  aoSalvar,
}: {
  categoria: { id: string; name: string; prefix: string; erp_prefix: string | null };
  salvando: boolean;
  aoSalvar: (prefixo: string) => void;
}) {
  const [prefixo, setPrefixo] = useState(categoria.erp_prefix ?? "");
  const mudou = prefixo !== (categoria.erp_prefix ?? "");

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <Label>Categoria</Label>
        <div className="py-2 font-medium">
          {categoria.name} <Badge>{categoria.prefix}</Badge>
        </div>
      </div>
      <div>
        <Label>Prefixo no ERP</Label>
        <Input
          className="w-28"
          value={prefixo}
          placeholder="ex.: 1"
          onChange={(e) => setPrefixo(e.target.value)}
        />
      </div>
      <Button disabled={!mudou || salvando} onClick={() => aoSalvar(prefixo)}>
        Salvar
      </Button>
    </Card>
  );
}

// ---------- Transportadoras (formulário de pedido, 05/08/2026) ----------

function AbaTransportadoras() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["transportadorasCadastro"],
    queryFn: listarTransportadorasCadastro,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState("");

  const invalidar = () => {
    setErro(null);
    queryClient.invalidateQueries({ queryKey: ["transportadorasCadastro"] });
    // O simulador carrega a lista junto com o resto do contexto.
    queryClient.invalidateQueries({ queryKey: ["ctxSimulador"] });
  };
  const aoErrar = (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar.");

  const salvar = useMutation({
    mutationFn: salvarTransportadora,
    onSuccess: () => { invalidar(); setNovo(""); },
    onError: aoErrar,
  });
  const excluir = useMutation({ mutationFn: excluirTransportadora, onSuccess: invalidar, onError: aoErrar });

  if (isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--cor-texto-suave)]">
        Aparecem no bloco de expedição do pedido e saem impressas na ficha. A lista começou igual
        à do formulário de papel — troque à vontade conforme mudar de transportadora.
      </p>
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {(data ?? []).map((t) => (
        <LinhaTransportadora
          key={t.id}
          item={t}
          salvando={salvar.isPending}
          aoSalvar={(name, sort_order, active) => salvar.mutate({ id: t.id, name, sort_order, active })}
          aoExcluir={() => {
            if (window.confirm(`Excluir "${t.name}"? Só é possível se nenhum pedido usou.`)) {
              excluir.mutate(t.id);
            }
          }}
        />
      ))}

      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Label>Nova transportadora</Label>
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="ex.: Azul Cargo" />
        </div>
        <Button
          disabled={!novo.trim() || salvar.isPending}
          onClick={() =>
            salvar.mutate({ id: null, name: novo, sort_order: ((data ?? []).length + 1) * 10, active: true })
          }
        >
          Adicionar
        </Button>
      </Card>
    </div>
  );
}

function LinhaTransportadora({
  item,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  item: Transportadora;
  salvando: boolean;
  aoSalvar: (name: string, sort_order: number, active: boolean) => void;
  aoExcluir: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [ordem, setOrdem] = useState(String(item.sort_order));
  const [active, setActive] = useState(item.active);
  const mudou = name !== item.name || Number(ordem) !== item.sort_order || active !== item.active;

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="min-w-64 flex-1">
        <Label>Transportadora</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
        {/* A linha "Outra" não é uma transportadora: é o pedido para escrever
            qual, quando quem leva a caixa não está na lista. */}
        {item.requires_name && (
          <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
            Ao escolher esta opção no pedido, o sistema pede o nome da transportadora.
          </p>
        )}
      </div>
      <div>
        <Label>Ordem</Label>
        <Input className="w-24" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativa
      </label>
      <Button disabled={!mudou || salvando} onClick={() => aoSalvar(name, Number(ordem) || 0, active)}>
        Salvar
      </Button>
      <button type="button" className="pb-2 text-xs text-red-600 hover:underline" onClick={aoExcluir}>
        Excluir
      </button>
    </Card>
  );
}
