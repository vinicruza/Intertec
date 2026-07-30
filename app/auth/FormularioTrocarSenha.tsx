import { useState } from "react";
import { useAuth } from "./AuthProvider";
import { SENHA_MINIMA } from "../lib/senha";
import { Button, Input, Label } from "@components/ui/primitives";

// Formulário único de troca de senha, usado em dois lugares: em Meu perfil,
// quando a pessoa quer trocar, e na tela de troca obrigatória, quando ela
// recebeu uma senha provisória e não pode seguir sem trocar.
export function FormularioTrocarSenha({
  rotuloBotao = "Trocar senha",
  aoConcluir,
}: {
  rotuloBotao?: string;
  aoConcluir?: () => void;
}) {
  const { trocarSenha } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const desencontro = confirmacao.length > 0 && nova !== confirmacao;
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
    aoConcluir?.();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (podeSalvar) void enviar();
      }}
    >
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
        {desencontro && <p className="mt-1 text-xs text-red-700">As duas senhas não são iguais.</p>}
      </div>

      {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {pronto && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Senha trocada.
        </p>
      )}

      <Button type="submit" disabled={!podeSalvar}>
        {salvando ? "Trocando…" : rotuloBotao}
      </Button>
    </form>
  );
}
