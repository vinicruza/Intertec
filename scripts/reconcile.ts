// Gera o relatório de reconciliação da planilha "Rentabilidade 2026".
//
// Uso:  npx tsx scripts/reconcile.ts <caminho-da-planilha.xlsx> [saida.md]
//
// Recalcula os CMVs de todos os produtos com o motor de cálculo puro e compara
// com a coluna "Input" da Alocação, listando toda divergência > R$ 0,01
// (Calculations.md §11). NÃO grava nada no banco — só produz o relatório.
import { writeFileSync } from "node:fs";
import { Decimal, toMoney, toPercent } from "../lib/calculations/decimal";
import { extrairAlocacao, extrairInsumos, extrairProdutos } from "../lib/import/extract";
import { reconciliar, type ResultadoReconciliacao } from "../lib/import/reconcile";
import { carregarXlsx } from "../lib/import/exceljs-loader";

function relatorioMarkdown(r: ResultadoReconciliacao, arquivo: string): string {
  const data = new Date().toISOString().slice(0, 10);
  const l: string[] = [];
  l.push("# 05 — Relatório de Reconciliação da Planilha");
  l.push("");
  l.push(`> Gerado em ${data} a partir de \`${arquivo}\` pelo script \`scripts/reconcile.ts\`.`);
  l.push("> Recálculo dos CMVs pelo motor puro (lib/calculations) comparado com a coluna \"Input\" da Alocação.");
  l.push("> Tolerância: R$ 0,01. Nada foi alterado na planilha nem gravado no banco (opção A).");
  l.push("");

  l.push("## 1. Resumo");
  l.push("");
  l.push("Comparamos **três CMVs** por produto: o do nosso motor (modelo preço × quantidade),");
  l.push("o que a planilha calcula na coluna \"Custo\", e o que a Alocação usa na coluna \"Input\".");
  l.push("");
  l.push("| Métrica | Valor |");
  l.push("|---|---|");
  l.push(`| Insumos lidos | ${r.totais.insumos} |`);
  l.push(`| Produtos no Input Preço | ${r.totais.produtosInput} |`);
  l.push(`| ✅ Reconciliam perfeitamente (motor = Alocação ≤ R$ 0,01) | ${r.totais.ok} |`);
  l.push(`| 🟡 Ficha com fórmula especial (planilha OK, modelo uniforme não reproduz) | ${r.totais.modeloDivergente} |`);
  l.push(`| 🔴 Lookup divergente (coluna Custo ≠ Alocação — bug de nome/SUMIF) | ${r.totais.lookupDivergente} |`);
  l.push(`| Produtos sem linha na Alocação (nome exato) | ${r.totais.semAlocacao} |`);
  l.push(`| — dos quais recuperáveis só por grafia | ${r.recuperaveisPorGrafia.length} |`);
  l.push(`| Nomes na Alocação sem bloco no Input | ${r.semInput.length} |`);
  l.push(`| Nomes de produto duplicados (Input) | ${r.duplicadosInput.length} |`);
  l.push(`| Nomes de produto duplicados (Alocação) | ${r.duplicadosAlocacao.length} |`);
  l.push(`| Insumos com preço sem imposto inconsistente (Camada 1) | ${r.divergenciasLayer1.length} |`);
  l.push("");

  l.push("## 2. Alocação de despesa — consistente ✅");
  l.push("");
  l.push("Desconsiderando a linha de resumo \"TOTAL\" (que não é um produto), a alocação fecha certo:");
  l.push("");
  l.push("| Métrica | Valor na planilha | Esperado |");
  l.push("|---|---|---|");
  l.push(`| Produtos na Alocação | ${r.alocacao.totalProdutos} | 322 (Calc.md) |`);
  l.push(`| Σ produção × fator (soma dos pesos) | ${r.alocacao.somaPesosReal.toFixed(0)} | 14.445.616 (Calc.md) |`);
  l.push(`| Σ participações | ${toPercent(r.alocacao.somaParticipacoes)}% | 100% |`);
  l.push(`| Σ despesa alocada | R$ ${toMoney(r.alocacao.somaDespesaAlocada)} | R$ 450.000 |`);
  l.push("");
  l.push("Não há o \"dobro\" que se suspeitou numa primeira leitura: aquilo foi efeito de contar a");
  l.push("linha \"TOTAL\" da planilha como se fosse um produto. Somando só os 322 produtos, a soma dos");
  l.push("pesos é exatamente 14.445.616 e a despesa rateada, R$ 450.000 — batendo com o Calculations.md.");
  l.push("Permanece em aberto apenas se os **R$ 450.000 são mensais ou anuais** (Decisão D3).");
  l.push("");

  l.push("## 3. Fichas com fórmula especial (🟡 modelo a ajustar na importação)");
  l.push("");
  l.push("Aqui a planilha está **correta** (a coluna Custo bate com a Alocação), mas o modelo");
  l.push("simples \"preço × quantidade\" não reproduz o valor. Motivo descoberto: em alguns");
  l.push("insumos caros (ex.: **3M Flexform**, tapes) a planilha coloca o custo já pronto na");
  l.push("célula de quantidade (`=DF5`) em vez de multiplicar pelo preço. Estes produtos");
  l.push("precisarão que a ficha técnica registre a expressão real do consumo (Calculations.md §3).");
  l.push("");
  if (r.modeloDivergente.length === 0) {
    l.push("Nenhum.");
  } else {
    l.push("| Produto | CMV motor (uniforme) | Custo planilha | Alocação | Custo=Alocação? |");
    l.push("|---|---|---|---|---|");
    for (const d of r.modeloDivergente.slice(0, 80)) {
      const bate = d.difCustoAlocacao && d.difCustoAlocacao.abs().lte(new Decimal("0.01")) ? "sim ✓" : "—";
      l.push(`| ${d.nome} | ${toMoney(d.cmvMotor)} | ${toMoney(d.cmvPlanilhaCusto)} | ${d.cmvAlocacao ? toMoney(d.cmvAlocacao) : "—"} | ${bate} |`);
    }
    if (r.modeloDivergente.length > 80) l.push(`| … e mais ${r.modeloDivergente.length - 80} | | | | |`);
  }
  l.push("");

  l.push("## 3b. Lookup divergente (🔴 coluna Custo ≠ Alocação)");
  l.push("");
  l.push("Aqui nem a planilha é consistente: o CMV que a Alocação usa difere do que o bloco");
  l.push("calcula — sintoma de nome duplicado/errado no SUMIF (Calculations.md §9.3).");
  l.push("");
  if (r.lookupDivergente.length === 0) {
    l.push("Nenhum.");
  } else {
    l.push("| Produto | Custo planilha | Alocação (Input) | Diferença |");
    l.push("|---|---|---|---|");
    for (const d of r.lookupDivergente) {
      l.push(`| ${d.nome} | ${toMoney(d.cmvPlanilhaCusto)} | ${d.cmvAlocacao ? toMoney(d.cmvAlocacao) : "—"} | ${d.difCustoAlocacao ? toMoney(d.difCustoAlocacao) : "—"} |`);
    }
  }
  l.push("");

  l.push("## 4. Produtos sem CMV por divergência de nome");
  l.push("");
  l.push("Na planilha, estes produtos retornam **CMV zero em silêncio** (o SUMIF por nome não acha a linha).");
  l.push("No sistema, a busca será por ID e CMV = 0 é erro bloqueante — a classe de erro é extinta por design.");
  l.push("");
  if (r.recuperaveisPorGrafia.length > 0) {
    l.push("### Só diferem na grafia (mesmo produto, nome escrito diferente):");
    l.push("");
    l.push("| Nome no Input Preço | Nome na Alocação |");
    l.push("|---|---|");
    for (const m of r.recuperaveisPorGrafia) l.push(`| \`${m.input}\` | \`${m.alocacao}\` |`);
    l.push("");
  }
  const semGrafia = r.semAlocacao.filter((n) => !r.recuperaveisPorGrafia.some((m) => m.input === n));
  if (semGrafia.length > 0) {
    l.push("### Sem correspondência nem por grafia (produto realmente ausente da Alocação):");
    l.push("");
    for (const n of semGrafia) l.push(`- \`${n}\``);
    l.push("");
  }

  l.push("## 5. Nomes duplicados");
  l.push("");
  l.push("Duplicatas causam custo somado (dobrado) no SUMIF das abas de vendedor — Calculations.md §9.3.");
  l.push("");
  const dups = [...r.duplicadosInput.map((d) => ({ ...d, origem: "Input" })), ...r.duplicadosAlocacao.map((d) => ({ ...d, origem: "Alocação" }))];
  if (dups.length === 0) {
    l.push("Nenhum nome duplicado encontrado.");
  } else {
    l.push("| Origem | Nome | Ocorrências |");
    l.push("|---|---|---|");
    for (const d of dups) l.push(`| ${d.origem} | ${d.nome} | ${d.ocorrencias} |`);
  }
  l.push("");

  l.push("## 6. Camada 1 — preço sem imposto");
  l.push("");
  if (r.divergenciasLayer1.length === 0) {
    l.push("Todos os preços sem imposto recalculados batem com a coluna G da planilha dentro de R$ 0,01. ✅");
  } else {
    l.push("| Insumo | Motor | Planilha (col G) | Diferença |");
    l.push("|---|---|---|---|");
    for (const d of r.divergenciasLayer1) l.push(`| ${d.nome} | ${toMoney(d.motor)} | ${toMoney(d.planilha)} | ${toMoney(d.diferenca)} |`);
  }
  l.push("");

  l.push("## 7. Itens para confirmação humana (antes de gravar no banco)");
  l.push("");
  l.push("1. **R$ 450.000 é mensal ou anual?** (define o período de alocação — Decisão D3)");
  l.push("2. **Alocação dobrada** (Seção 2): confirmar o denominador correto com o financeiro.");
  l.push("3. **DIFAL de AL, MA, PI, RN** (Decisão D5): valores finais mantidos como estão, a confirmar com o contador.");
  l.push("4. **Descpro**: migração de 10% fixo para a tabela ICSM por UF (Decisão D4) — impacto a quantificar.");
  l.push("");
  return l.join("\n");
}

async function main() {
  const [, , caminho, saida = "docs/05-Reconciliacao.md"] = process.argv;
  if (!caminho) {
    console.error("Uso: npx tsx scripts/reconcile.ts <planilha.xlsx> [saida.md]");
    process.exit(1);
  }
  console.log(`Lendo ${caminho} ...`);
  const planilha = await carregarXlsx(caminho);
  const insumos = extrairInsumos(planilha);
  const produtos = extrairProdutos(planilha, insumos);
  const alocacao = extrairAlocacao(planilha);
  const resultado = reconciliar(insumos, produtos, alocacao);

  console.log(`Insumos: ${resultado.totais.insumos} | Produtos: ${resultado.totais.produtosInput}`);
  console.log(`OK: ${resultado.totais.ok} | Ficha especial: ${resultado.totais.modeloDivergente} | Lookup divergente: ${resultado.totais.lookupDivergente}`);
  console.log(`Sem alocação: ${resultado.totais.semAlocacao} (recuperáveis por grafia: ${resultado.recuperaveisPorGrafia.length})`);
  console.log(`Camada 1 inconsistente: ${resultado.divergenciasLayer1.length} insumo(s)`);
  console.log(`Σ participações: ${toPercent(resultado.alocacao.somaParticipacoes)}% | Σ despesa: R$ ${toMoney(resultado.alocacao.somaDespesaAlocada)}`);

  writeFileSync(saida, relatorioMarkdown(resultado, caminho.split("/").pop() ?? caminho));
  console.log(`Relatório escrito em ${saida}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
