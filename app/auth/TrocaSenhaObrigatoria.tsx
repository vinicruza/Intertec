import { useAuth } from "./AuthProvider";
import { FormularioTrocarSenha } from "./FormularioTrocarSenha";
import { IntertechLogo } from "@components/brand/IntertechLogo";

// Primeiro acesso com senha provisória: nenhuma outra tela aparece antes de a
// pessoa definir uma senha que só ela conheça. A senha que o Administrador
// entregou passou por conversa, papel ou mensagem — não é segredo de ninguém.
export default function TrocaSenhaObrigatoria() {
  const { perfil, session, sair } = useAuth();

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--cor-fundo)] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--cor-borda)] bg-white p-6 shadow-[var(--sombra-cartao)]">
        <IntertechLogo />

        <h1 className="mt-6 text-lg font-semibold">Defina a sua senha</h1>
        <p className="mt-2 text-sm text-[var(--cor-texto-suave)]">
          {perfil ? `${perfil.nome}, ` : ""}a senha que você recebeu é provisória e foi definida por
          outra pessoa. Escolha agora uma senha que só você conheça — o sistema abre em seguida.
        </p>
        <p className="mt-1 text-xs text-[var(--cor-texto-suave)]">{session?.user.email}</p>

        <div className="mt-5">
          <FormularioTrocarSenha rotuloBotao="Definir senha e entrar" />
        </div>

        <button
          type="button"
          className="mt-4 text-sm font-medium text-[var(--cor-primaria)] hover:underline"
          onClick={() => void sair()}
        >
          Sair
        </button>
      </div>
    </div>
  );
}
