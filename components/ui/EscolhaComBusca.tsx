import { useId } from "react";
import { cn } from "./cn";

// ============================================================
// Escolha com busca (código ou nome)
// ============================================================
//
// O catálogo tem 324 produtos. Numa caixa de seleção comum, achar o
// "Campo Cirúrgico Catarata 1,00×1,20" é rolar uma lista de trezentas linhas —
// e dentro do montador de kit a pessoa repete isso uma vez por produto do kit.
// Era o maior atrito da tela de pedido.
//
// A busca é do navegador (<datalist>): digitou "catarata", a lista filtra.
// Sem biblioteca, sem componente de menu para dar manutenção, e o teclado
// funciona do jeito que a pessoa já espera. O que fica por nossa conta é a
// tradução entre o que aparece na tela ("CS0007 — Campo Catarata") e o id que
// o pedido grava — e é isso que as duas funções abaixo fazem, testadas em
// tests/pedidos/escolhaComBusca.test.ts.

export type OpcaoDeBusca = {
  id: string;
  codigo: string;
  nome: string;
  // Texto extra à direita, quando ajuda a escolher (ex.: "sem custo vigente").
  detalhe?: string;
};

// O rótulo começa pelo CÓDIGO de propósito: é único, e é o que a pessoa tem em
// mãos quando vem com um pedido de papel. Digitar o nome também filtra, porque
// o navegador procura em qualquer parte do texto.
export function rotuloDaOpcao(o: OpcaoDeBusca): string {
  return `${o.codigo} — ${o.nome}`;
}

// Caminho de volta: do texto que ficou no campo para o id.
//
// Compara sem diferenciar maiúsculas e espaços das pontas, porque o navegador
// devolve exatamente o texto da opção mas a pessoa pode ter digitado à mão.
// Sem correspondência exata, devolve null — e a tela trata como "ainda não
// escolheu", em vez de adivinhar um produto parecido.
export function idPorRotulo(texto: string, opcoes: OpcaoDeBusca[]): string | null {
  const alvo = texto.trim().toLocaleLowerCase("pt-BR");
  if (alvo === "") return null;
  const exata = opcoes.find((o) => rotuloDaOpcao(o).toLocaleLowerCase("pt-BR") === alvo);
  if (exata) return exata.id;
  // Quem digita só o código também acerta ("CS0007").
  const porCodigo = opcoes.filter((o) => o.codigo.toLocaleLowerCase("pt-BR") === alvo);
  return porCodigo.length === 1 ? porCodigo[0].id : null;
}

export function rotuloPorId(id: string, opcoes: OpcaoDeBusca[]): string {
  const o = opcoes.find((x) => x.id === id);
  return o ? rotuloDaOpcao(o) : "";
}

export function EscolhaComBusca({
  valor,
  opcoes,
  aoEscolher,
  placeholder = "Digite o código ou o nome…",
  className,
  id: idExterno,
}: {
  // Id do item escolhido; vazio = nada escolhido ainda.
  valor: string;
  opcoes: OpcaoDeBusca[];
  aoEscolher: (id: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const idGerado = useId();
  const idLista = `${idExterno ?? idGerado}-lista`;

  return (
    <>
      <input
        list={idLista}
        // Componente não controlado de propósito: o valor visível é o texto
        // que a pessoa está digitando, e ele só vira id quando bate com uma
        // opção. Controlar o texto a cada tecla apagaria o que ela digitou no
        // meio da busca.
        defaultValue={rotuloPorId(valor, opcoes)}
        key={valor} // troca externa (ex.: limpar a linha) redesenha o campo
        placeholder={placeholder}
        onChange={(e) => aoEscolher(idPorRotulo(e.target.value, opcoes) ?? "")}
        className={cn(
          "w-full min-h-10 rounded-[0.625rem] border border-[var(--cor-borda)] bg-white px-3 py-2 text-sm",
          "outline-none placeholder:text-slate-400 focus:border-[var(--cor-primaria)] focus:ring-4 focus:ring-indigo-100",
          className
        )}
      />
      <datalist id={idLista}>
        {opcoes.map((o) => (
          <option key={o.id} value={rotuloDaOpcao(o)}>
            {o.detalhe}
          </option>
        ))}
      </datalist>
    </>
  );
}
