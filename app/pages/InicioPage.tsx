import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabase";
import { Card } from "@components/ui/primitives";

// Página inicial. Além de saudar, lê os canais do banco — passando pelo RLS,
// o que confirma que a leitura de dados funciona para o perfil logado.
export default function InicioPage() {
  const { perfil } = useAuth();
  const [canais, setCanais] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase
      .from("channels")
      .select("id", { count: "exact", head: true })
      .then(({ count }) => {
        setCanais(count ?? 0);
        setCarregando(false);
      });
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Olá, {perfil?.nome}</h1>
      <p className="text-[var(--cor-texto-suave)]">
        Sistema em construção — as telas de conteúdo chegam a partir da Sprint 6. Por ora, a
        autenticação e as permissões por perfil já estão funcionando.
      </p>
      <Card className="max-w-sm">
        <div className="text-sm text-[var(--cor-texto-suave)]">Canais cadastrados (via RLS)</div>
        <div className="mt-1 text-3xl font-semibold">{carregando ? "…" : canais}</div>
      </Card>
    </div>
  );
}
