import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  atualizarInsumo,
  criarInsumo,
  derivarPrecos,
  listarHistorico,
  obterInsumo,
  type InsumoFormulario,
} from "../lib/db/insumos";
import { recalcularCMVsVigentes } from "../lib/db/recompute";
import { reais, dataCurta } from "../lib/format";
import { toMoney } from "@calc";
import { Button, Card, Input, Label } from "@components/ui/primitives";

const esquema = z.object({
  name: z.string().min(1, "Informe o nome."),
  category: z.string(),
  purchase_unit: z.string(),
  purchase_price: z.string().min(1, "Informe o preço de compra."),
  conversion_factor: z.string(),
  consumption_unit: z.string(),
  icms_rate: z.string(),
  pis_cofins_rate: z.string(),
});

const VAZIO: InsumoFormulario = {
  name: "", category: "", purchase_unit: "", purchase_price: "",
  conversion_factor: "1", consumption_unit: "", icms_rate: "0", pis_cofins_rate: "0.0925",
};

export default function InsumoFormPage() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState } = useForm<InsumoFormulario>({
    resolver: zodResolver(esquema),
    defaultValues: VAZIO,
  });

  const insumoQuery = useQuery({
    queryKey: ["insumo", id],
    queryFn: () => obterInsumo(id!),
    enabled: editando,
  });
  const historicoQuery = useQuery({
    queryKey: ["historico", id],
    queryFn: () => listarHistorico(id!),
    enabled: editando,
  });

  useEffect(() => {
    const i = insumoQuery.data;
    if (i) {
      reset({
        name: i.name, category: i.category ?? "", purchase_unit: i.purchase_unit ?? "",
        purchase_price: i.purchase_price ?? "", conversion_factor: i.conversion_factor ?? "1",
        consumption_unit: i.consumption_unit ?? "", icms_rate: i.icms_rate ?? "0",
        pis_cofins_rate: i.pis_cofins_rate ?? "0",
      });
    }
  }, [insumoQuery.data, reset]);

  // Prévia ao vivo do preço com/sem imposto (cálculo no motor, não na tela).
  const valores = watch();
  let previaCom = "—";
  let previaSem = "—";
  try {
    const p = derivarPrecos(valores);
    previaCom = "R$ " + toMoney(p.comImposto).replace(".", ",");
    previaSem = "R$ " + toMoney(p.semImposto).replace(".", ",");
  } catch {
    /* valores incompletos: mantém "—" */
  }

  const salvar = useMutation({
    mutationFn: async (form: InsumoFormulario) => {
      if (editando) await atualizarInsumo(id!, form);
      else await criarInsumo(form);
      // Recálculo em cascata dos CMVs vigentes (PRD §6.1).
      await recalcularCMVsVigentes();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insumos"] });
      navigate("/insumos");
    },
    onError: (e: unknown) => setErroSalvar(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">{editando ? "Editar insumo" : "Novo insumo"}</h1>

      <Card>
        <form onSubmit={handleSubmit((f) => salvar.mutate(f))} className="space-y-4" noValidate>
          <Campo label="Nome" erro={formState.errors.name?.message}>
            <Input {...register("name")} />
          </Campo>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Categoria"><Input {...register("category")} /></Campo>
            <Campo label="Fornecedor (unidade de compra)"><Input placeholder="ex.: kg" {...register("purchase_unit")} /></Campo>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Campo label="Preço de compra" erro={formState.errors.purchase_price?.message}>
              <Input placeholder="ex.: 21,80" {...register("purchase_price")} />
            </Campo>
            <Campo label="Fator de conversão"><Input placeholder="ex.: 0,04" {...register("conversion_factor")} /></Campo>
            <Campo label="Unidade de consumo"><Input placeholder="ex.: m²" {...register("consumption_unit")} /></Campo>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="ICMS (fração, ex.: 0,18)"><Input {...register("icms_rate")} /></Campo>
            <Campo label="PIS/COFINS (fração, ex.: 0,0925)"><Input {...register("pis_cofins_rate")} /></Campo>
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-md bg-[var(--cor-fundo)] p-3 text-sm">
            <div>
              <div className="text-[var(--cor-texto-suave)]">Preço com imposto (calculado)</div>
              <div className="text-lg font-semibold">{previaCom}</div>
            </div>
            <div>
              <div className="text-[var(--cor-texto-suave)]">Preço sem imposto (calculado)</div>
              <div className="text-lg font-semibold">{previaSem}</div>
            </div>
          </div>

          {erroSalvar && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erroSalvar}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" className="bg-transparent text-[var(--cor-texto-suave)] hover:bg-[var(--cor-fundo)]" onClick={() => navigate("/insumos")}>
              Cancelar
            </Button>
          </div>
        </form>
      </Card>

      {editando && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Histórico de custos</h2>
          {historicoQuery.data && historicoQuery.data.length === 0 && (
            <p className="text-sm text-[var(--cor-texto-suave)]">Sem alterações de preço registradas ainda.</p>
          )}
          {historicoQuery.data && historicoQuery.data.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                  <th className="py-2 font-medium">Quando</th>
                  <th className="py-2 font-medium">Preço s/ imposto (antes → depois)</th>
                </tr>
              </thead>
              <tbody>
                {historicoQuery.data.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--cor-borda)] last:border-0">
                    <td className="py-2 text-[var(--cor-texto-suave)]">{dataCurta(h.changed_at)}</td>
                    <td className="py-2">{reais(h.old_price_without_tax)} → {reais(h.new_price_without_tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

function Campo({ label, erro, children }: { label: string; erro?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
