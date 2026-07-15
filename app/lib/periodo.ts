const OFFSET_SAO_PAULO = "-03:00";

// O fechamento é um evento de negócio brasileiro. Os limites do mês devem
// respeitar a meia-noite de São Paulo, não a meia-noite UTC.
export function limitesMesSaoPaulo(mes: string): { inicio: string; fim: string } {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mês inválido; use YYYY-MM.");
  const [ano, numeroMes] = mes.split("-").map(Number);
  if (numeroMes < 1 || numeroMes > 12) throw new Error("Mês inválido; use YYYY-MM.");
  const proximo = numeroMes === 12
    ? `${ano + 1}-01`
    : `${ano}-${String(numeroMes + 1).padStart(2, "0")}`;
  return {
    inicio: new Date(`${mes}-01T00:00:00${OFFSET_SAO_PAULO}`).toISOString(),
    fim: new Date(`${proximo}-01T00:00:00${OFFSET_SAO_PAULO}`).toISOString(),
  };
}
