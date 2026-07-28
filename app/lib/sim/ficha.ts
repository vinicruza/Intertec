import { lerValorPositivo } from "@calc";

// ============================================================
// Validação da ficha técnica (PRD §6.3 / §7)
// ============================================================
//
// Módulo PURO — sem banco e sem tela, para poder ser testado isolado (regra do
// projeto). Espelha as constraints da migration `catalog`:
//   quantity > 0 · width > 0 · length > 0 · yield_rate > 0 · lot_size > 0
//
// Por que existe: rendimento e tamanho de lote viram DENOMINADOR no motor
// (`1 ÷ lote`, `largura × comprimento ÷ rendimento`). Em branco, a conversão do
// formulário devolvia "0" e o cálculo chegava a 1 ÷ 0 = Infinity. O banco
// recusava — a integridade nunca esteve em risco — mas o usuário só via o erro
// cru do Postgres, sem saber qual campo corrigir.

export type TipoQuantidade = "direct" | "area" | "lot";

// Um componente da ficha como o formulário coleta.
export type ComponenteForm = {
  tipo: "insumo" | "produto";
  refId: string; // id do insumo ou produto-componente
  quantity_type: TipoQuantidade;
  quantity: string; // direta
  width: string; // area
  length: string; // area
  yield_rate: string; // area
  lot_size: string; // lote
};

// Devolve a mensagem do primeiro problema do componente, ou null se válido.
// Rendimento em branco continua valendo 1 (100%, sem perda) — padrão histórico
// do formulário, preservado de propósito.
export function validarComponente(c: ComponenteForm, indice: number): string | null {
  const onde = `Componente ${indice + 1}`;
  if (!c.refId) return `${onde}: escolha o insumo ou produto.`;

  if (c.quantity_type === "area") {
    const campos: Array<[string, string]> = [
      [c.width, "a largura"],
      [c.length, "o comprimento"],
    ];
    if ((c.yield_rate ?? "").trim() !== "") campos.push([c.yield_rate, "o rendimento"]);
    for (const [texto, rotulo] of campos) {
      const r = lerValorPositivo(texto, rotulo);
      if (!r.ok) return `${onde}: ${r.motivo}`;
    }
    return null;
  }

  if (c.quantity_type === "lot") {
    const r = lerValorPositivo(c.lot_size, "o tamanho do lote");
    return r.ok ? null : `${onde}: ${r.motivo}`;
  }

  const r = lerValorPositivo(c.quantity, "a quantidade");
  return r.ok ? null : `${onde}: ${r.motivo}`;
}

// Primeira mensagem de problema na ficha inteira, ou null se estiver válida.
export function validarFicha(componentes: ComponenteForm[]): string | null {
  if (componentes.length === 0) return "A ficha técnica precisa de ao menos um componente.";
  for (let i = 0; i < componentes.length; i++) {
    const msg = validarComponente(componentes[i], i);
    if (msg) return msg;
  }
  return null;
}
