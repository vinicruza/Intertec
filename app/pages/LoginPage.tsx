import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Button, Card, Input, Label } from "@components/ui/primitives";
import { IntertechLogo } from "@components/brand/IntertechLogo";

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
    <div className="grid min-h-full bg-white lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-[var(--cor-primaria)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full border-[5rem] border-white/5" />
        <div className="absolute -bottom-64 -left-32 h-[38rem] w-[38rem] rounded-full border-[7rem] border-[#6d5bd0]/25" />
        <IntertechLogo inverse size="lg" />
        <div className="relative max-w-md">
          <h1 className="text-2xl font-semibold tracking-[-0.03em]">Sistema Interno</h1>
          <p className="mt-3 text-sm leading-6 text-indigo-100">
            Plataforma de gestão da Intertech. Novos módulos serão adicionados ao longo do tempo.
          </p>
        </div>
        <p className="relative text-xs text-indigo-200">Intertech Surgical · Ambiente interno seguro</p>
      </section>

      <main className="flex items-center justify-center bg-[var(--cor-fundo)] p-5 sm:p-10">
        <Card className="w-full max-w-md border-0 p-7 shadow-[0_24px_70px_rgb(4_4_100/0.10)] sm:p-10">
          <div className="mb-8 lg:hidden"><IntertechLogo /></div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cor-destaque)]">Acesso seguro</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Bem-vindo</h2>
          <p className="mb-8 mt-2 text-sm leading-6 text-[var(--cor-texto-suave)]">Entre para acessar o painel de CMV e rentabilidade.</p>
          <form onSubmit={handleSubmit(aoEnviar)} className="space-y-5" noValidate>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="seuemail@intertech.com.br" {...register("email")} />
              {formState.errors.email && <p className="mt-1.5 text-xs text-red-600">{formState.errors.email.message}</p>}
            </div>
            <div>
              <Label htmlFor="senha">Senha</Label>
              <Input id="senha" type="password" autoComplete="current-password" placeholder="Sua senha" {...register("senha")} />
              {formState.errors.senha && <p className="mt-1.5 text-xs text-red-600">{formState.errors.senha.message}</p>}
            </div>
            {erro && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">{erro}</p>}
            <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? "Entrando…" : "Entrar no sistema"}
            </Button>
          </form>
          <p className="mt-8 text-center text-xs text-[var(--cor-texto-suave)]">Acesso restrito a usuários autorizados.</p>
        </Card>
      </main>
    </div>
  );
}
