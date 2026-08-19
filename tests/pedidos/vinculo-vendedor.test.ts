import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// O vínculo entre o acesso e o vendedor é por IGUALDADE DE NOME. Uma letra de
// diferença deixa quem lança em nome próprio com a lista de vendedores vazia —
// sem canal, sem regra de comissão, e a simulação nunca sai do "incompleto".
// Em 19/08/2026 isso travou duas vendedoras ("Suelen" x "Suellen",
// "Natalia" x "Nathalia") sem nenhuma mensagem que explicasse o motivo.
//
// Enquanto o vínculo for por nome, estas duas defesas precisam continuar de pé:
// o painel de integridade conta o problema, e a tela diz o que houve.
describe("vendedor sem vínculo com o acesso", () => {
  it("o painel de integridade conta usuários do comercial sem vendedor", () => {
    const sql = readFileSync(
      "supabase/migrations/20260819150000_integridade_vendedor_sem_vinculo.sql",
      "utf8"
    );
    expect(sql).toMatch(/'commercial_users_without_seller'/);
    expect(sql).toMatch(/p\.role='comercial'/);
    expect(sql).toMatch(/lower\(btrim\(s\.name\)\)=lower\(btrim\(p\.full_name\)\)/);
  });

  it("o simulador explica o problema em vez de pedir para preencher o vendedor", () => {
    const tela = readFileSync("app/pages/SimuladorPage.tsx", "utf8");
    expect(tela).toMatch(/const semVendedorVinculado = soMeuVendedor/);
    // O aviso genérico não pode aparecer junto: ele manda preencher um campo
    // que a pessoa não consegue preencher.
    expect(tela).toMatch(/estado === "incompleto" && !semVendedorVinculado/);
    expect(tela).toMatch(/não está vinculado a nenhum vendedor cadastrado/);
  });
});
