import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { nomePerfil } from "../lib/roles";
import { Button, Card, Input, Label } from "@components/ui/primitives";

const SENHA_MINIMA = 8;

export default function PerfilPage() {
  const { perfil, session } = useAuth();
  if (!perfil) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Meu perfil</h1>
      <Card className="max-w-md space-y-2 text-sm">
        <Linha rotulo="Nome" valor={perfil.nome} />
        <Linha rotulo="E-mail" valor={session?.user.email ?? "—"} />
        <Linha rotulo="Perfil" valor={nomePerfil(perfil.perfil, perfil.superAdmin)} />
      </Card>
      <TrocarSenha />
    </div>
  );
}

// Quem recebe uma senha provisória do Administrador troca aqui. É o único lugar
// onde a própria pessoa mexe na senha dela.
function TrocarSenha() {
  const { trocarSenha } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const podeSalvar =
    atual.length > 0 && nova.length >= SENHA_MINIMA && nova === confirmacao && !salvando;

  async function enviar() {
    setSalvando(true);
    setErro(null);
    setPronto(false);
    const { erro: falha } = await trocarSenha(atual, nova);
    setSalvando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setAtual("");
    setNova("");
    setConfirmacao("");
    setPronto(true);
  }

  return (
    <Card className="max-w-md space-y-3">
      <h2 className="text-lg font-semibold">Trocar minha senha</h2>

      <div>
        <Label htmlFor="senha-atual">Senha atual</Label>
        <Input
          id="senha-atual"
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="senha-nova">Nova senha</Label>
        <Input
          id="senha-nova"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
        <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">
          Ao menos {SENHA_MINIMA} caracteres.
        </p>
      </div>
      <div>
        <Label htmlFor="senha-confirmacao">Repita a nova senha</Label>
        <Input
          id="senha-confirmacao"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
        {confirmacao.length > 0 && nova !== confirmacao && (
          <p className="mt-1 text-xs text-red-700">As duas senhas não são iguais.</p>
        )}
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {pronto && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Senha trocada.
        </p>
      )}

      <Button disabled={!podeSalvar} onClick={() => void enviar()}>
        {salvando ? "Trocando…" : "Trocar senha"}
      </Button>
    </Card>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--cor-borda)] pb-2 last:border-0">
      <span className="text-[var(--cor-texto-suave)]">{rotulo}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
