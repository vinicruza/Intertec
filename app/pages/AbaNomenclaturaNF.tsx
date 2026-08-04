import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { previaDaNomenclatura, type PreviaNF } from "../../lib/nomenclatura/previa";
import {
  aplicarDescricoesNF,
  excluirFamiliaNF,
  familiasAtivas,
  listarFamiliasNF,
  salvarFamiliaNF,
  type FamiliaNFCadastro,
} from "../lib/db/nomenclaturaNF";
import { listarProdutos } from "../lib/db/produtos";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

// ============================================================
// Cadastros → Nomenclatura NF
// ============================================================
//
// A regra que traduz o nome do catálogo para o nome que sai na nota fiscal.
// Até 04/08/2026 ela morava no código: trocar o nome fiscal de uma família
// exigia publicar uma versão nova. Aqui o Administrador edita direto.
//
// O cuidado central desta tela: mudar UMA linha reescreve dezenas de produtos.
// Por isso nada é aplicado ao salvar a família — salvar guarda a regra, e
// aplicar ao catálogo é um segundo passo, sempre precedido da prévia.

type FamiliaEditavel = {
  id: string | null;
  comeco: string;
  nomeNF: string;
  apagarGramatura: boolean;
  apagarTNT: boolean;
  apagarSMS: boolean;
  apagarOrigem: boolean;
  trocas: Array<{ de: string; para: string }>;
  ordem: number;
  ativa: boolean;
};

const NOVA: FamiliaEditavel = {
  id: null, comeco: "", nomeNF: "",
  apagarGramatura: false, apagarTNT: false, apagarSMS: false, apagarOrigem: false,
  trocas: [], ordem: 0, ativa: true,
};

function paraEditavel(f: FamiliaNFCadastro): FamiliaEditavel {
  const { id, comeco, nomeNF, apagarGramatura, apagarTNT, apagarSMS, apagarOrigem, trocas, ordem, ativa } = f;
  return { id, comeco, nomeNF, apagarGramatura, apagarTNT, apagarSMS, apagarOrigem, trocas, ordem, ativa };
}

export default function AbaNomenclaturaNF() {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nova, setNova] = useState<FamiliaEditavel>(NOVA);

  const familiasQuery = useQuery({ queryKey: ["familiasNF"], queryFn: listarFamiliasNF });
  const produtosQuery = useQuery({ queryKey: ["produtos"], queryFn: listarProdutos });

  const invalidar = () => {
    setErro(null);
    queryClient.invalidateQueries({ queryKey: ["familiasNF"] });
  };
  const aoErrar = (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar.");

  const salvar = useMutation({
    mutationFn: salvarFamiliaNF,
    onSuccess: () => { invalidar(); setAviso(null); },
    onError: aoErrar,
  });
  const excluir = useMutation({ mutationFn: excluirFamiliaNF, onSuccess: invalidar, onError: aoErrar });

  // A prévia compara o que está gravado com o que as famílias de HOJE
  // produziriam. Ela reage a cada salvar, sem precisar de botão "calcular".
  const previa: PreviaNF | null = useMemo(() => {
    const familias = familiasQuery.data;
    const produtos = produtosQuery.data;
    if (!familias || !produtos) return null;
    return previaDaNomenclatura(
      produtos.map((p) => ({
        id: p.id, nome: p.name,
        descricaoAtual: p.nf_description,
        origem: p.nf_description_source,
      })),
      familiasAtivas(familias)
    );
  }, [familiasQuery.data, produtosQuery.data]);

  const aplicar = useMutation({
    mutationFn: async () => {
      if (!previa) return 0;
      return aplicarDescricoesNF(previa.mudam.map((m) => ({ id: m.id, descricao: m.para })));
    },
    onSuccess: (n) => {
      setErro(null);
      setAviso(`${n} produto(s) atualizado(s).`);
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: aoErrar,
  });

  if (familiasQuery.isLoading || produtosQuery.isLoading) {
    return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--cor-texto-suave)]">
        O nome que sai na nota fiscal, por família de produto. O nome do catálogo não muda — é
        ele que sustenta CMV, ficha técnica e histórico. As famílias são testadas de cima para
        baixo, e a primeira que casar com o começo do nome vence: por isso a genérica
        (&quot;Campo&quot;, &quot;Avental&quot;) precisa ficar embaixo das específicas. Produto que
        não casa com nenhuma sai na nota com o próprio nome do catálogo.
      </p>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {aviso && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}

      {previa && <PainelPrevia previa={previa} aplicando={aplicar.isPending} aoAplicar={() => aplicar.mutate()} />}

      {(familiasQuery.data ?? []).map((f) => (
        <LinhaFamilia
          key={f.id}
          inicial={paraEditavel(f)}
          salvando={salvar.isPending}
          aoSalvar={(v) => salvar.mutate(v)}
          aoExcluir={() => {
            if (window.confirm(
              `Excluir a família "${f.comeco}"? Os produtos dela passam a cair na próxima família que casar — ou a sair com o nome do catálogo.`
            )) excluir.mutate(f.id);
          }}
        />
      ))}

      <Card className="space-y-3 border-dashed">
        <h3 className="text-sm font-semibold">Nova família</h3>
        <CamposFamilia valor={nova} aoMudar={setNova} />
        <Button
          disabled={!nova.comeco.trim() || !nova.nomeNF.trim() || salvar.isPending}
          onClick={() => salvar.mutate(nova, { onSuccess: () => setNova(NOVA) })}
        >
          Adicionar
        </Button>
      </Card>
    </div>
  );
}

function PainelPrevia({
  previa,
  aplicando,
  aoAplicar,
}: {
  previa: PreviaNF;
  aplicando: boolean;
  aoAplicar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const nada = previa.mudam.length === 0;

  return (
    <Card className={`space-y-3 ${nada ? "" : "border-amber-300 bg-amber-50/50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            {nada
              ? "O catálogo já está de acordo com estas regras"
              : `${previa.mudam.length} produto(s) mudariam de nome na nota`}
          </h3>
          <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
            {previa.total} produtos no catálogo · {previa.inalterados} já corretos ·{" "}
            {previa.protegidos} ajustados à mão (a regra não encosta neles)
          </p>
        </div>
        <div className="flex gap-2">
          {!nada && (
            <Button
              className="bg-transparent text-[var(--cor-primaria)] hover:bg-[var(--cor-fundo)]"
              onClick={() => setAberto((v) => !v)}
            >
              {aberto ? "Esconder" : "Ver o que mudaria"}
            </Button>
          )}
          <Button disabled={nada || aplicando} onClick={aoAplicar}>
            {aplicando ? "Aplicando…" : "Aplicar ao catálogo"}
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="max-h-80 overflow-y-auto rounded-md border border-[var(--cor-borda)] bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-[var(--cor-texto-suave)]">
              <tr className="border-b border-[var(--cor-borda)]">
                <th className="px-3 py-2 font-medium">Produto</th>
                <th className="px-3 py-2 font-medium">NF hoje</th>
                <th className="px-3 py-2 font-medium">NF depois</th>
              </tr>
            </thead>
            <tbody>
              {previa.mudam.map((m) => (
                <tr key={m.id} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="px-3 py-2">{m.nome}</td>
                  <td className="px-3 py-2 text-[var(--cor-texto-suave)]">{m.de ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{m.para ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function LinhaFamilia({
  inicial,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  inicial: FamiliaEditavel;
  salvando: boolean;
  aoSalvar: (v: FamiliaEditavel) => void;
  aoExcluir: () => void;
}) {
  const [valor, setValor] = useState(inicial);
  const mudou = JSON.stringify(valor) !== JSON.stringify(inicial);

  return (
    <Card className="space-y-3">
      <CamposFamilia valor={valor} aoMudar={setValor} />
      <div className="flex items-center gap-3">
        <Button disabled={!mudou || salvando} onClick={() => aoSalvar(valor)}>Salvar</Button>
        <button type="button" className="text-xs text-red-600 hover:underline" onClick={aoExcluir}>
          Excluir
        </button>
        {mudou && (
          <span className="text-xs text-[var(--cor-texto-suave)]">
            Salvar só guarda a regra — o catálogo só muda ao aplicar, lá em cima.
          </span>
        )}
      </div>
    </Card>
  );
}

function CamposFamilia({
  valor,
  aoMudar,
}: {
  valor: FamiliaEditavel;
  aoMudar: (v: FamiliaEditavel) => void;
}) {
  const set = <K extends keyof FamiliaEditavel>(k: K, v: FamiliaEditavel[K]) =>
    aoMudar({ ...valor, [k]: v });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_5rem]">
        <div>
          <Label>Começa com (no catálogo)</Label>
          <Input value={valor.comeco} placeholder="ex.: Campo de Mesa"
            onChange={(e) => set("comeco", e.target.value)} />
        </div>
        <div>
          <Label>Nome na nota fiscal</Label>
          <Input value={valor.nomeNF} placeholder="ex.: Campo Cirúrgico com Reforço"
            onChange={(e) => set("nomeNF", e.target.value)} />
        </div>
        <div>
          <Label>Ordem</Label>
          <Input value={String(valor.ordem)} inputMode="numeric"
            onChange={(e) => set("ordem", Number(e.target.value.replace(/\D/g, "")) || 0)} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-[var(--cor-texto-suave)]">Apagar do nome:</span>
        <Caixa rotulo="Gramatura" dica="GR30, GR 40, 30g, 40g"
          valor={valor.apagarGramatura} aoMudar={(v) => set("apagarGramatura", v)} />
        <Caixa rotulo="TNT" valor={valor.apagarTNT} aoMudar={(v) => set("apagarTNT", v)} />
        <Caixa rotulo="SMS" valor={valor.apagarSMS} aoMudar={(v) => set("apagarSMS", v)} />
        <Caixa rotulo="Origem" dica="China" valor={valor.apagarOrigem} aoMudar={(v) => set("apagarOrigem", v)} />
        <span className="ml-auto">
          <Caixa rotulo="Ativa" valor={valor.ativa} aoMudar={(v) => set("ativa", v)} />
        </span>
      </div>

      <div className="space-y-2">
        <Label>Trocas de palavra</Label>
        {valor.trocas.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <Input className="w-40" value={t.de} placeholder="Tag"
              onChange={(e) => set("trocas", valor.trocas.map((x, j) => j === i ? { ...x, de: e.target.value } : x))} />
            <span className="text-[var(--cor-texto-suave)]">vira</span>
            <Input className="w-40" value={t.para} placeholder="Toalha"
              onChange={(e) => set("trocas", valor.trocas.map((x, j) => j === i ? { ...x, para: e.target.value } : x))} />
            <button type="button" className="text-xs text-red-600 hover:underline"
              onClick={() => set("trocas", valor.trocas.filter((_, j) => j !== i))}>
              remover
            </button>
          </div>
        ))}
        <button type="button" className="text-xs text-[var(--cor-primaria)] hover:underline"
          onClick={() => set("trocas", [...valor.trocas, { de: "", para: "" }])}>
          + adicionar troca
        </button>
        <p className="text-xs text-[var(--cor-texto-suave)]">
          Deixe o segundo campo vazio para apagar a palavra em vez de trocá-la.
        </p>
      </div>

      {!valor.ativa && (
        <p className="text-xs text-amber-700">
          Família desativada: os produtos dela passam a cair na próxima família que casar — ou a
          sair na nota com o próprio nome do catálogo.
        </p>
      )}
    </div>
  );
}

function Caixa({
  rotulo,
  dica,
  valor,
  aoMudar,
}: {
  rotulo: string;
  dica?: string;
  valor: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={valor} onChange={(e) => aoMudar(e.target.checked)} />
      {rotulo}
      {dica && <Badge>{dica}</Badge>}
    </label>
  );
}
