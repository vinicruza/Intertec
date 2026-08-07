import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  categorizarCliente,
  listarAreasCliente,
  listarTiposCliente,
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

type EnderecoApi = {
  cep?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
};

type CnpjApi = {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  ddd_telefone_1?: string;
  email?: string;
};

async function buscarCnpjBrasilApi(cnpj: string): Promise<CnpjApi> {
  const d = somenteDigitos(cnpj);
  if (d.length !== 14 || !cnpjCpfValido(d)) throw new Error("Informe um CNPJ válido antes de buscar.");
  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`);
  if (!resposta.ok) throw new Error("Não consegui consultar esse CNPJ agora.");
  return (await resposta.json()) as CnpjApi;
}

async function buscarCepBrasilApi(cep: string): Promise<EnderecoApi> {
  const d = somenteDigitos(cep);
  if (d.length !== 8) throw new Error("Informe um CEP com 8 dígitos antes de buscar.");
  const resposta = await fetch(`https://brasilapi.com.br/api/cep/v2/${d}`);
  if (!resposta.ok) throw new Error("Não consegui consultar esse CEP agora.");
  return (await resposta.json()) as EnderecoApi;
}

type Campos = {
  name: string;
  uf: string;
  tax_id: string;
  billing_zip: string;
  billing_street: string;
  billing_number: string;
  billing_complement: string;
  billing_district: string;
  billing_city: string;
  billing_state: string;
  shipping_zip: string;
  shipping_street: string;
  shipping_number: string;
  shipping_complement: string;
  shipping_district: string;
  shipping_city: string;
  shipping_state: string;
  contact_name: string;
  phone: string;
  email: string;
  customer_type_id: string;
  customer_specialty_id: string;
  commercial_contact_name: string;
  commercial_phone: string;
  commercial_email: string;
  financial_contact_name: string;
  financial_phone: string;
  financial_email: string;
  notes: string;
};

const VAZIO: Campos = {
  name: "", uf: "", tax_id: "",
  billing_zip: "", billing_street: "", billing_number: "", billing_complement: "",
  billing_district: "", billing_city: "", billing_state: "",
  shipping_zip: "", shipping_street: "", shipping_number: "", shipping_complement: "",
  shipping_district: "", shipping_city: "", shipping_state: "",
  contact_name: "", phone: "", email: "",
  customer_type_id: "", customer_specialty_id: "",
  commercial_contact_name: "", commercial_phone: "", commercial_email: "",
  financial_contact_name: "", financial_phone: "", financial_email: "",
  notes: "",
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
  const tiposQuery = useQuery({ queryKey: ["tiposCliente"], queryFn: listarTiposCliente });
  const areasQuery = useQuery({ queryKey: ["areasCliente"], queryFn: listarAreasCliente });

  const [c, setC] = useState<Campos>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState<"billing" | "shipping" | null>(null);

  useEffect(() => {
    if (!cliente) return;
    setC({
      name: cliente.name,
      uf: cliente.uf ?? "",
      tax_id: formatarCnpjCpf(cliente.tax_id),
      billing_zip: formatarCep(cliente.billing_zip),
      billing_street: cliente.billing_street ?? "",
      billing_number: cliente.billing_number ?? "",
      billing_complement: cliente.billing_complement ?? "",
      billing_district: cliente.billing_district ?? "",
      billing_city: cliente.billing_city ?? "",
      billing_state: cliente.billing_state ?? cliente.uf ?? "",
      shipping_zip: formatarCep(cliente.shipping_zip),
      shipping_street: cliente.shipping_street ?? "",
      shipping_number: cliente.shipping_number ?? "",
      shipping_complement: cliente.shipping_complement ?? "",
      shipping_district: cliente.shipping_district ?? "",
      shipping_city: cliente.shipping_city ?? "",
      shipping_state: cliente.shipping_state ?? "",
      contact_name: cliente.contact_name ?? "",
      phone: formatarTelefone(cliente.phone),
      email: cliente.email ?? "",
      customer_type_id: cliente.customer_type_id ?? "",
      customer_specialty_id: cliente.customer_specialty_id ?? "",
      commercial_contact_name: cliente.commercial_contact_name ?? cliente.contact_name ?? "",
      commercial_phone: formatarTelefone(cliente.commercial_phone ?? cliente.phone),
      commercial_email: cliente.commercial_email ?? cliente.email ?? "",
      financial_contact_name: cliente.financial_contact_name ?? "",
      financial_phone: formatarTelefone(cliente.financial_phone),
      financial_email: cliente.financial_email ?? "",
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
    telefoneComercial:
      c.commercial_phone.trim() !== "" && !telefoneValido(c.commercial_phone)
        ? "Telefone precisa ter DDD + 8 ou 9 dígitos."
        : null,
    telefoneFinanceiro:
      c.financial_phone.trim() !== "" && !telefoneValido(c.financial_phone)
        ? "Telefone precisa ter DDD + 8 ou 9 dígitos."
        : null,
    email:
      c.email.trim() !== "" && !emailPlausivel(c.email)
        ? "E-mail parece incompleto."
        : null,
    emailComercial:
      c.commercial_email.trim() !== "" && !emailPlausivel(c.commercial_email)
        ? "E-mail parece incompleto."
        : null,
    emailFinanceiro:
      c.financial_email.trim() !== "" && !emailPlausivel(c.financial_email)
        ? "E-mail parece incompleto."
        : null,
  };
  const podeSalvar = !Object.values(erros).some(Boolean);

  async function consultarCnpj() {
    setBuscandoCnpj(true);
    setErro(null);
    try {
      const dados = await buscarCnpjBrasilApi(c.tax_id);
      setC((a) => ({
        ...a,
        tax_id: formatarCnpjCpf(dados.cnpj ?? a.tax_id),
        name: dados.razao_social || a.name,
        uf: dados.uf || a.uf,
        billing_zip: formatarCep(dados.cep ?? a.billing_zip),
        billing_street: dados.logradouro ?? a.billing_street,
        billing_number: dados.numero ?? a.billing_number,
        billing_complement: dados.complemento ?? a.billing_complement,
        billing_district: dados.bairro ?? a.billing_district,
        billing_city: dados.municipio ?? a.billing_city,
        billing_state: dados.uf ?? a.billing_state,
        phone: formatarTelefone(dados.ddd_telefone_1 ?? a.phone),
        email: dados.email ?? a.email,
        commercial_phone: a.commercial_phone || formatarTelefone(dados.ddd_telefone_1),
        commercial_email: a.commercial_email || (dados.email ?? ""),
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui consultar esse CNPJ agora.");
    } finally {
      setBuscandoCnpj(false);
    }
  }

  async function consultarCep(tipo: "billing" | "shipping") {
    setBuscandoCep(tipo);
    setErro(null);
    try {
      const prefixo = tipo === "billing" ? "billing" : "shipping";
      const cep = tipo === "billing" ? c.billing_zip : c.shipping_zip;
      const dados = await buscarCepBrasilApi(cep);
      setC((a) => ({
        ...a,
        [`${prefixo}_zip`]: formatarCep(dados.cep ?? cep),
        [`${prefixo}_street`]: dados.street ?? a[`${prefixo}_street` as keyof Campos],
        [`${prefixo}_district`]: dados.neighborhood ?? a[`${prefixo}_district` as keyof Campos],
        [`${prefixo}_city`]: dados.city ?? a[`${prefixo}_city` as keyof Campos],
        [`${prefixo}_state`]: dados.state ?? a[`${prefixo}_state` as keyof Campos],
        uf: tipo === "billing" && dados.state ? dados.state : a.uf,
      }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui consultar esse CEP agora.");
    } finally {
      setBuscandoCep(null);
    }
  }

  const gravar = useMutation({
    mutationFn: async () => {
      const d: DadosCliente = {
        name: c.name,
        uf: c.uf || null,
        tax_id: c.tax_id || null,
        billing_zip: c.billing_zip || null,
        billing_street: c.billing_street || null,
        billing_number: c.billing_number || null,
        billing_complement: c.billing_complement || null,
        billing_district: c.billing_district || null,
        billing_city: c.billing_city || null,
        billing_state: c.billing_state || null,
        shipping_zip: c.shipping_zip || null,
        shipping_street: c.shipping_street || null,
        shipping_number: c.shipping_number || null,
        shipping_complement: c.shipping_complement || null,
        shipping_district: c.shipping_district || null,
        shipping_city: c.shipping_city || null,
        shipping_state: c.shipping_state || null,
        contact_name: c.commercial_contact_name || c.contact_name || null,
        phone: c.commercial_phone || c.phone || null,
        email: c.commercial_email || c.email || null,
        commercial_contact_name: c.commercial_contact_name || null,
        commercial_phone: c.commercial_phone || null,
        commercial_email: c.commercial_email || null,
        financial_contact_name: c.financial_contact_name || null,
        financial_phone: c.financial_phone || null,
        financial_email: c.financial_email || null,
        notes: c.notes || null,
      };
      const clienteId = await salvarCliente(novo ? null : id!, d);
      await categorizarCliente(
        clienteId,
        c.customer_type_id || null,
        c.customer_specialty_id || null
      );
      return clienteId;
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
            <div className="flex gap-2">
              <Input
                id="doc"
                value={c.tax_id}
                placeholder="00.000.000/0000-00"
                onChange={(e) => mudar("tax_id")(e.target.value)}
                onBlur={() => mudar("tax_id")(formatarCnpjCpf(c.tax_id))}
              />
              <Button
                type="button"
                className="whitespace-nowrap bg-white text-[var(--cor-primaria)] ring-1 ring-[var(--cor-primaria)] hover:bg-[var(--cor-primaria-clara)]"
                disabled={buscandoCnpj || somenteDigitos(c.tax_id).length !== 14 || !cnpjCpfValido(c.tax_id)}
                onClick={consultarCnpj}
              >
                {buscandoCnpj ? "Buscando..." : "Buscar CNPJ"}
              </Button>
            </div>
            {erros.documento && <p className="mt-1 text-xs text-red-600">{erros.documento}</p>}
          </div>
          <div>
            <Label htmlFor="tipo-cliente">Tipo de cliente</Label>
            <select
              id="tipo-cliente"
              className="w-full min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
              value={c.customer_type_id}
              onChange={(e) => mudar("customer_type_id")(e.target.value)}
              disabled={tiposQuery.isLoading}
            >
              <option value="">Selecione…</option>
              {(tiposQuery.data ?? []).map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.code_prefix} — {tipo.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="area-atuacao">Área de atuação</Label>
            <select
              id="area-atuacao"
              className="w-full min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm"
              value={c.customer_specialty_id}
              onChange={(e) => mudar("customer_specialty_id")(e.target.value)}
              disabled={areasQuery.isLoading}
            >
              <option value="">Selecione…</option>
              {(areasQuery.data ?? []).map((area) => (
                <option key={area.id} value={area.id}>
                  {area.code_prefix} — {area.name}
                </option>
              ))}
            </select>
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
            <div className="flex gap-2">
              <Input
                id="cepfat"
                value={c.billing_zip}
                placeholder="00000-000"
                onChange={(e) => mudar("billing_zip")(e.target.value)}
                onBlur={() => mudar("billing_zip")(formatarCep(c.billing_zip))}
              />
              <Button
                type="button"
                className="whitespace-nowrap bg-white text-[var(--cor-primaria)] ring-1 ring-[var(--cor-primaria)] hover:bg-[var(--cor-primaria-clara)]"
                disabled={buscandoCep === "billing" || !cepValido(c.billing_zip)}
                onClick={() => consultarCep("billing")}
              >
                {buscandoCep === "billing" ? "Buscando..." : "Buscar CEP"}
              </Button>
            </div>
            {erros.cepFat && <p className="mt-1 text-xs text-red-600">{erros.cepFat}</p>}
          </div>
          <div>
            <Label htmlFor="cepent">CEP de entrega</Label>
            <div className="flex gap-2">
              <Input
                id="cepent"
                value={c.shipping_zip}
                placeholder="00000-000"
                onChange={(e) => mudar("shipping_zip")(e.target.value)}
                onBlur={() => mudar("shipping_zip")(formatarCep(c.shipping_zip))}
              />
              <Button
                type="button"
                className="whitespace-nowrap bg-white text-[var(--cor-primaria)] ring-1 ring-[var(--cor-primaria)] hover:bg-[var(--cor-primaria-clara)]"
                disabled={buscandoCep === "shipping" || !cepValido(c.shipping_zip)}
                onClick={() => consultarCep("shipping")}
              >
                {buscandoCep === "shipping" ? "Buscando..." : "Buscar CEP"}
              </Button>
            </div>
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
        <div className="grid gap-4 md:grid-cols-2">
          <EnderecoCampos
            titulo="Endereço de faturamento / sede"
            prefixo="billing"
            campos={c}
            mudar={mudar}
          />
          <EnderecoCampos
            titulo="Endereço de entrega"
            prefixo="shipping"
            campos={c}
            mudar={mudar}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Contatos</h2>
        <ContatoCampos
          titulo="Contato comercial"
          nomeId="contato-comercial"
          telefoneId="telefone-comercial"
          emailId="email-comercial"
          nome={c.commercial_contact_name}
          telefone={c.commercial_phone}
          email={c.commercial_email}
          erroTelefone={erros.telefoneComercial}
          erroEmail={erros.emailComercial}
          mudarNome={mudar("commercial_contact_name")}
          mudarTelefone={mudar("commercial_phone")}
          mudarEmail={mudar("commercial_email")}
        />
        <ContatoCampos
          titulo="Contato financeiro"
          nomeId="contato-financeiro"
          telefoneId="telefone-financeiro"
          emailId="email-financeiro"
          nome={c.financial_contact_name}
          telefone={c.financial_phone}
          email={c.financial_email}
          erroTelefone={erros.telefoneFinanceiro}
          erroEmail={erros.emailFinanceiro}
          mudarNome={mudar("financial_contact_name")}
          mudarTelefone={mudar("financial_phone")}
          mudarEmail={mudar("financial_email")}
        />
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

      <p className="text-xs text-[var(--cor-texto-suave)]">
        Tipo de cliente e área de atuação vêm de Cadastros. Quando os dois estão preenchidos,
        o código do cliente é gerado pelo banco.
      </p>
    </div>
  );
}

function EnderecoCampos({
  titulo,
  prefixo,
  campos,
  mudar,
}: {
  titulo: string;
  prefixo: "billing" | "shipping";
  campos: Campos;
  mudar: (campo: keyof Campos) => (valor: string) => void;
}) {
  const campo = (nome: "street" | "number" | "complement" | "district" | "city" | "state") =>
    `${prefixo}_${nome}` as keyof Campos;

  return (
    <div className="space-y-3 rounded-md border border-[var(--cor-borda)] p-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div>
        <Label>Logradouro</Label>
        <Input value={campos[campo("street")]} onChange={(e) => mudar(campo("street"))(e.target.value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Número</Label>
          <Input value={campos[campo("number")]} onChange={(e) => mudar(campo("number"))(e.target.value)} />
        </div>
        <div>
          <Label>Complemento</Label>
          <Input value={campos[campo("complement")]} onChange={(e) => mudar(campo("complement"))(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Bairro</Label>
          <Input value={campos[campo("district")]} onChange={(e) => mudar(campo("district"))(e.target.value)} />
        </div>
        <div>
          <Label>Cidade</Label>
          <Input value={campos[campo("city")]} onChange={(e) => mudar(campo("city"))(e.target.value)} />
        </div>
        <div>
          <Label>UF</Label>
          <Input value={campos[campo("state")]} onChange={(e) => mudar(campo("state"))(e.target.value.toUpperCase())} />
        </div>
      </div>
    </div>
  );
}

function ContatoCampos({
  titulo,
  nomeId,
  telefoneId,
  emailId,
  nome,
  telefone,
  email,
  erroTelefone,
  erroEmail,
  mudarNome,
  mudarTelefone,
  mudarEmail,
}: {
  titulo: string;
  nomeId: string;
  telefoneId: string;
  emailId: string;
  nome: string;
  telefone: string;
  email: string;
  erroTelefone: string | null;
  erroEmail: string | null;
  mudarNome: (valor: string) => void;
  mudarTelefone: (valor: string) => void;
  mudarEmail: (valor: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-[var(--cor-borda)] p-3">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label htmlFor={nomeId}>Nome</Label>
          <Input id={nomeId} value={nome} onChange={(e) => mudarNome(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={telefoneId}>Telefone</Label>
          <Input
            id={telefoneId}
            value={telefone}
            placeholder="(00) 00000-0000"
            onChange={(e) => mudarTelefone(e.target.value)}
            onBlur={() => mudarTelefone(formatarTelefone(telefone))}
          />
          {erroTelefone && <p className="mt-1 text-xs text-red-600">{erroTelefone}</p>}
        </div>
        <div>
          <Label htmlFor={emailId}>E-mail</Label>
          <Input id={emailId} value={email} onChange={(e) => mudarEmail(e.target.value)} />
          {erroEmail && <p className="mt-1 text-xs text-red-600">{erroEmail}</p>}
        </div>
      </div>
    </div>
  );
}
