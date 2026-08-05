import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  obterCliente,
  salvarCliente,
  type DadosCliente,
} from "../lib/db/clientes";
import {
  cepValido,
  cnpjCpfValido,
  emailPlausivel,
  formatarCep,
  formatarCnpjCpf,
  formatarTelefone,
  somenteDigitos,
  telefoneValido,
} from "../../lib/cadastro/documentos";
import { Button, Card, Input, Label } from "@components/ui/primitives";

// ============================================================
// Cadastro do cliente (formulário de pedido — 05/08/2026)
// ============================================================
//
// Tela nova. Até aqui só existia a categorização: os 13 mil clientes vieram da
// planilha com nome e UF, e não havia onde digitar CNPJ, CEP ou telefone. Sem
// esta tela, o cabeçalho da ficha impressa continuaria saindo em branco para
// alguém preencher à mão — que é exatamente o trabalho que o sistema existe
// para eliminar.
//
// Os campos guardam SÓ DÍGITOS no banco. A máscara é aplicada quando o campo
// perde o foco, para não brigar com quem está digitando.

const UFS = [
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB",
  "PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
];

type Campos = {
  name: string;
  uf: string;
  tax_id: string;
  billing_zip: string;
  shipping_zip: string;
  contact_name: string;
  phone: string;
  email: string;
  notes: string;
};

const VAZIO: Campos = {
  name: "", uf: "", tax_id: "", billing_zip: "", shipping_zip: "",
  contact_name: "", phone: "", email: "", notes: "",
};

export default function ClienteFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const novo = !id || id === "novo";

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["cliente", id],
    queryFn: () => obterCliente(id!),
    enabled: !novo,
  });

  const [c, setC] = useState<Campos>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!cliente) return;
    setC({
      name: cliente.name,
      uf: cliente.uf ?? "",
      tax_id: formatarCnpjCpf(cliente.tax_id),
      billing_zip: formatarCep(cliente.billing_zip),
      shipping_zip: formatarCep(cliente.shipping_zip),
      contact_name: cliente.contact_name ?? "",
      phone: formatarTelefone(cliente.phone),
      email: cliente.email ?? "",
      notes: cliente.notes ?? "",
    });
  }, [cliente]);

  const mudar = (campo: keyof Campos) => (valor: string) => {
    setC((a) => ({ ...a, [campo]: valor }));
    setErro(null);
  };

  // Validação campo a campo. Vazio nunca é erro: os 13 mil cadastros herdados
  // estão vazios e continuam válidos — o cliente vai completando conforme
  // vende. O que não se aceita é o campo PREENCHIDO ERRADO.
  const erros = {
    nome: c.name.trim() === "" ? "Informe o nome do cliente." : null,
    documento:
      c.tax_id.trim() !== "" && !cnpjCpfValido(c.tax_id)
        ? "CNPJ/CPF inválido — confira os dígitos."
        : null,
    cepFat:
      c.billing_zip.trim() !== "" && !cepValido(c.billing_zip)
        ? "CEP precisa ter 8 dígitos."
        : null,
    cepEnt:
      c.shipping_zip.trim() !== "" && !cepValido(c.shipping_zip)
        ? "CEP precisa ter 8 dígitos."
        : null,
    telefone:
      c.phone.trim() !== "" && !telefoneValido(c.phone)
        ? "Telefone precisa ter DDD + 8 ou 9 dígitos."
        : null,
    email:
      c.email.trim() !== "" && !emailPlausivel(c.email)
        ? "E-mail parece incompleto."
        : null,
  };
  const podeSalvar = !Object.values(erros).some(Boolean);

  const gravar = useMutation({
    mutationFn: () => {
      const d: DadosCliente = {
        name: c.name,
        uf: c.uf || null,
        tax_id: c.tax_id || null,
        billing_zip: c.billing_zip || null,
        shipping_zip: c.shipping_zip || null,
        contact_name: c.contact_name || null,
        phone: c.phone || null,
        email: c.email || null,
        notes: c.notes || null,
      };
      return salvarCliente(novo ? null : id!, d);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["cliente", id] });
      queryClient.invalidateQueries({ queryKey: ["pendenciaClientes"] });
      queryClient.invalidateQueries({ queryKey: ["ctxSimulador"] });
      navigate("/clientes");
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar."),
  });

  if (!novo && isLoading) return <p className="text-[var(--cor-texto-suave)]">Carregando…</p>;
  if (!novo && !cliente) return <p className="text-red-600">Cliente não encontrado.</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {novo ? "Novo cliente" : cliente?.name}
          </h1>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            É daqui que sai o cabeçalho da ficha do pedido. Campo em branco não impede de
            salvar — vá completando conforme for vendendo.
          </p>
        </div>
        {cliente?.code && (
          <span className="rounded-full bg-[var(--cor-primaria-clara)] px-3 py-1 font-mono text-sm font-semibold text-[var(--cor-primaria)]">
            {cliente.code}
          </span>
        )}
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <Card className="space-y-4">
        <h2 className="font-semibold">Identificação</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <Label htmlFor="nome">Empresa / nome</Label>
            <Input id="nome" value={c.name} onChange={(e) => mudar("name")(e.target.value)} />
            {erros.nome && <p className="mt-1 text-xs text-red-600">{erros.nome}</p>}
          </div>
          <div>
            <Label htmlFor="uf">UF</Label>
            <select
              id="uf"
              className="w-full min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
              value={c.uf}
              onChange={(e) => mudar("uf")(e.target.value)}
            >
              <option value="">—</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="doc">CNPJ / CPF</Label>
            <Input
              id="doc"
              value={c.tax_id}
              placeholder="00.000.000/0000-00"
              onChange={(e) => mudar("tax_id")(e.target.value)}
              onBlur={() => mudar("tax_id")(formatarCnpjCpf(c.tax_id))}
            />
            {erros.documento && <p className="mt-1 text-xs text-red-600">{erros.documento}</p>}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Endereços</h2>
          {/* Os dois CEPs são separados porque na prática são lugares
              diferentes: a nota vai para a matriz e a caixa vai para o
              almoxarifado. */}
          <p className="text-sm text-[var(--cor-texto-suave)]">
            Faturamento e entrega costumam ser endereços diferentes — a nota vai para um, a
            caixa vai para o outro.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="cepfat">CEP de faturamento</Label>
            <Input
              id="cepfat"
              value={c.billing_zip}
              placeholder="00000-000"
              onChange={(e) => mudar("billing_zip")(e.target.value)}
              onBlur={() => mudar("billing_zip")(formatarCep(c.billing_zip))}
            />
            {erros.cepFat && <p className="mt-1 text-xs text-red-600">{erros.cepFat}</p>}
          </div>
          <div>
            <Label htmlFor="cepent">CEP de entrega</Label>
            <Input
              id="cepent"
              value={c.shipping_zip}
              placeholder="00000-000"
              onChange={(e) => mudar("shipping_zip")(e.target.value)}
              onBlur={() => mudar("shipping_zip")(formatarCep(c.shipping_zip))}
            />
            {erros.cepEnt && <p className="mt-1 text-xs text-red-600">{erros.cepEnt}</p>}
            {somenteDigitos(c.billing_zip) !== "" &&
              somenteDigitos(c.shipping_zip) === "" && (
                <button
                  type="button"
                  className="mt-1 text-xs text-[var(--cor-primaria)] hover:underline"
                  onClick={() => mudar("shipping_zip")(c.billing_zip)}
                >
                  Usar o mesmo do faturamento
                </button>
              )}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Contato</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="contato">Contato</Label>
            <Input
              id="contato"
              value={c.contact_name}
              onChange={(e) => mudar("contact_name")(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="tel">Telefone</Label>
            <Input
              id="tel"
              value={c.phone}
              placeholder="(00) 00000-0000"
              onChange={(e) => mudar("phone")(e.target.value)}
              onBlur={() => mudar("phone")(formatarTelefone(c.phone))}
            />
            {erros.telefone && <p className="mt-1 text-xs text-red-600">{erros.telefone}</p>}
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              value={c.email}
              onChange={(e) => mudar("email")(e.target.value)}
            />
            {erros.email && <p className="mt-1 text-xs text-red-600">{erros.email}</p>}
          </div>
        </div>
        <div>
          <Label htmlFor="obs">Observação</Label>
          <textarea
            id="obs"
            className="w-full rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
            rows={2}
            value={c.notes}
            onChange={(e) => mudar("notes")(e.target.value)}
          />
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button disabled={!podeSalvar || gravar.isPending} onClick={() => gravar.mutate()}>
          {gravar.isPending ? "Salvando…" : "Salvar"}
        </Button>
        <button
          type="button"
          className="text-sm text-[var(--cor-texto-suave)] hover:underline"
          onClick={() => navigate("/clientes")}
        >
          Cancelar
        </button>
      </div>

      {!novo && (
        <p className="text-xs text-[var(--cor-texto-suave)]">
          Tipo de cliente e área de atuação continuam sendo definidos na lista de Clientes —
          é de lá que sai o código.
        </p>
      )}
    </div>
  );
}
