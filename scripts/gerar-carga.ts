// Gera os arquivos SQL da CARGA INICIAL a partir da planilha (Sprint 14).
//
// Uso: npx tsx scripts/gerar-carga.ts <planilha.xlsx> <pasta-saida>
//
// Decisões de migração (alinhadas ao PRD §6.10 e ao relatório 05):
//  1. Pseudo-insumos "Produto X" viram COMPONENTE-PRODUTO (kit em cascata)
//     quando o nome bate com um produto; senão entram como insumo estático
//     e ficam sinalizados no relatório.
//  2. A quantidade de cada componente-insumo é derivada do CUSTO da planilha
//     (qtd = custo ÷ preço sem imposto). Nas fichas normais isso é idêntico à
//     quantidade original; nas 45 fichas com fórmula especial, reproduz o
//     custo REAL da planilha (a coluna Custo é a verdade).
//  3. product_costs recebe o CMV da planilha (Σ coluna Custo) como vigente.
//  4. Alocação: período 2026-07 com os R$ 450.000 COMO ESTÃO (mensal/anual a
//     confirmar com o financeiro — pendência registrada). Produtos casados por
//     nome exato e, depois, por grafia normalizada.
//  5. Nada é corrigido em silêncio: tudo que não casou vai para o resumo.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Decimal, precoSemImposto } from "../lib/calculations";
import { extrairAlocacao, extrairInsumos, extrairProdutos } from "../lib/import/extract";
import { carregarXlsx } from "../lib/import/exceljs-loader";

const TENANT = "00000000-0000-0000-0000-000000000001";

function esc(s: string): string {
  return s.replace(/'/g, "''");
}
function normalizar(nome: string): string {
  return nome.trim().replace(/\s+/g, " ").toLowerCase();
}

async function main() {
  const [, , caminho, saida = "carga-sql"] = process.argv;
  if (!caminho) {
    console.error("Uso: npx tsx scripts/gerar-carga.ts <planilha.xlsx> <pasta-saida>");
    process.exit(1);
  }
  mkdirSync(saida, { recursive: true });

  const planilha = await carregarXlsx(caminho);
  const insumos = extrairInsumos(planilha);
  const produtos = extrairProdutos(planilha, insumos);
  const alocacao = extrairAlocacao(planilha);

  // --- Classificação dos insumos: reais × pseudo ("Produto X") ---
  const nomesProdutoNorm = new Map<string, number>(); // nome normalizado -> índice do produto
  produtos.forEach((p, idx) => {
    if (!nomesProdutoNorm.has(normalizar(p.nome))) nomesProdutoNorm.set(normalizar(p.nome), idx);
  });

  const pseudoParaProduto = new Map<number, number>(); // linhaInsumo -> índice do produto alvo
  const pseudoSemAlvo: string[] = [];
  const insumosReais = insumos.filter((ins) => {
    const m = /^produto\s+(.+)$/i.exec(ins.nome.trim());
    if (!m) return true;
    // O alvo verdadeiro é identificado pelo VALOR: o preço do pseudo-insumo é a
    // referência viva ao CMV de um produto — na planilha, sempre a variante Não
    // Estéril. Casar por nome erraria a variante; casar por valor acerta exato.
    const alvoPorValor = produtos.findIndex((pp) =>
      pp.cmvPlanilhaCusto.minus(ins.precoComImposto).abs().lt("0.000001")
    );
    const alvo = alvoPorValor >= 0 ? alvoPorValor : nomesProdutoNorm.get(normalizar(m[1]));
    if (alvo !== undefined) {
      pseudoParaProduto.set(ins.linha, alvo);
      return false; // vira componente-produto, não insumo
    }
    pseudoSemAlvo.push(ins.nome);
    return true; // sem alvo: mantém como insumo estático (sinalizado)
  });

  const precoSemPorLinha = new Map<number, Decimal>();
  for (const ins of insumos) {
    precoSemPorLinha.set(ins.linha, precoSemImposto(ins.precoComImposto, ins.icms, ins.pisCofins));
  }

  // Números com 12 dígitos significativos: compacto e com erro desprezível
  // (< 1e-10 relativo, muito abaixo da tolerância de R$ 0,01 da reconciliação).
  const num = (d: Decimal) => d.toSignificantDigits(12).toString();

  // --- Mapeamentos e linhas ---
  const mIns = insumosReais.map((i, k) =>
    `(${k + 1},'${esc(i.nome)}',${num(i.icms)},${num(i.pisCofins)},${num(i.precoComImposto)},${num(precoSemPorLinha.get(i.linha)!)})`
  );
  const rnPorLinhaInsumo = new Map(insumosReais.map((i, k) => [i.linha, k + 1]));
  const mProd = produtos.map((p, idx) => `(${idx + 1},'${esc(p.nome)}')`);

  const fIns: string[] = []; // (prn, irn, qtd)
  const fProd: string[] = []; // (prn, alvorn, qtd)
  let compDescartados = 0;
  produtos.forEach((p, idx) => {
    for (const c of p.consumos) {
      const alvoIdx = pseudoParaProduto.get(c.linhaInsumo);
      if (alvoIdx !== undefined) {
        if (alvoIdx === idx) continue; // auto-referência: descarta (seria ciclo)
        fProd.push(`(${idx + 1},${alvoIdx + 1},${num(c.quantidade)})`);
        continue;
      }
      const precoSem = precoSemPorLinha.get(c.linhaInsumo) ?? new Decimal(0);
      // Quantidade derivada do custo (decisão 2); fallback: quantidade da célula.
      let qtd = c.quantidade;
      if (c.custoPlanilha && precoSem.gt(0)) qtd = c.custoPlanilha.div(precoSem);
      if (qtd.lte(0)) {
        compDescartados++;
        continue;
      }
      fIns.push(`(${idx + 1},${rnPorLinhaInsumo.get(c.linhaInsumo)!},${num(qtd)})`);
    }
  });

  const custos = produtos.map((p, idx) => `(${idx + 1},${num(p.cmvPlanilhaCusto)})`);

  const idxPorNomeExato = new Map<string, number>();
  const idxPorNomeNorm = new Map<string, number>();
  produtos.forEach((p, idx) => {
    if (!idxPorNomeExato.has(p.nome)) idxPorNomeExato.set(p.nome, idx + 1);
    if (!idxPorNomeNorm.has(normalizar(p.nome))) idxPorNomeNorm.set(normalizar(p.nome), idx + 1);
  });
  const linhasAloc: string[] = [];
  const alocSemProduto: string[] = [];
  const idxUsados = new Set<number>();
  for (const a of alocacao) {
    const i = idxPorNomeExato.get(a.nome) ?? idxPorNomeNorm.get(normalizar(a.nome));
    if (!i || !a.producao || !a.fator) {
      alocSemProduto.push(a.nome);
      continue;
    }
    if (idxUsados.has(i)) continue; // duplicata na alocação: primeira vence
    idxUsados.add(i);
    linhasAloc.push(`(${i},${num(a.producao)},${num(a.fator)})`);
  }

  // --- SQL único e atômico (tabelas temporárias na mesma sessão) ---
  const sql = `-- CARGA INICIAL da planilha (Sprint 14). Atômica: falhou, nada entra.
begin;
create temp table m_ins(rn int, nome text, icms numeric, pis numeric, pcom numeric, psem numeric) on commit drop;
insert into m_ins values\n${mIns.join(",\n")};
create temp table m_prod(rn int, nome text) on commit drop;
insert into m_prod values\n${mProd.join(",\n")};
create temp table f_ins(prn int, irn int, qtd numeric) on commit drop;
insert into f_ins values\n${fIns.join(",\n")};
create temp table f_prod(prn int, alvorn int, qtd numeric) on commit drop;
insert into f_prod values\n${fProd.join(",\n")};
create temp table m_custo(prn int, cmv numeric) on commit drop;
insert into m_custo values\n${custos.join(",\n")};
create temp table m_aloc(prn int, prod numeric, fator numeric) on commit drop;
insert into m_aloc values\n${linhasAloc.join(",\n")};

insert into inputs (tenant_id, name, icms_rate, pis_cofins_rate, price_with_tax, price_without_tax, price_updated_at)
select '${TENANT}', nome, icms, pis, pcom, psem, now() from m_ins;

insert into products (tenant_id, code, name)
select '${TENANT}', 'P'||lpad(rn::text,3,'0'), nome from m_prod;

insert into product_components (tenant_id, product_id, component_input_id, quantity_type, quantity, computed_quantity)
select '${TENANT}', p.id, i.id, 'direct', f.qtd, f.qtd
from f_ins f
join products p on p.code = 'P'||lpad(f.prn::text,3,'0') and p.tenant_id = '${TENANT}'
join m_ins mi on mi.rn = f.irn
join inputs i on i.name = mi.nome and i.tenant_id = '${TENANT}';

insert into product_components (tenant_id, product_id, component_product_id, quantity_type, quantity, computed_quantity)
select '${TENANT}', p.id, alvo.id, 'direct', f.qtd, f.qtd
from f_prod f
join products p on p.code = 'P'||lpad(f.prn::text,3,'0') and p.tenant_id = '${TENANT}'
join products alvo on alvo.code = 'P'||lpad(f.alvorn::text,3,'0') and alvo.tenant_id = '${TENANT}';

insert into product_costs (tenant_id, product_id, cmv)
select '${TENANT}', p.id, c.cmv
from m_custo c
join products p on p.code = 'P'||lpad(c.prn::text,3,'0') and p.tenant_id = '${TENANT}';

-- Período de alocação 2026-07 com os R$ 450.000 COMO ESTÃO (mensal/anual a confirmar)
insert into expense_allocation_periods (tenant_id, period, total_expense)
values ('${TENANT}','2026-07-01',450000);
insert into expense_allocations (tenant_id, period_id, product_id, estimated_production, complexity_factor)
select '${TENANT}', per.id, p.id, a.prod, a.fator
from m_aloc a
join products p on p.code = 'P'||lpad(a.prn::text,3,'0') and p.tenant_id = '${TENANT}'
cross join (select id from expense_allocation_periods where tenant_id = '${TENANT}' and period = '2026-07-01') per;
commit;
`;
  writeFileSync(join(saida, "carga.sql"), sql);

  // --- Resumo ---
  console.log(`Insumos reais: ${insumosReais.length} (pseudo→produto: ${pseudoParaProduto.size}; pseudo sem alvo: ${pseudoSemAlvo.length})`);
  if (pseudoSemAlvo.length) console.log(`  pseudo sem alvo: ${pseudoSemAlvo.join(" | ")}`);
  console.log(`Produtos: ${produtos.length}`);
  console.log(`Componentes: ${fIns.length} insumo + ${fProd.length} produto (descartados: ${compDescartados})`);
  console.log(`Alocação: ${linhasAloc.length} produtos casados; sem correspondência: ${alocSemProduto.length}`);
  if (alocSemProduto.length) console.log(`  sem correspondência: ${alocSemProduto.join(" | ")}`);
  console.log(`SQL gerado em ${saida}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
