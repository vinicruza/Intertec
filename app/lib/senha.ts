// Regras de senha, num arquivo sem dependência de banco nem de tela — assim dá
// para testar e para usar em qualquer lugar.

export const SENHA_MINIMA = 8;

// Alfabeto sem os caracteres que se confundem quando alguém dita ou copia a
// senha à mão: 0/O, 1/l/I. Senha provisória é lida em voz alta com frequência.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

const TAMANHO_SUGERIDO = 14;

// Senha provisória sugerida pela tela: aleatória, para o Administrador não cair
// em "Intertech123". Quem recebe é obrigado a trocar no primeiro acesso.
export function senhaSugerida(): string {
  const sorteio = new Uint32Array(TAMANHO_SUGERIDO);
  crypto.getRandomValues(sorteio);
  return Array.from(sorteio, (n) => ALFABETO[n % ALFABETO.length]).join("");
}

export function senhaAceitavel(senha: string): boolean {
  return senha.length >= SENHA_MINIMA;
}
