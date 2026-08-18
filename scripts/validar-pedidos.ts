// Confere o motor de cálculo do sistema contra as abas de vendedor da planilha
// "Rentabilidade 2026" (Camada 4 — Calculations.md §6, §7, §8).
//
// Uso:  npx tsx scripts/validar-pedidos.ts <planilha.xlsx> [saida.md]
//
// Para cada uma das 12 abas: lê o pedido vivo, roda `calcularPedido` com os
// mesmos insumos e compara linha a linha. NÃO grava no banco nem altera a
// planilha — só produz o relatório.
import { writeFileSync } from "node:fs";
import { Decimal, toMoney, toPercent } from "../lib/calculations/decimal";
import { carregarXlsx } from "../lib/import/exceljs-loader";
import { extrairPedidos, extrairTabelasFiscais } from "../lib/import/pedidos";
import {
  CANAIS,
  conferirPedidos,
  conferirTabelasFiscais,
  type ConferenciaPedido,
} from "../lib/import/conferencia";

function valor(d: Decimal | null, percentual: boolean): string {
  if (d === null) return "—";
  return percentual ? `${toPercent(d)}%` : `R$ ${toMoney(d)}`;
}

function relatorio(
  conferencias: ConferenciaPedido[],
  achadosTabelas: ReturnType<typeof conferirTabelasFiscais>,
  arquivo: string
): string {
  const data = new Date().toISOString().slice(0, 10);
  const l: string[] = [];

  l.push("# Validação do motor de cálculo contra as abas de vendedor");
  l.push("");
  l.push(`> Gerado em ${data} a partir de \`${arquivo}\` por \`scripts/validar-pedidos.ts\`.`);
  l.push("> Para cada aba, o pedido vivo foi recalculado por `lib/calculations/order.ts`");
  l.push("> com os mesmos insumos da planilha (receita, CMV, frete, UF) e comparado linha a linha.");
  l.push("> Tolerância: R$ 0,01 em dinheiro e 0,01 ponto percentual em margem.");
  l.push("> Nada foi gravado no banco nem alterado na planilha.");
  l.push("");

  const bloqueadas = conferencias.filter((c) => c.bloqueio !== null);
  const conferidas = conferencias.filter((c) => c.bloqueio === null);
  const iguais = conferidas.filter((c) => c.divergencias.length === 0);

  l.push("## 1. Resumo");
  l.push("");
  l.push("| Métrica | Valor |");
  l.push("|---|---|");
  l.push(`| Abas de pedido lidas | ${conferencias.length} |`);
  l.push(`| ✅ Reproduzem a planilha em todas as linhas | ${iguais.length} |`);
  l.push(`| 🟡 Divergem em ao menos uma linha | ${conferidas.length - iguais.length} |`);
  l.push(`| 🔴 Recusadas pelo motor (bloqueio de cálculo) | ${bloqueadas.length} |`);
  l.push(`| Achados nas tabelas de parâmetro | ${achadosTabelas.length} |`);
  l.push("");

  l.push("## 2. Pedidos recusados pelo motor");
  l.push("");
  if (bloqueadas.length === 0) {
    l.push("Nenhum.");
  } else {
    l.push("O motor recusa o que a planilha aceitava em silêncio (regra T9).");
    l.push("");
    l.push("| Aba | Cliente | UF | Motivo |");
    l.push("|---|---|---|---|");
    for (const c of bloqueadas) {
      l.push(`| ${c.aba} | ${c.cliente ?? "—"} | ${c.uf ?? "—"} | ${c.bloqueio} |`);
    }
  }
  l.push("");

  l.push("## 3. Conferência linha a linha");
  l.push("");
  for (const c of conferidas) {
    const canal = CANAIS[c.aba];
    l.push(`### ${c.aba}${c.divergencias.length === 0 ? " ✅" : " 🟡"}`);
    l.push("");
    l.push(
      `Cliente: **${c.cliente ?? "—"}** · UF: **${c.uf ?? "—"}** · itens: ${c.itens} · ` +
        `canal: DIFAL ${canal?.aplicaDifal ? "sim" : "não"}, ` +
        `comissão ${canal ? toPercent(canal.aliquotaComissao) : "—"}%` +
        `${canal?.freteViaPortal ? ", frete por % do Portal" : ""}`
    );
    l.push("");
    l.push("| Linha | Sistema | Planilha | Diferença |");
    l.push("|---|---|---|---|");
    for (const ln of c.linhas) {
      const marca = ln.bate ? "" : " ⚠️";
      l.push(
        `| ${ln.campo}${marca} | ${valor(ln.sistema, ln.percentual)} | ` +
          `${valor(ln.planilha, ln.percentual)} | ${valor(ln.diferenca, ln.percentual)} |`
      );
    }
    l.push("");
  }

  l.push("## 4. Tabelas de parâmetro (ICSM, DIFAL, Portal)");
  l.push("");
  if (achadosTabelas.length === 0) {
    l.push("Nenhum achado. ✅");
  } else {
    l.push("| Tabela | UF | Achado | Esperado | Encontrado |");
    l.push("|---|---|---|---|---|");
    for (const a of achadosTabelas) {
      l.push(
        `| ${a.tabela} | ${a.uf} | ${a.descricao} | ` +
          `${a.esperado ? toPercent(a.esperado) + "%" : "—"} | ` +
          `${a.encontrado ? toPercent(a.encontrado) + "%" : "—"} |`
      );
    }
  }
  l.push("");

  return l.join("\n");
}

async function main() {
  const [, , caminho, saida] = process.argv;
  if (!caminho) {
    console.error("Uso: npx tsx scripts/validar-pedidos.ts <planilha.xlsx> [saida.md]");
    process.exit(1);
  }

  console.log(`Lendo ${caminho} ...`);
  const planilha = await carregarXlsx(caminho);
  const pedidos = extrairPedidos(planilha);
  const tabelas = extrairTabelasFiscais(planilha);
  const conferencias = conferirPedidos(pedidos, tabelas);
  const achadosTabelas = conferirTabelasFiscais(tabelas);

  const bloqueadas = conferencias.filter((c) => c.bloqueio !== null);
  const conferidas = conferencias.filter((c) => c.bloqueio === null);
  const iguais = conferidas.filter((c) => c.divergencias.length === 0);

  console.log(
    `Abas: ${conferencias.length} | iguais: ${iguais.length} | ` +
      `divergentes: ${conferidas.length - iguais.length} | recusadas: ${bloqueadas.length}`
  );
  for (const c of conferidas) {
    if (c.divergencias.length === 0) continue;
    console.log(`  ${c.aba}: ${c.divergencias.map((d) => d.campo).join(", ")}`);
  }
  for (const c of bloqueadas) console.log(`  ${c.aba}: BLOQUEIO — ${c.bloqueio}`);
  console.log(`Tabelas de parâmetro: ${achadosTabelas.length} achado(s)`);

  const texto = relatorio(conferencias, achadosTabelas, caminho.split("/").pop() ?? caminho);
  if (saida) {
    writeFileSync(saida, texto);
    console.log(`Relatório escrito em ${saida}`);
  } else {
    console.log("\n" + texto);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
