import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================
// As regras do pedido e do kit que só existem no banco
// ============================================================
//
// Metade do fluxo do vendedor é decidida em SQL: quem pode editar uma cotação
// em aberto, quando o código do kit nasce, e o que acontece quando duas
// pessoas montam a mesma composição. Nada disso passa pelo motor em
// TypeScript, e o projeto não sobe Postgres no CI — então estes testes leem as
// migrações e conferem que a regra escrita continua sendo a regra combinada.
//
// Não substituem um teste contra o banco de verdade; pegam o caso mais comum
// de regressão neste repositório, que é uma migração nova reescrever uma
// função e deixar cair uma cláusula (já aconteceu: a auditoria SECURITY
// INVOKER que travou todas as aprovações, corrigida em 30/07/2026).

const DIR = join(import.meta.dirname, "../../supabase/migrations");

const MIGRACOES = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => ({ nome: f, sql: readFileSync(join(DIR, f), "utf8") }));

// A definição VIGENTE de uma função é a última, na ordem das migrações.
function definicaoVigente(nomeDaFuncao: string): string {
  const inicio = new RegExp(`create or replace function public\\.${nomeDaFuncao}\\s*\\(`, "i");
  let encontrada: string | null = null;
  for (const m of MIGRACOES) {
    const partes = m.sql.split(inicio);
    if (partes.length > 1) encontrada = partes[partes.length - 1];
  }
  if (encontrada === null) throw new Error(`Função ${nomeDaFuncao} não existe em nenhuma migração.`);
  // Corta no fim do corpo ($$;) para não arrastar o resto do arquivo.
  const fim = encontrada.indexOf("$$;");
  return fim === -1 ? encontrada : encontrada.slice(0, fim);
}

const TODAS = MIGRACOES.map((m) => m.sql).join("\n");

describe("identidade do kit: uma composição, um código", () => {
  it("a assinatura é única por tenant — o banco não deixa duplicar composição", () => {
    expect(TODAS).toMatch(/unique\s*\(tenant_id,\s*signature\)/i);
  });

  it("o código do kit é gerado no formato KC + 4 dígitos, igual à trava da tabela", () => {
    // A trava exige KC seguido de pelo menos 4 dígitos...
    expect(TODAS).toMatch(/kits_semantic_code check \(code ~ '\^KC\[0-9\]\{4,\}\$'\)/i);
    // ...e o gerador usa exatamente o prefixo KC com 4 casas.
    const gerador = definicaoVigente("set_kit_code");
    expect(gerador).toMatch(/next_category_code\(new\.tenant_id,\s*'KC'\)/i);
    expect(definicaoVigente("next_category_code")).toMatch(/lpad\(v_next::text,\s*4,\s*'0'\)/i);
  });

  it("o próximo número olha produtos E kits — dois catálogos, uma sequência por prefixo", () => {
    const proximo = definicaoVigente("next_category_code");
    expect(proximo).toMatch(/from public\.products/i);
    expect(proximo).toMatch(/from public\.kits/i);
    // Trava de concorrência: dois pedidos fechados ao mesmo tempo não podem
    // receber o mesmo código.
    expect(proximo).toMatch(/pg_advisory_xact_lock/i);
  });
});

describe("gravar kit pela tela de Kits", () => {
  const salvar = definicaoVigente("save_kit_with_items");

  it("composição repetida não grava: devolve 'duplicado' para a tela avisar", () => {
    expect(salvar).toMatch(/'tipo',\s*'duplicado'/);
    expect(salvar).toMatch(/where tenant_id = v_tenant_id\s*\n\s*and signature = p_signature/i);
  });

  it("o aviso de duplicidade leva o CÓDIGO do kit — nome de kit não identifica nada", () => {
    // Duas saídas: a checagem antes de gravar e o resgate do unique_violation.
    const avisos = salvar.match(/'kitExistente',\s*jsonb_build_object\([\s\S]*?\)/g) ?? [];
    expect(avisos.length).toBeGreaterThanOrEqual(2);
    for (const aviso of avisos) expect(aviso).toMatch(/'code'/);
  });

  it("kit sem nome, sem assinatura ou sem itens é recusado", () => {
    expect(salvar).toMatch(/Nome do kit é obrigatório/);
    expect(salvar).toMatch(/Assinatura do kit é obrigatória/);
    expect(salvar).toMatch(/Kit deve possuir ao menos um item/);
  });

  it("a corrida entre duas pessoas gravando a mesma composição vira aviso, não erro cru", () => {
    expect(salvar).toMatch(/when unique_violation then/i);
  });

  it("composição de kit que nasceu de pedido ganho não muda mais", () => {
    // O código já foi para o papel e para a nota: se a composição mudar, ele
    // deixa de valer para quem o recebeu, e cotações em aberto que usam o kit
    // passam a valer outro custo sem aviso. Nome e descrição seguem livres.
    expect(salvar).toMatch(/source_order_id is not null[\s\S]*signature is distinct from p_signature/i);
    expect(salvar).toMatch(/nasceu de um pedido ganho/);
  });
});

describe("kit montado dentro do pedido", () => {
  const materializar = definicaoVigente("materialize_ad_hoc_kits");

  it("o código oficial só nasce no fechamento, reaproveitando o kit que já existe", () => {
    // A ordem é a regra: procura a assinatura, e só insere se NÃO achou. Se
    // achou, usa o kit que já existe — "se vender esse mesmo kit futuramente
    // vai ser o mesmo código" (reunião 16/07/2026).
    const consulta = materializar.search(/select id into v_kit_id from public\.kits/i);
    const guarda = materializar.search(/not found/i);
    const insercao = materializar.search(/insert into public\.kits/i);
    expect(consulta).toBeGreaterThanOrEqual(0);
    expect(guarda).toBeGreaterThan(consulta);
    expect(insercao).toBeGreaterThan(guarda);
  });

  it("kit nascido de pedido guarda de qual pedido veio (rastreabilidade, 30/07/2026)", () => {
    expect(materializar).toMatch(/source_order_id/);
    expect(materializar).toMatch(/created_by/);
  });

  it("kit montado sem assinatura é erro — nunca vira kit anônimo", () => {
    expect(materializar).toMatch(/Kit montado sem assinatura/);
  });

  it("depois de materializar, o item aponta para o kit e larga as colunas provisórias", () => {
    expect(materializar).toMatch(/set kit_id = v_kit_id[\s\S]*ad_hoc_kit_signature = null/i);
  });

  it("a embalagem do kit vai junto, com o modo de consumo (envelope × caixa rateada)", () => {
    expect(materializar).toMatch(/insert into public\.kit_packaging[\s\S]*quantity_type/i);
  });

  it("devolve QUAIS kits nasceram, não só quantos — para a tela dizer o código", () => {
    // Sem isto, quem fecha o pedido tem de ir procurar na tela de Kits o
    // código do que acabou de criar.
    expect(materializar).toMatch(/'code',\s*\(select code from public\.kits/i);
    expect(materializar).toMatch(/'novo',\s*v_novo/i);
  });
});

describe("item do pedido: produto, kit ou kit montado na hora — nunca dois", () => {
  it("a trava do banco exige exatamente uma das três naturezas", () => {
    expect(TODAS).toMatch(/num_nonnulls\(product_id,\s*kit_id,\s*ad_hoc_kit_composition\)\s*=\s*1/i);
  });
});

describe("ciclo da cotação", () => {
  const gravar = definicaoVigente("save_quote_revision");

  it("cotação já ganha ou perdida não pode ser reescrita", () => {
    expect(gravar).toMatch(/Só é possível editar cotação em aberto/i);
  });

  it("toda gravação empilha uma versão — o histórico do que foi cotado", () => {
    expect(gravar).toMatch(/insert into public\.order_versions/i);
    expect(gravar).toMatch(/coalesce\(max\(version\),\s*0\)\s*\+\s*1/i);
  });

  it("cotação sem itens é recusada", () => {
    expect(gravar).toMatch(/Cotação sem itens/);
  });

  it("confere que todos os itens foram gravados antes de dar por feito", () => {
    expect(gravar).toMatch(/Nem todos os itens da cotação foram persistidos/);
  });

  it("quem enviou a cotação não pode aprová-la", () => {
    expect(definicaoVigente("decide_order_approval")).toMatch(
      /submitted_by = auth\.uid\(\)[\s\S]*raise exception/i
    );
  });

  it("expedição e condições não travam salvar, mas travam o envio para aprovação", () => {
    const enviar = definicaoVigente("submit_order_for_approval");
    expect(gravar).toMatch(/carrier_id = v_carrier_id/i);
    expect(gravar).toMatch(/payment_term_id = v_payment_term_id/i);
    expect(enviar).toMatch(/v_order\.carrier_id is null[\s\S]*transportadora/i);
    expect(enviar).toMatch(/v_order\.payment_term_id is null and v_order\.payment_term_days is null[\s\S]*modo de pagamento/i);
    expect(enviar).toMatch(/v_order\.shipping_zip is null and v_customer_shipping_zip is null[\s\S]*CEP de entrega/i);
  });

  it("só vermelho e amarelo dependem de aprovação; verde e azul fecham direto pelo selo", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    expect(fechar).toMatch(/v_margin_pct := case when v_net = 0 then 0 else v_margin \/ v_net end/i);
    expect(fechar).toMatch(/v_margin_pct > 0\.50/i);
    expect(fechar).toMatch(/v_role in \('admin', 'comercial'\)/i);
    expect(fechar).toMatch(/approval_status=case when v_self_approved_by_margin then 'aprovado'::approval_status/i);
  });
});

describe("comercial lança pedido em nome próprio", () => {
  const meuVendedor = definicaoVigente("meu_vendedor");
  const trava = definicaoVigente("assert_vendedor_do_proprio_acesso");

  it("resolve o vendedor do Comercial pelo nome do próprio perfil, sem vínculo manual", () => {
    expect(meuVendedor).toMatch(/join public\.profiles p/i);
    expect(meuVendedor).toMatch(/lower\(btrim\(s\.name\)\)\s*=\s*lower\(btrim\(p\.full_name\)\)/i);
    expect(TODAS).toMatch(/drop function if exists public\.vincular_vendedor/i);
    expect(TODAS).toMatch(/drop column if exists profile_id/i);
  });

  it("Administrador pode lançar por qualquer vendedor, mas Comercial não", () => {
    expect(trava).toMatch(/v_role is distinct from 'comercial'[\s\S]*return new/i);
    expect(trava).toMatch(/v_meu_vendedor := public\.meu_vendedor\(\)/i);
    expect(trava).toMatch(/new\.seller_id is distinct from v_meu_vendedor/i);
    expect(trava).toMatch(/Não foi possível salvar o pedido\. Procure um Administrador/i);
  });

  it("Comercial não consegue trocar canal nem comissão pela requisição", () => {
    expect(trava).toMatch(/select s\.channel_id,\s*c\.default_commission_rate/i);
    expect(trava).toMatch(/new\.channel_id is distinct from v_channel_id/i);
    expect(trava).toMatch(/new\.commission_rate is null or abs\(new\.commission_rate - v_default_commission\)/i);
    expect(trava).not.toMatch(/Comercial só pode|Comissão só pode|nome próprio|canal do próprio vendedor/i);
    expect(TODAS).toMatch(/before insert or update of seller_id,\s*channel_id,\s*commission_rate on public\.orders/i);
  });
});

describe("visibilidade de pedidos por perfil", () => {
  const visibilidade = readFileSync(
    join(DIR, "20260806000600_comercial_ve_apenas_pedidos_proprios.sql"),
    "utf8"
  );

  it("Admin e Financeiro veem todos os pedidos do tenant", () => {
    expect(visibilidade).toMatch(/create policy orders_select/i);
    expect(visibilidade).toMatch(/current_user_role\(\) in \('admin', 'financeiro'\)/i);
  });

  it("Comercial só vê pedidos do próprio vendedor", () => {
    expect(visibilidade).toMatch(/current_user_role\(\) = 'comercial'/i);
    expect(visibilidade).toMatch(/seller_id = public\.meu_vendedor\(\)/i);
  });

  it("itens e versões seguem a mesma visibilidade do pedido pai", () => {
    expect(visibilidade).toMatch(/create policy order_items_select/i);
    expect(visibilidade).toMatch(/o\.id = order_items\.order_id[\s\S]*o\.seller_id = public\.meu_vendedor\(\)/i);
    expect(visibilidade).toMatch(/create policy order_versions_select/i);
    expect(visibilidade).toMatch(/o\.id = order_versions\.order_id[\s\S]*o\.seller_id = public\.meu_vendedor\(\)/i);
  });
});
