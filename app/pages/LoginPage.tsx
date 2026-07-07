import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, Input, Label } from "@components/ui/primitives";

const esquema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  senha: z.string().min(1, "Informe a senha."),
});
type Campos = z.infer<typeof esquema>;

export default function LoginPage() {
  const { session, entrar, carregando } = useAuth();
  const local = useLocation();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Campos>({ resolver: zodResolver(esquema) });

  if (!carregando && session) {
    const destino = (local.state as { de?: string } | null)?.de ?? "/";
    return <Navigate to={destino} replace />;
  }

  async function aoEnviar(campos: Campos) {
    setErro(null);
    const { erro } = await entrar(campos.email, campos.senha);
    if (erro) setErro(erro);
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Intertec</h1>
        <p className="mb-6 text-sm text-[var(--cor-texto-suave)]">CMV e Rentabilidade — entre para continuar.</p>
        <form onSubmit={handleSubmit(aoEnviar)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" {...register("email")} />
            {formState.errors.email && <p className="mt-1 text-xs text-red-600">{formState.errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" type="password" autoComplete="current-password" {...register("senha")} />
            {formState.errors.senha && <p className="mt-1 text-xs text-red-600">{formState.errors.senha.message}</p>}
          </div>
          {erro && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
