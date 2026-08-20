import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  categorizarCliente,
  contarClientesSemCategoria,
  listarAreasCliente,
  listarClientes,
  listarTiposCliente,
} from "../lib/db/clientes";
import { formatarCnpjCpf, somenteDigitos } from "../../lib/cadastro/documentos";
import { mensagemDeErro } from "../lib/erros";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

// ============================================================
// Clientes e categorização (reunião Intertech 16/07/2026)
// ============================================================
//
// Tela nova. Existe porque a decisão foi categorizar o CLIENTE, e havia 13 mil
// cadastros sem categoria — sem um lugar para fazer esse trabalho, a decisão
// não sai do papel.

type Filtro = "todos" | "sem_categoria" | "sem_documento";

export default function ClientesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("sem_categoria");
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const clientesQuery = useQuery({ queryKey: ["clientes"], queryFn: listarClientes });
  const tiposQuery = useQuery({ queryKey: ["tiposCliente"], queryFn: listarTiposCliente });
  const areasQuery = useQuery({ queryKey: ["areasCliente"], queryFn: listarAreasCliente });
  const pendenciaQuery = useQuery({ queryKey: ["pendenciaClientes"], queryFn: contarClientesSemCategoria });

  const categorizar = useMutation({
    mutationFn: (v: { id: string; tipoId: string | null; areaId: string | null }) =>
      categorizarCliente(v.id, v.tipoId, v.areaId),
    onSuccess: () => {
      setErro(null);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["pendenciaClientes"] });
    },
    onError: (e: unknown) => setErro(mensagemDeErro(e, "Erro ao categorizar.")),
  });

  const tipos = tiposQuery.data ?? [];
  const areas = areasQuery.data ?? [];
  const todos = clientesQuery.data ?? [];

  const clientes = useMemo(() => {
    const texto = busca.trim().toLocaleLowerCase("pt-BR");
    const digitos = somenteDigitos(texto);
    return todos.filter((c) => {
      const semCategoria = !c.customer_type_id || !c.customer_specialty_id;
      if (filtro === "sem_categoria" && !semCategoria) return false;
      if (filtro === "sem_documento" && c.tax_id) return false;
      if (texto) {
        const porNome = `${c.external_code ?? ""} ${c.code ?? ""} ${c.name}`.toLocaleLowerCase("pt-BR").includes(texto);
        // Busca por documento aceita com ou sem máscara: quem copia um CNPJ
        // de um e-mail cola com pontuação, quem digita não usa.
        const porDocumento = digitos !== "" && (c.tax_id ?? "").includes(digitos);
        if (!porNome && !porDocumento) return false;
      }
      return true;
    });
  }, [todos, filtro, busca]);

  // Quantos ainda estão sem CNPJ. É o número que diz quanto falta para a ficha
  // impressa parar de sair com o cabeçalho pela metade.
  const semDocumento = useMemo(() => todos.filter((c) => !c.tax_id).length, [todos]);

  const pendencia = pendenciaQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            O segmento fica no cliente, não no kit — o mesmo kit é vendido para hospital, veterinário
            e oftalmologia. É daqui que sai a leitura de quantas cotações foram para cada segmento.
          </p>
        </div>
        <Button onClick={() => navigate("/clientes/novo")}>Novo cliente</Button>
      </div>

      {pendencia && pendencia.total > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            <strong>{pendencia.total} cliente(s) ainda sem categoria.</strong>{" "}
            {pendencia.com_pedido > 0 && (
              <>
                {pendencia.com_pedido} já tem pedido registrado — comece por esses, é o que dá
                resultado mais rápido nas análises.
              </>
            )}
          </p>
        </Card>
      )}

      <Card className="flex flex-wrap gap-3 p-4">
        <select
          className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
        >
          <option value="sem_categoria">Só os sem categoria</option>
          <option value="sem_documento">Só os sem CNPJ/CPF</option>
          <option value="todos">Todos os clientes</option>
        </select>
        <Input
          className="w-72"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código do cliente, nome ou CNPJ"
        />
        <span className="self-center text-sm text-[var(--cor-texto-suave)]">
          {clientes.length} de {todos.length}
        </span>
      </Card>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {clientesQuery.isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}

      {clientes.length === 0 && !clientesQuery.isLoading && (
        <Card>
          <p className="text-sm text-[var(--cor-texto-suave)]">
            {filtro === "sem_categoria"
              ? "Nenhum cliente pendente de categoria — trabalho concluído."
              : "Nenhum cliente corresponde à busca."}
          </p>
        </Card>
      )}

      {clientes.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--cor-borda)] text-left text-[var(--cor-texto-suave)]">
                <th className="px-4 py-3 font-medium">Código cliente</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">CNPJ/CPF</th>
                <th className="px-4 py-3 font-medium">UF</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Área</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-[var(--cor-borda)] last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">
                    {c.external_code ? (
                      <div>
                        <p className="font-semibold text-[var(--cor-texto)]">{c.external_code}</p>
                        {c.code && <p className="text-[0.65rem] text-[var(--cor-texto-suave)]">Interno: {c.code}</p>}
                      </div>
                    ) : (
                      <Badge>sem código</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <Link to={`/clientes/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {c.tax_id ? (
                      formatarCnpjCpf(c.tax_id)
                    ) : (
                      <Link to={`/clientes/${c.id}`} className="text-[var(--cor-primaria)] hover:underline">
                        preencher
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2">{c.uf ?? "—"}</td>
                  <td className="px-4 py-2">
                    <select
                      className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-1 text-sm"
                      value={c.customer_type_id ?? ""}
                      onChange={(e) =>
                        categorizar.mutate({
                          id: c.id,
                          tipoId: e.target.value || null,
                          areaId: c.customer_specialty_id,
                        })
                      }
                    >
                      <option value="">—</option>
                      {tipos.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="w-full rounded-md border border-[var(--cor-borda)] px-2 py-1 text-sm"
                      value={c.customer_specialty_id ?? ""}
                      onChange={(e) =>
                        categorizar.mutate({
                          id: c.id,
                          tipoId: c.customer_type_id,
                          areaId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">—</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-[var(--cor-texto-suave)]">
        O código é gerado quando tipo e área estão preenchidos, no formato tipo(2) + área(2) +
        sequencial. Código já gerado não muda ao recategorizar — ele pode ter ido para documento
        ou planilha.
      </p>
      {semDocumento > 0 && (
        <p className="text-xs text-[var(--cor-texto-suave)]">
          <strong>{semDocumento} cliente(s) ainda sem CNPJ/CPF.</strong> Enquanto o documento e os
          CEPs não estiverem preenchidos, a ficha do pedido sai com o cabeçalho incompleto —
          clique no nome do cliente para completar.
        </p>
      )}
    </div>
  );
}
