// Confere a BASE DE DADOS do sistema contra a planilha "Rentabilidade 2026".
//
// Uso:  npx tsx scripts/conferir-base.ts <planilha.xlsx> <produtos.tsv> <insumos.tsv> [saida.md]
//
// Os dois .tsv são retratos do banco, gerados pelas consultas abaixo (só
// leitura). Ficam fora do Git: são dados do cliente.
//
//   produtos.tsv   nome <TAB> cmv
//     select p.name || E'\t' || coalesce(round(pc.cmv,6)::text,'SEM_CUSTO')
//       from products p left join product_costs pc on pc.product_id = p.id;
//
//   insumos.tsv    nome <TAB> preco_com_imposto <TAB> preco_sem_imposto
//     select name || E'\t' || round(price_with_tax,6)::text
//            || E'\t' || round(price_without_tax,6)::text from inputs;
//
// Esta conferência é IRMÃ da `validar:pedidos`, não substituta:
//   validar:pedidos  →  "o motor calcula igual à planilha?"
//   conferir:base    →  "o banco tem os mesmos números da planilha?"
// Motor certo sobre base velha erra o orçamento sem nenhum sintoma na tela.
import { readFileSync, writeFileSync } from "node:fs";
import { Decimal } from "../lib/calculations/decimal";
import { carregarXlsx } from "../lib/import/exceljs-loader";
import { conferirBase, type ProdutoBanco, type InsumoBanco } from "../lib/import/base";

function lerProdutos(caminho: string): ProdutoBanco[] {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const [nome, cmv] = l.split("\t");
      return { nome, cmv: cmv === "SEM_CUSTO" ? null : new Decimal(cmv) };
    });
}

function lerInsumos(caminho: string): InsumoBanco[] {
  return readFileSync(caminho, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const p = l.split("\t");
      return {
        nome: p[0],
        precoComImposto: new Decimal(p[1]),
        precoSemImposto: new Decimal(p[p.length - 1]),
      };
    });
}

async function main() {
  const [, , xlsx, tsvProdutos, tsvInsumos, saida] = process.argv;
  if (!xlsx || !tsvProdutos || !tsvInsumos) {
    console.error("Uso: npx tsx scripts/conferir-base.ts <planilha.xlsx> <produtos.tsv> <insumos.tsv> [saida.md]");
    process.exit(1);
  }

  const planilha = await carregarXlsx(xlsx);
  const r = conferirBase(planilha, {
    produtos: lerProdutos(tsvProdutos),
    insumos: lerInsumos(tsvInsumos),
  });

  const l: string[] = [];
  l.push("# Conferência da base de dados — banco × planilha");
  l.push("");
  l.push(`> Gerado em ${new Date().toISOString().slice(0, 10)} a partir de \`${xlsx.split("/").pop()}\`.`);
  l.push("> Nada foi gravado: é só leitura dos dois lados.");
  l.push("");

  const bloco = (titulo: string, c: typeof r.produtos, unidade: string) => {
    l.push(`## ${titulo}`);
    l.push("");
    l.push("| Métrica | Valor |");
    l.push("|---|---|");
    l.push(`| Na planilha, ausentes no sistema | ${c.soNaPlanilha.length} |`);
    l.push(`| No sistema, ausentes na planilha | ${c.soNoBanco.length} |`);
    l.push(`| Nos dois lados | ${c.emAmbos} |`);
    l.push(`| — batem (±${unidade}) | ${c.iguais} |`);
    l.push(`| — divergem | ${c.divergentes.length} |`);
    l.push(`| Nomes duplicados (planilha / banco) | ${c.duplicadosPlanilha.length} / ${c.duplicadosBanco.length} |`);
    l.push("");
    if (c.soNaPlanilha.length) {
      l.push("### Existem na planilha e NÃO no sistema");
      l.push("");
      for (const n of c.soNaPlanilha) l.push(`- \`${n}\``);
      l.push("");
    }
    if (c.soNoBanco.length) {
      l.push("### Existem no sistema e NÃO na planilha");
      l.push("");
      for (const n of c.soNoBanco) l.push(`- \`${n}\``);
      l.push("");
    }
    if (c.divergentes.length) {
      l.push("### Valores diferentes (maior diferença primeiro)");
      l.push("");
      l.push("| Item | Planilha | Sistema | Diferença |");
      l.push("|---|---:|---:|---:|");
      for (const d of c.divergentes) {
        l.push(`| ${d.nome} | ${d.planilha.toFixed(6)} | ${d.banco.toFixed(6)} | ${d.diferenca.toFixed(6)} |`);
      }
      l.push("");
    }
  };

  bloco("Insumos (preço com imposto)", r.insumos, "R$ 0,0001");
  bloco("Produtos (CMV)", r.produtos, "R$ 0,01");

  if (r.semCustoNoBanco.length) {
    l.push("## Produtos sem custo no sistema");
    l.push("");
    l.push("Custo zero é bloqueante no pedido: estes travam o orçamento em vez de sair errados.");
    l.push("");
    for (const n of r.semCustoNoBanco) l.push(`- \`${n}\``);
    l.push("");
  }

  const texto = l.join("\n");
  if (saida) {
    writeFileSync(saida, texto);
    console.log(`Relatório escrito em ${saida}`);
  }

  console.log(
    `Insumos  → só planilha: ${r.insumos.soNaPlanilha.length} | só banco: ${r.insumos.soNoBanco.length} | ` +
      `divergem: ${r.insumos.divergentes.length} de ${r.insumos.emAmbos}`
  );
  console.log(
    `Produtos → só planilha: ${r.produtos.soNaPlanilha.length} | só banco: ${r.produtos.soNoBanco.length} | ` +
      `divergem: ${r.produtos.divergentes.length} de ${r.produtos.emAmbos}`
  );

  // Sai diferente de zero quando a base NÃO está alinhada: serve de portão
  // antes de liberar o sistema para uso real.
  const alinhado =
    r.insumos.soNaPlanilha.length === 0 &&
    r.insumos.divergentes.length === 0 &&
    r.produtos.soNaPlanilha.length === 0 &&
    r.produtos.divergentes.length === 0;
  console.log(alinhado ? "BASE ALINHADA ✅" : "BASE DESALINHADA ❌");
  process.exit(alinhado ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
