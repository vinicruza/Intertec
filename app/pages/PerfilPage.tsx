import { useAuth } from "../auth/AuthProvider";
import { NOME_PERFIL } from "../lib/roles";
import { Card } from "@components/ui/primitives";

export default function PerfilPage() {
  const { perfil, session } = useAuth();
  if (!perfil) return null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Meu perfil</h1>
      <Card className="max-w-md space-y-2 text-sm">
        <Linha rotulo="Nome" valor={perfil.nome} />
        <Linha rotulo="E-mail" valor={session?.user.email ?? "—"} />
        <Linha rotulo="Perfil" valor={NOME_PERFIL[perfil.perfil]} />
      </Card>
    </div>
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
