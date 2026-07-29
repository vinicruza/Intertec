import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listarUsuarios, salvarUsuario, type UsuarioAdmin } from "../lib/db/usuarios";
import { NOME_PERFIL, type Perfil } from "../lib/roles";
import { dataCurta } from "../lib/format";
import { Badge, Button, Card, Input } from "@components/ui/primitives";

const PERFIS: Perfil[] = ["admin", "financeiro", "comercial", "producao"];

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["usuarios"], queryFn: listarUsuarios });

  const salvar = useMutation({
    mutationFn: (v: { id: string; nome: string; perfil: Perfil; ativo: boolean }) =>
      salvarUsuario(v.id, v.nome, v.perfil, v.ativo),
    onSuccess: () => {
      setErro(null);
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Erro ao salvar o usuário."),
  });

  const usuarios = data ?? [];
  const pendentes = usuarios.filter((u) => !u.active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Defina o perfil de cada pessoa e libere o acesso. Enquanto o acesso não é liberado, a
          pessoa consegue entrar mas não enxerga nenhum dado.
        </p>
      </div>

      <Card className="space-y-2 bg-[var(--cor-fundo)] text-sm">
        <strong>Como dar acesso a alguém novo</strong>
        <ol className="ml-5 list-decimal space-y-1 text-[var(--cor-texto-suave)]">
          <li>
            Convide a pessoa pelo painel do Supabase, em <em>Authentication → Users → Invite</em>,
            ou peça que ela se cadastre com o e-mail dela.
          </li>
          <li>Ela aparece aqui automaticamente, como <strong>aguardando liberação</strong>.</li>
          <li>Preencha o nome, escolha o perfil e marque <strong>Ativo</strong>.</li>
        </ol>
        <p className="text-xs text-[var(--cor-texto-suave)]">
          A criação da senha fica no Supabase de propósito: fazer isso por aqui exigiria embutir a
          chave de administração do projeto no navegador, e qualquer visitante passaria a ter poder
          total sobre a base.
        </p>
      </Card>

      {pendentes.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="text-sm text-amber-900">
            <strong>{pendentes.length} pessoa(s) aguardando liberação de acesso.</strong>
          </p>
        </Card>
      )}

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof Error ? error.message : "Não foi possível carregar os usuários."}
        </p>
      )}

      {usuarios.map((u) => (
        <LinhaUsuario
          key={u.id}
          usuario={u}
          salvando={salvar.isPending}
          aoSalvar={(nome, perfil, ativo) => salvar.mutate({ id: u.id, nome, perfil, ativo })}
        />
      ))}
    </div>
  );
}

function LinhaUsuario({
  usuario,
  salvando,
  aoSalvar,
}: {
  usuario: UsuarioAdmin;
  salvando: boolean;
  aoSalvar: (nome: string, perfil: Perfil, ativo: boolean) => void;
}) {
  const [nome, setNome] = useState(usuario.full_name);
  const [perfil, setPerfil] = useState<Perfil>(usuario.role);
  const [ativo, setAtivo] = useState(usuario.active);

  const mudou =
    nome !== usuario.full_name || perfil !== usuario.role || ativo !== usuario.active;

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <label className="mb-1 block text-xs text-[var(--cor-texto-suave)]">Nome</label>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">{usuario.email}</p>
      </div>

      <div>
        <label className="mb-1 block text-xs text-[var(--cor-texto-suave)]">Perfil</label>
        <select
          className="rounded-md border border-[var(--cor-borda)] px-2 py-2 text-sm"
          value={perfil}
          onChange={(e) => setPerfil(e.target.value as Perfil)}
        >
          {PERFIS.map((p) => (
            <option key={p} value={p}>{NOME_PERFIL[p]}</option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Ativo
      </label>

      <div className="pb-2 text-xs text-[var(--cor-texto-suave)]">
        {usuario.active ? (
          <Badge>
            {usuario.last_sign_in_at ? `último acesso ${dataCurta(usuario.last_sign_in_at)}` : "nunca acessou"}
          </Badge>
        ) : (
          <Badge>aguardando liberação</Badge>
        )}
      </div>

      <Button disabled={!mudou || salvando} onClick={() => aoSalvar(nome, perfil, ativo)}>
        {salvando ? "Salvando…" : "Salvar"}
      </Button>
    </Card>
  );
}
