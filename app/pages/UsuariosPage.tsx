import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  criarUsuario,
  listarUsuarios,
  redefinirSenha,
  removerUsuario,
  salvarUsuario,
  type UsuarioAdmin,
} from "../lib/db/usuarios";
import { SENHA_MINIMA, senhaSugerida } from "../lib/senha";
import { NOME_PERFIL, nomePerfil, type Perfil } from "../lib/roles";
import { useAuth } from "../auth/AuthProvider";
import { dataCurta } from "../lib/format";
import { Badge, Button, Card, Input, Label } from "@components/ui/primitives";

const PERFIS: Perfil[] = ["admin", "financeiro", "comercial", "producao"];

const DESCRICAO_PERFIL: Record<Perfil, string> = {
  admin: "Acesso total, incluindo a área restrita: usuários, cadastros, configurações e integridade.",
  financeiro: "Custos, insumos, produtos, pedidos e DRE. Não entra na área restrita.",
  comercial: "Simulador, pedidos, clientes e kits. Não vê preço de insumo.",
  producao: "Kits, produtos e insumos para produzir. Não vê pedido nem resultado.",
};

export default function UsuariosPage() {
  const queryClient = useQueryClient();
  const { perfil: eu } = useAuth();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["usuarios"], queryFn: listarUsuarios });

  function recarregar() {
    queryClient.invalidateQueries({ queryKey: ["usuarios"] });
  }

  function comoErro(e: unknown, padrao: string) {
    setAviso(null);
    setErro(e instanceof Error ? e.message : padrao);
  }

  const salvar = useMutation({
    mutationFn: (v: { id: string; nome: string; perfil: Perfil; ativo: boolean }) =>
      salvarUsuario(v.id, v.nome, v.perfil, v.ativo),
    onSuccess: (_r, v) => {
      setErro(null);
      setAviso(`Acesso de ${v.nome} atualizado.`);
      recarregar();
    },
    onError: (e) => comoErro(e, "Erro ao salvar o usuário."),
  });

  const criar = useMutation({
    mutationFn: criarUsuario,
    onSuccess: (_r, v) => {
      setErro(null);
      setAviso(
        `Acesso criado para ${v.email}. Entregue a senha provisória a ${v.nome} — no primeiro acesso o sistema pede que ela defina a senha dela.`
      );
      recarregar();
    },
    onError: (e) => comoErro(e, "Erro ao criar o acesso."),
  });

  const senha = useMutation({
    mutationFn: (v: { id: string; senha: string; email: string }) => redefinirSenha(v.id, v.senha),
    onSuccess: (_r, v) => {
      setErro(null);
      setAviso(
        `Senha de ${v.email} redefinida. Entregue a nova senha provisória à pessoa — ela vai definir a própria senha ao entrar.`
      );
      recarregar();
    },
    onError: (e) => comoErro(e, "Erro ao redefinir a senha."),
  });

  const remover = useMutation({
    mutationFn: (v: { id: string; email: string }) => removerUsuario(v.id),
    onSuccess: (_r, v) => {
      setErro(null);
      setAviso(`Acesso de ${v.email} excluído.`);
      recarregar();
    },
    onError: (e) => comoErro(e, "Erro ao excluir o acesso."),
  });

  const usuarios = data ?? [];
  const inativos = usuarios.filter((u) => !u.active);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="text-sm text-[var(--cor-texto-suave)]">
          Crie o acesso das pessoas, escolha o perfil de cada uma e desative quem sai. Tudo é feito
          aqui — nada precisa ser mexido no banco de dados.
        </p>
      </div>

      <FormularioNovoUsuario
        salvando={criar.isPending}
        aoCriar={(dados) => criar.mutate(dados)}
      />

      {aviso && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {aviso}
        </p>
      )}
      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {isLoading && <p className="text-[var(--cor-texto-suave)]">Carregando…</p>}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof Error ? error.message : "Não foi possível carregar os usuários."}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-semibold">Quem tem acesso</h2>
        <span className="text-xs text-[var(--cor-texto-suave)]">
          {usuarios.length} pessoa(s){inativos.length > 0 ? ` · ${inativos.length} sem acesso` : ""}
        </span>
      </div>

      {usuarios.map((u) => (
        <LinhaUsuario
          key={u.id}
          usuario={u}
          souEu={u.id === eu?.id}
          ocupado={salvar.isPending || senha.isPending || remover.isPending}
          aoSalvar={(nome, perfil, ativo) => salvar.mutate({ id: u.id, nome, perfil, ativo })}
          aoRedefinirSenha={(nova) => senha.mutate({ id: u.id, senha: nova, email: u.email })}
          aoRemover={() => remover.mutate({ id: u.id, email: u.email })}
        />
      ))}

      <Card className="space-y-2 bg-[var(--cor-fundo)] text-sm">
        <strong>O que cada perfil enxerga</strong>
        <ul className="ml-5 list-disc space-y-1 text-[var(--cor-texto-suave)]">
          {PERFIS.map((p) => (
            <li key={p}>
              <strong>{NOME_PERFIL[p]}:</strong> {DESCRICAO_PERFIL[p]}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--cor-texto-suave)]">
          Desativar o acesso preserva o histórico: os pedidos, kits e alterações de preço continuam
          mostrando quem fez cada coisa. Excluir só é possível para quem nunca registrou nada.
        </p>
      </Card>
    </div>
  );
}

function FormularioNovoUsuario({
  salvando,
  aoCriar,
}: {
  salvando: boolean;
  aoCriar: (dados: { nome: string; email: string; perfil: Perfil; senha: string }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("comercial");
  const [senha, setSenha] = useState(senhaSugerida);

  function limpar() {
    setNome("");
    setEmail("");
    setPerfil("comercial");
    setSenha(senhaSugerida());
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)}>＋ Novo usuário</Button>
    );
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Novo usuário</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="novo-nome">Nome</Label>
          <Input
            id="novo-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome de quem vai usar o sistema"
          />
        </div>
        <div>
          <Label htmlFor="novo-email">E-mail</Label>
          <Input
            id="novo-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@intertechsurgical.com.br"
          />
        </div>
        <div>
          <Label htmlFor="novo-perfil">Perfil</Label>
          <select
            id="novo-perfil"
            className="min-h-10 w-full rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 text-sm"
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as Perfil)}
          >
            {PERFIS.map((p) => (
              <option key={p} value={p}>{NOME_PERFIL[p]}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">{DESCRICAO_PERFIL[perfil]}</p>
        </div>
        <div>
          <Label htmlFor="nova-senha">Senha provisória</Label>
          <div className="flex gap-2">
            <Input id="nova-senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
            <Button
              type="button"
              className="min-h-10 shrink-0 border border-[var(--cor-borda)] bg-white px-3 text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]"
              onClick={() => setSenha(senhaSugerida())}
            >
              Sortear
            </Button>
          </div>
          <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
            Copie e entregue à pessoa. No primeiro acesso, o sistema pede que ela defina a senha
            dela — esta aqui deixa de valer.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={salvando || !nome.trim() || !email.trim() || senha.length < SENHA_MINIMA}
          onClick={() => aoCriar({ nome: nome.trim(), email: email.trim(), perfil, senha })}
        >
          {salvando ? "Criando…" : "Criar acesso"}
        </Button>
        <Button
          className="border border-[var(--cor-borda)] bg-white text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]"
          onClick={() => {
            limpar();
            setAberto(false);
          }}
        >
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

function LinhaUsuario({
  usuario,
  souEu,
  ocupado,
  aoSalvar,
  aoRedefinirSenha,
  aoRemover,
}: {
  usuario: UsuarioAdmin;
  souEu: boolean;
  ocupado: boolean;
  aoSalvar: (nome: string, perfil: Perfil, ativo: boolean) => void;
  aoRedefinirSenha: (senha: string) => void;
  aoRemover: () => void;
}) {
  const [nome, setNome] = useState(usuario.full_name);
  const [perfil, setPerfil] = useState<Perfil>(usuario.role);
  const [ativo, setAtivo] = useState(usuario.active);
  const [novaSenha, setNovaSenha] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const mudou = nome !== usuario.full_name || perfil !== usuario.role || ativo !== usuario.active;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="mb-1 block text-xs text-[var(--cor-texto-suave)]">Nome</label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">{usuario.email}</p>
        </div>

        <div>
          <label className="mb-1 block text-xs text-[var(--cor-texto-suave)]">Perfil</label>
          <select
            className="min-h-10 rounded-md border border-[var(--cor-borda)] px-2 text-sm"
            value={perfil}
            disabled={usuario.is_super_admin}
            onChange={(e) => setPerfil(e.target.value as Perfil)}
          >
            {PERFIS.map((p) => (
              <option key={p} value={p}>{NOME_PERFIL[p]}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={ativo}
            disabled={usuario.is_super_admin}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          Ativo
        </label>

        <div className="flex flex-wrap items-center gap-2 pb-2 text-xs text-[var(--cor-texto-suave)]">
          {usuario.is_super_admin && <Badge>{nomePerfil(usuario.role, true)}</Badge>}
          {souEu && <Badge>você</Badge>}
          <Badge>
            {usuario.active
              ? usuario.last_sign_in_at
                ? `último acesso ${dataCurta(usuario.last_sign_in_at)}`
                : "nunca acessou"
              : "acesso desativado"}
          </Badge>
          {usuario.must_change_password && <Badge>senha provisória pendente</Badge>}
        </div>

        <Button disabled={!mudou || ocupado} onClick={() => aoSalvar(nome, perfil, ativo)}>
          {ocupado ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--cor-borda)] pt-3">
        <Button
          className="min-h-9 border border-[var(--cor-borda)] bg-white px-4 text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]"
          disabled={ocupado}
          onClick={() => setNovaSenha(senhaSugerida())}
        >
          Redefinir senha
        </Button>

        {!souEu && (
          confirmandoExclusao ? (
            <>
              <span className="text-sm text-red-700">Excluir o acesso de {usuario.email}?</span>
              <Button
                className="min-h-9 bg-red-600 px-4 hover:bg-red-700"
                disabled={ocupado}
                onClick={() => {
                  setConfirmandoExclusao(false);
                  aoRemover();
                }}
              >
                Sim, excluir
              </Button>
              <Button
                className="min-h-9 border border-[var(--cor-borda)] bg-white px-4 text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]"
                onClick={() => setConfirmandoExclusao(false)}
              >
                Não
              </Button>
            </>
          ) : (
            <Button
              className="min-h-9 border border-red-200 bg-white px-4 text-red-700 shadow-none hover:bg-red-50"
              disabled={ocupado}
              onClick={() => setConfirmandoExclusao(true)}
            >
              Excluir acesso
            </Button>
          )
        )}
      </div>

      {novaSenha !== null && (
        <div className="space-y-2 rounded-md border border-[var(--cor-borda)] bg-[var(--cor-fundo)] p-3">
          <label className="block text-xs text-[var(--cor-texto-suave)]">
            Nova senha provisória para {usuario.email}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-64"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
            />
            <Button
              className="min-h-10 border border-[var(--cor-borda)] bg-white px-3 text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]"
              onClick={() => setNovaSenha(senhaSugerida())}
            >
              Sortear
            </Button>
            <Button
              disabled={ocupado || novaSenha.length < SENHA_MINIMA}
              onClick={() => {
                aoRedefinirSenha(novaSenha);
                setNovaSenha(null);
              }}
            >
              Confirmar
            </Button>
            <Button
              className="border border-[var(--cor-borda)] bg-white text-[var(--cor-texto-suave)] shadow-none hover:bg-[var(--cor-fundo)]"
              onClick={() => setNovaSenha(null)}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
