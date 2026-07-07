// Página genérica "em breve" para as áreas cujas telas chegam nas próximas
// sprints (roadmap — docs/01-PRD.md §10). Cada rota informa seu título e sprint.
export default function EmBrevePage({ titulo, sprint }: { titulo: string; sprint: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="text-[var(--cor-texto-suave)]">
        Esta tela será construída na <strong>{sprint}</strong>. O acesso a esta área já respeita
        o seu perfil (menu e rota); o RLS no banco é a garantia final dos dados.
      </p>
    </div>
  );
}
