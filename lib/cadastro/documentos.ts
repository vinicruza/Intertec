// ============================================================
// Documentos e contatos do cadastro (formulário de pedido — 05/08/2026)
// ============================================================
//
// CNPJ, CEP e telefone entram no sistema porque estão no formulário de papel
// que hoje acompanha o pedido até a mesa da conferência. Nada aqui é cálculo
// financeiro; mesmo assim é módulo puro e testado, pela mesma razão de sempre:
// um CNPJ com dígito errado só aparece quando a nota é recusada, e aí o pedido
// já saiu.
//
// Regra de armazenamento: o banco guarda SÓ DÍGITOS. A máscara é enfeite de
// tela e muda com o gosto de quem digita — "11.222.333/0001-81",
// "11222333000181" e "11 222 333 0001 81" são o mesmo documento, e guardar a
// pontuação faria três cadastros do mesmo cliente.

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

// ------------------------------------------------------------------
// CPF e CNPJ
// ------------------------------------------------------------------

// Dígito verificador por soma ponderada, módulo 11 — a regra da Receita.
// Recebe os dígitos da base e os pesos, devolve o dígito esperado.
function digitoModulo11(base: string, pesos: number[]): number {
  const soma = pesos.reduce((s, peso, i) => s + Number(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return false;
  // 111.111.111-11 e afins passam no módulo 11 por acidente aritmético; são
  // recusados porque não existem como documento.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const primeiro = digitoModulo11(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (primeiro !== Number(d[9])) return false;
  const segundo = digitoModulo11(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return segundo === Number(d[10]);
}

export function cnpjValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const primeiro = digitoModulo11(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (primeiro !== Number(d[12])) return false;
  const segundo = digitoModulo11(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return segundo === Number(d[13]);
}

// O cadastro aceita os dois: a Intertech vende para hospital (CNPJ) e para
// profissional autônomo (CPF). O tamanho decide qual regra vale.
export function cnpjCpfValido(valor: string | null | undefined): boolean {
  const d = somenteDigitos(valor);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

export function formatarCnpjCpf(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  // Documento incompleto sai como foi digitado, sem inventar pontuação em
  // cima de um número que ainda não fecha.
  return d;
}

// ------------------------------------------------------------------
// CEP
// ------------------------------------------------------------------

export function cepValido(valor: string | null | undefined): boolean {
  return somenteDigitos(valor).length === 8;
}

export function formatarCep(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

// ------------------------------------------------------------------
// Telefone
// ------------------------------------------------------------------

// Aceita fixo (10 dígitos) e celular (11). O 9 na frente do celular já vem
// digitado — o sistema não o acrescenta, porque números antigos de fixo com
// DDD de 2 dígitos ficariam errados.
export function telefoneValido(valor: string | null | undefined): boolean {
  const n = somenteDigitos(valor).length;
  return n === 10 || n === 11;
}

export function formatarTelefone(valor: string | null | undefined): string {
  const d = somenteDigitos(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

// ------------------------------------------------------------------
// E-mail
// ------------------------------------------------------------------

// Deliberadamente frouxa. Validar e-mail por expressão regular é uma briga
// perdida — a única prova de que um endereço existe é mandar mensagem para
// ele. Aqui só se pega o erro de digitação grosseiro (sem @, sem domínio,
// com espaço no meio).
export function emailPlausivel(valor: string | null | undefined): boolean {
  const v = (valor ?? "").trim();
  if (v === "") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}
