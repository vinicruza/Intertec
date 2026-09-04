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

  it("o próximo código casa o prefixo EXATO — CS não pode contar CSU, nem CL contar CLB/CLM", () => {
    // Desde 10/08/2026 existem prefixos que são início de outro (CS/CSU,
    // CM/CMM, CL/CLB/CLM, AV/AVC/AVT/AVS/AVL). Um "code like p_prefix || '%'"
    // (a forma antiga) contaria os produtos da família maior na sequência da
    // menor e furaria a numeração. A função tem que casar com âncora de fim
    // de string, não com LIKE.
    const proximo = definicaoVigente("next_category_code");
    expect(proximo).not.toMatch(/like\s+p_prefix/i);
    expect(proximo).toMatch(/code\s*~\s*\(\s*'\^'\s*\|\|\s*p_prefix\s*\|\|\s*'\[0-9\]\+\$'\s*\)/i);
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

  it("kit montado sem nome ou sem composição é recusado antes de Gerar Pedido", () => {
    expect(materializar).toMatch(/Kit montado precisa de nome antes de Gerar Pedido/);
    expect(materializar).toMatch(/Kit montado precisa ter ao menos um produto antes de Gerar Pedido/);
  });

  it("depois de materializar, o item aponta para o kit e larga as colunas provisórias", () => {
    expect(materializar).toMatch(/set kit_id = v_kit_id[\s\S]*ad_hoc_kit_signature = null/i);
  });

  it("depois de materializar, o item fica com código e nome do kit para rastreabilidade", () => {
    expect(materializar).toMatch(/item_code_snapshot = coalesce\(item_code_snapshot,\s*v_codigo\)/i);
    expect(materializar).toMatch(/item_name_snapshot = coalesce\(item_name_snapshot,\s*'\[Kit\] ' \|\| v_nome\)/i);
  });

  it("a embalagem do kit vai junto, com o modo de consumo (envelope × caixa rateada)", () => {
    expect(materializar).toMatch(/insert into public\.kit_packaging[\s\S]*quantity_type/i);
  });

  it("devolve QUAIS kits nasceram, não só quantos — para a tela dizer o código", () => {
    // Sem isto, quem fecha o pedido tem de ir procurar na tela de Kits o
    // código do que acabou de criar.
    expect(materializar).toMatch(/select code,\s*name into v_codigo,\s*v_nome/i);
    expect(materializar).toMatch(/'code',\s*v_codigo/i);
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

  it("a versão da cotação alimenta receita e margem no histórico", () => {
    expect(definicaoVigente("sync_order_snapshot_from_version")).toMatch(/net_revenue_snapshot/i);
    expect(definicaoVigente("sync_order_snapshot_from_version")).toMatch(/contribution_margin_snapshot/i);
    expect(TODAS).toMatch(/create trigger trg_order_versions_sync_order_snapshot/i);
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

  it("o código externo do cliente é único e pode ser vinculado pela cotação", () => {
    expect(TODAS).toMatch(/add column if not exists external_code/i);
    expect(TODAS).toMatch(/customers_external_code_unique/i);
    expect(definicaoVigente("set_customer_external_code")).toMatch(/Já existe um cliente com este código/i);
    expect(definicaoVigente("set_order_customer_external_code")).toMatch(/select customer_id into v_customer_id/i);
  });

  it("só vermelho e amarelo dependem de aprovação; verde e azul fecham direto pelo selo", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    expect(fechar).toMatch(/v_margin_pct := case when v_net = 0 then 0 else v_margin \/ abs\(v_net\) end/i);
    expect(fechar).toMatch(/v_role in \('admin', 'comercial'\)/i);
    expect(fechar).toMatch(/approval_status=case when v_self_approved_by_margin then 'aprovado'::approval_status/i);
  });

  // Até 26/08/2026 o limite da auto-aprovação era `v_margin_pct > 0.50`,
  // escrito à mão dos dois lados. Com faixa por canal esse número deixou de
  // ser único: um pedido de Marketplace com 45% é VERDE pela régua nova e
  // seria recusado por não passar de 0,50, com uma mensagem que ninguém
  // entenderia. A Mari bateria nisso no primeiro pedido.
  it("a auto-aprovação lê a régua do canal, e não um número fixo", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    expect(fechar).toContain("v_margin_pct > public.teto_amarelo_do_pedido(p_order_id)");
    expect(fechar).not.toContain("v_margin_pct > 0.50");
  });

  it("a régua do banco tem a mesma precedência da do navegador", () => {
    // vendedor > canal > padrão da casa, e 0,50 como último recurso quando
    // não há linha nenhuma — igual ao `faixaDoPedido` do TypeScript.
    const teto = definicaoVigente("teto_amarelo_do_pedido");
    expect(teto).toContain("b.seller_id = o.seller_id");
    expect(teto).toContain("b.seller_id is null and b.channel_id = o.channel_id");
    expect(teto).toContain("b.seller_id is null and b.channel_id is null");
    expect(teto).toContain("order by (b.seller_id is not null) desc, (b.channel_id is not null) desc");
    expect(teto).toContain("0.50");
  });

  it("a faixa por canal recusa régua incoerente e escopo repetido", () => {
    expect(TODAS).toContain("check (red_max < yellow_max and yellow_max < green_max)");
    expect(TODAS).toContain("unique nulls not distinct (tenant_id, channel_id, seller_id)");
  });

  // A validação de fechamento REFAZ a cascata no banco e recusa o pedido se
  // algum total não reconciliar com o que o navegador mandou. Isso significa
  // que toda regra de cálculo vive em dois lugares — e mudar só um deles
  // derruba o fechamento em produção.
  //
  // Já aconteceu com o override de DIFAL em 05/08/2026 (Calculations.md
  // §12.1). Este teste existe para que a base da comissão (§6.2) não repita a
  // história: se alguém trocar a base no motor em TypeScript e esquecer o SQL,
  // quebra aqui.
  it("a base da comissão no banco é receita + frete, igual ao motor (§6.2)", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    expect(fechar).toMatch(/v_base_with_freight := v_gross\+p_freight/i);
    expect(fechar).toMatch(/v_commission_base := v_base_with_freight/i);
    expect(fechar).toMatch(/v_commission := p_commission_rate\*v_commission_base/i);
    // A base NÃO pode voltar a ser só a receita bruta.
    expect(fechar).not.toMatch(/v_commission := p_commission_rate\*v_gross(?![a-z_])/i);
  });

  // Frete por conta do cliente zera a DEDUÇÃO do frete, mas não a base da
  // comissão: o transporte foi vendido (golden test T16b). Se o SQL passasse a
  // olhar a flag para montar a base, o banco pagaria comissão diferente do
  // motor justamente nos pedidos com frete do cliente.
  it("o frete do cliente não encolhe a base da comissão no banco", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    const linhaBase = /v_base_with_freight := [^;]+;/i.exec(fechar)?.[0] ?? "";
    expect(linhaBase).not.toMatch(/freight_paid_by_customer/i);
  });

  // Mesma trava para o DIFAL (§6.3), decidido no mesmo dia que a comissão.
  it("a base do DIFAL no banco é receita + frete, igual ao motor (§6.3)", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    expect(fechar).toMatch(/v_base_with_freight := v_gross\+p_freight/i);
    expect(fechar).toMatch(/v_difal := v_difal_rate\*v_base_with_freight/i);
    // Não pode voltar a ser só a receita bruta.
    expect(fechar).not.toMatch(/v_difal := v_difal_rate\*v_gross(?![a-z_])/i);
  });

  it("o frete do cliente não encolhe a base do DIFAL no banco", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    const linhaBase = /v_base_with_freight := [^;]+;/i.exec(fechar)?.[0] ?? "";
    expect(linhaBase).not.toMatch(/freight_paid_by_customer/i);
  });

  // O ICMS continua sobre a receita: ele alcança o frete pela linha própria de
  // imposto sobre frete. Se alguém "consertar" isso somando o frete aqui
  // também, o frete passa a ser tributado duas vezes.
  it("o ICMS continua sobre a receita, não sobre receita + frete", () => {
    const fechar = definicaoVigente("close_order_with_snapshots");
    expect(fechar).toMatch(/v_tax := v_tax_rate\*v_gross(?![a-z_])/i);
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

  it("Comercial pode trocar tipo de venda, mas não vendedor nem comissão", () => {
    expect(trava).toMatch(/from public\.channels c/i);
    expect(trava).toMatch(/c\.id = new\.channel_id/i);
    expect(trava).not.toMatch(/new\.channel_id is distinct from v_channel_id/i);
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

// A embalagem do kit é a segunda metade do CMV do kit (Calculations.md §4). Em
// 19/08/2026 o navegador somava produtos + embalagem e o banco só os produtos:
// o primeiro kit COM embalagem seria recusado no fechamento. Nunca apareceu
// porque `kit_packaging` estava vazia — a funcionalidade jamais tinha rodado
// de ponta a ponta.
describe("embalagem do kit no fechamento", () => {
  const sql = readFileSync(
    "supabase/migrations/20260819180000_embalagem_de_kit_custo_no_servidor.sql",
    "utf8"
  );

  it("o CMV do kit soma a embalagem, não só os produtos", () => {
    expect(sql).toMatch(/v_expected_cmv := v_expected_cmv \+ public\.custo_embalagem_do_kit\(/);
  });

  it("o custo da embalagem é SECURITY DEFINER — senão vira zero para o Comercial", () => {
    // `close_order_with_snapshots` roda com o perfil de quem fecha, e o
    // Comercial não lê `inputs`. Sem definer a soma voltaria vazia e o pedido
    // fecharia com o custo errado em vez de reclamar.
    const bloco = sql.slice(sql.indexOf("function public.custo_embalagem_do_kit"));
    expect(bloco.slice(0, 300)).toMatch(/security definer/i);
  });

  it("linha de embalagem sem custo bloqueia em vez de virar zero", () => {
    expect(sql).toMatch(/Embalagem do kit sem custo vigente/);
  });

  it("a lista de insumos para o seletor não devolve preço", () => {
    const bloco = sql.slice(
      sql.indexOf("function public.insumos_para_embalagem"),
      sql.indexOf("revoke execute on function public.insumos_para_embalagem")
    );
    expect(bloco).not.toMatch(/price_without_tax|price_with_tax/);
  });
});

// O papel de cada insumo na embalagem do kit é dado no banco, não deduzido do
// nome. Casar por prefixo quebraria calado no dia em que alguém renomeasse
// "Caixa 6" para "Caixa 06" — e quebraria no custo de um orçamento.
describe("papel do insumo na embalagem do kit", () => {
  const sql = readFileSync(
    "supabase/migrations/20260819210000_papel_do_insumo_no_kit.sql",
    "utf8"
  );

  it("a coluna existe e só aceita os quatro papéis", () => {
    expect(sql).toMatch(/add column if not exists kit_role text/);
    for (const papel of ["envelope", "caixa", "esterilizacao", "automatico"]) {
      expect(sql).toContain(`'${papel}'`);
    }
  });

  it("etiquetinha e gráfica são as automáticas", () => {
    expect(sql).toMatch(/kit_role = 'automatico'\s+where name in \('Etiquetinha','Gráfica'\)/);
  });

  it("a lista do seletor devolve o papel e continua sem preço", () => {
    const bloco = sql.slice(sql.indexOf("create function public.insumos_para_embalagem"));
    expect(bloco).toMatch(/papel text/);
    expect(bloco.slice(0, 700)).not.toMatch(/price_without_tax|price_with_tax/);
  });
});

// A cidade de entrega é dado de expedição: entra e sai pelas mesmas portas que
// peso e volumes, e nenhuma delas pode passar por cima da imutabilidade do
// dinheiro. Estes testes existem porque a regra mora em três lugares — o
// gatilho, a função de gravação e a de duplicar — e esquecer um deles falha
// calado: o campo aceita o que se digita e o valor não chega ao banco.
describe("cidade e UF de entrega do pedido", () => {
  it("o gatilho do pedido fechado deixa passar as duas colunas novas", () => {
    const gatilho = definicaoVigente("protect_closed_order");
    expect(gatilho).toMatch(/'shipping_city'/);
    expect(gatilho).toMatch(/'shipping_state'/);
    // E continuam registradas na auditoria, como o resto da expedição.
    expect(gatilho).toMatch(/'shipping_city',\s*old\.shipping_city/);
    expect(gatilho).toMatch(/'shipping_city',\s*new\.shipping_city/);
  });

  it("a tela de expedição grava cidade e UF, e a UF sobe para maiúscula", () => {
    const gravar = definicaoVigente("update_order_shipping");
    expect(gravar).toMatch(/shipping_city = nullif\(btrim\(p_shipping_city\), ''\)/);
    expect(gravar).toMatch(/shipping_state = nullif\(upper\(btrim\(p_shipping_state\)\), ''\)/);
    // A porta continua estreita: nada de dinheiro nesta função.
    expect(gravar).not.toMatch(/\bfreight\s*=|\bcommission_rate\s*=|\bunit_price\s*=/);
  });

  it("duplicar o pedido leva o endereço de entrega junto", () => {
    const copiar = definicaoVigente("copy_order_as_simulation");
    expect(copiar).toMatch(/v_source\.shipping_city/);
    expect(copiar).toMatch(/v_source\.shipping_state/);
  });

  it("a UF de entrega só aceita duas letras maiúsculas, como no cadastro", () => {
    expect(TODAS).toMatch(
      /orders_shipping_state_formato[\s\S]{0,120}shipping_state ~ '\^\[A-Z\]\{2\}\$'/
    );
  });

  it("a UF fiscal do pedido continua existindo separada da UF de entrega", () => {
    // orders.uf é a base do DIFAL. Se um dia alguém reaproveitá-la como
    // endereço de entrega, o imposto passa a seguir a caixa, não a nota.
    const gravar = definicaoVigente("update_order_shipping");
    expect(gravar).not.toMatch(/\buf\s*=/);
  });
});

// ============================================================
// Composição dos volumes (25/08/2026)
// ============================================================
//
// Nasceu de uma vendedora escrever "2 cx6+1cx3 = 3" no campo Volumes, que é
// inteiro. A informação é legítima e de quem embala; o campo é que faltava.
//
// Mesma armadilha da cidade de entrega: uma coluna nova precisa passar pelo
// gatilho E pelas DUAS funções que gravam. Esquecer uma falha calado — o campo
// aceita o que se digita e o valor não chega ao banco.
describe("composição dos volumes", () => {
  it("o gatilho do pedido fechado deixa passar a coluna nova", () => {
    const gatilho = definicaoVigente("protect_closed_order");
    expect(gatilho).toMatch(/'volumes_composition'/);
    // Quem embala descobre a composição DEPOIS de o pedido ser ganho, então
    // ela tem de ser editável no pedido fechado — e ficar na auditoria.
    expect(gatilho).toMatch(/'volumes_composition',\s*old\.volumes_composition/);
    expect(gatilho).toMatch(/'volumes_composition',\s*new\.volumes_composition/);
  });

  it("a tela de expedição grava a composição", () => {
    const gravar = definicaoVigente("update_order_shipping");
    expect(gravar).toMatch(/volumes_composition = nullif\(btrim\(p_volumes_composition\), ''\)/);
  });

  it("o simulador grava a composição ao salvar a cotação", () => {
    const gravar = definicaoVigente("save_quote_revision");
    expect(gravar).toMatch(/v_volumes_composition text := nullif\(btrim\(p_order->>'volumes_composition'\), ''\)/);
    // Nos dois caminhos: cotação nova e edição de cotação existente.
    expect(gravar).toMatch(/volumes, volumes_composition, shipping_zip/);
    expect(gravar).toMatch(/volumes_composition = v_volumes_composition/);
  });

  it("duplicar o pedido NÃO leva a composição, como já não leva os volumes", () => {
    // Composição e quantidade descrevem a caixa daquele embarque. Copiar para
    // um pedido novo seria afirmar uma embalagem que ninguém montou ainda.
    const copiar = definicaoVigente("copy_order_as_simulation");
    expect(copiar).not.toMatch(/v_source\.volumes/);
  });

  it("é texto livre: a forma de escrever é de quem embala, não do sistema", () => {
    expect(TODAS).toMatch(/add column if not exists volumes_composition text/);
    // Sem trava de formato — o erro que originou tudo foi justamente uma
    // coluna estreita demais para o que a pessoa precisava registrar.
    expect(TODAS).not.toMatch(/volumes_composition[\s\S]{0,80}check\s*\(/);
  });
});

// ============================================================
// Inativar um kit no catálogo (Patricia, 04/09/2026)
// ============================================================
//
// A pergunta era "consigo inativar um kit?" e a resposta era não: a coluna
// `kits.status` existia desde o primeiro dia, o simulador já não vendia kit
// inativo, mas não havia onde clicar. Enquanto não havia, quatro kits foram
// inativados por UPDATE manual no banco — sem registro de quem fez.
describe("ativar e inativar kit", () => {
  it("só Administrador e Financeiro alteram a situação do kit", () => {
    const definir = definicaoVigente("set_kit_status");
    expect(definir).toMatch(/v_papel\s+not\s+in\s*\(\s*'admin',\s*'financeiro'\s*\)/i);
    // O RLS da tabela deixa o Comercial escrever em `kits` (é assim que ele
    // monta kit no pedido). A trava por papel tem de estar AQUI, senão tirar
    // item do catálogo vira decisão de quem vende.
    expect(definir).toMatch(/raise exception '[^']*Administrador e Financeiro/i);
  });

  it("toda mudança de situação fica registrada em audit_logs", () => {
    const definir = definicaoVigente("set_kit_status");
    expect(definir).toMatch(/insert into public\.audit_logs/i);
    expect(definir).toMatch(/'kits'/);
    expect(definir).toMatch(/when p_ativo then 'activate' else 'deactivate'/i);
    // Quem clicou, e não a função: é SECURITY INVOKER e grava auth.uid().
    expect(definir).toMatch(/auth\.uid\(\)/);
    expect(definir).toMatch(/security invoker/i);
  });

  // Inativar não é apagar. Se um dia alguém trocar o UPDATE por um DELETE, o
  // histórico de pedidos fechados que usam o kit vai junto.
  it("inativar nunca apaga o kit", () => {
    const definir = definicaoVigente("set_kit_status");
    expect(definir).toMatch(/update public\.kits\s+set status = v_novo/i);
    expect(definir).not.toMatch(/delete\s+from\s+public\.kits/i);
  });

  it("o aviso de orçamento em aberto conta só cotação viva", () => {
    // Pedido gerado guarda custo congelado (D7) e cotação perdida não volta
    // ao simulador: nenhum dos dois é afetado por inativar o kit.
    const definir = definicaoVigente("set_kit_status");
    expect(definir).toMatch(/o\.status = 'simulation'/);
    expect(definir).toMatch(/o\.cancelled_at is null/);

    const auditoria = definicaoVigente("get_kits_audit");
    expect(auditoria).toMatch(/open_orders_count/);
    expect(auditoria).toMatch(/u\.order_status = 'simulation' and u\.cancelled_at is null/);
  });
});

// ============================================================
// Aprovação automática (relatado em 01/09/2026)
// ============================================================
//
// "A Isabela conseguiu aprovar um pedido com margem baixa, não deveria."
//
// O sistema tem DUAS tabelas de faixa, e elas não querem dizer a mesma
// coisa. `margin_rules` são as faixas de STATUS do painel, onde "Boa"
// começa em 40% e a cor dela é 'green'. `commercial_margin_bands` é o SELO
// do pedido, onde 40% ainda é AMARELA e verde só começa acima de 50%.
//
// O gatilho da aprovação automática lia a primeira. Como as duas usam a
// palavra "green" para coisas diferentes, o erro passou despercebido: entre
// 40% e 50% a tela dizia amarela e o banco aprovava como verde. 21
// orçamentos entraram assim, de 41,12% a 49,95%.
describe("aprovação automática usa o selo comercial", () => {
  it("o gatilho não lê mais as faixas de status do painel", () => {
    const gatilho = definicaoVigente("sync_order_snapshot_from_version");
    expect(gatilho).toContain("public.selo_comercial_do_pedido(new.order_id, v_margem_pct)");
    expect(gatilho).not.toContain("from public.margin_rules");
  });

  it("o selo do banco tem os mesmos tetos e a mesma precedência do navegador", () => {
    const selo = definicaoVigente("selo_comercial_do_pedido");
    // Tetos inclusivos, na mesma ordem do `seloMargemComercial`.
    expect(selo).toContain("p_pct <= (select red_max from tetos) then 'red'");
    expect(selo).toContain("p_pct <= (select yellow_max from tetos) then 'yellow'");
    expect(selo).toContain("p_pct <= (select green_max from tetos) then 'green'");
    // vendedor > canal > padrão da casa, e o mesmo fallback do TypeScript.
    expect(selo).toContain("order by (b.seller_id is not null) desc, (b.channel_id is not null) desc");
    expect(selo).toContain("0.40");
    expect(selo).toContain("0.50");
    expect(selo).toContain("0.65");
  });

  it("só verde e azul entram sozinhos — amarelo e vermelho nunca", () => {
    const gatilho = definicaoVigente("sync_order_snapshot_from_version");
    expect(gatilho).toContain("v_color in ('blue', 'green') and status = 'simulation'");
    expect(gatilho).not.toContain("'yellow'");
  });
});

// O alarme que faltava. A correção da regra impede ESTE erro; esta contagem
// é sobre o próximo — ela não depende de qual regra quebrou, compara o que
// foi aprovado sozinho com o selo vigente.
describe("integridade acusa aprovação automática abaixo do selo", () => {
  it("a contagem existe e usa o selo comercial", () => {
    const resumo = definicaoVigente("get_data_quality_summary");
    expect(resumo).toContain("auto_approved_below_seal");
    expect(resumo).toContain("public.selo_comercial_do_pedido(o.id, o.contribution_margin_snapshot/o.net_revenue_snapshot)");
    expect(resumo).toContain("in ('red','yellow')");
  });

  it("aprovação manual de margem baixa não entra na conta", () => {
    // Um humano pode aprovar o que quiser — é para isso que a fila existe.
    // Só conta o que o sistema aprovou sozinho.
    const resumo = definicaoVigente("get_data_quality_summary");
    expect(resumo).toContain("o.approval_notes ilike 'Aprovado automaticamente pela margem%'");
  });

  it("pedido ratificado por um administrador sai da conta, e a ratificação fica registrada", () => {
    // Pedido fechado é imutável: não dá para corrigir a aprovação dele. Um
    // alarme que nunca zera deixa de ser lido, então a saída é alguém com
    // autoridade assumir a decisão — com motivo obrigatório e nome no log.
    const resumo = definicaoVigente("get_data_quality_summary");
    expect(resumo).toContain("a.action='ratifica_aprovacao_automatica'");
    const rat = definicaoVigente("ratificar_aprovacao_automatica");
    expect(rat).toContain("public.current_user_role() <> 'admin'");
    expect(rat).toContain("Escreva o motivo da ratificação");
    expect(rat).toContain("insert into public.audit_logs");
  });
});

// ============================================================
// Causa raiz: duas tabelas, a mesma palavra
// ============================================================
//
// `margin_rules` (status do painel) e `commercial_margin_bands` (o selo que
// decide aprovação) guardavam ambas a palavra "green" — significando faixas
// diferentes. O gatilho leu uma achando que era a outra, e nada reclamou:
// nem o Postgres, nem o TypeScript, nem os testes.
//
// Consertar quem lê qual resolveu aquele erro. Isto trava a família dele.
describe("as duas tabelas de faixa não compartilham vocabulário", () => {
  it("o banco recusa a cor do selo nas faixas do painel", () => {
    expect(TODAS).toContain("margin_rules_nao_usa_cores_do_selo");
    expect(TODAS).toContain("not in ('green','yellow','orange','red','blue')");
  });

  it("as faixas do painel foram renomeadas para rótulos de status", () => {
    expect(TODAS).toContain("then 'status_boa'");
    expect(TODAS).toContain("then 'status_negativa'");
  });

  it("nenhuma função do banco decide aprovação LENDO margin_rules", () => {
    // O que não pode voltar é a CONSULTA. Citar a tabela em comentário é
    // desejável: é o registro de por que a regra é como é.
    const gatilho = definicaoVigente("sync_order_snapshot_from_version");
    const fechar = definicaoVigente("close_order_with_snapshots");
    for (const fn of [gatilho, fechar]) {
      expect(fn).not.toContain("from public.margin_rules");
      expect(fn).not.toContain("join public.margin_rules");
    }
  });
});

// A quarta camada, e a única que não depende de alguém olhar: o banco recusa
// o estado ruim na gravação. Conferido em produção em 01/09/2026 — a
// tentativa de aprovar sozinho um pedido amarelo foi rejeitada, e a
// aprovação humana do mesmo pedido passou.
describe("o banco recusa aprovação automática abaixo do selo", () => {
  it("a trava existe e roda em toda gravação de pedido", () => {
    expect(TODAS).toContain("trg_orders_aprovacao_automatica_valida");
    expect(TODAS).toContain("before update on public.orders");
  });

  it("recusa só a aprovação AUTOMÁTICA, e só em faixa que exige aprovação", () => {
    const t = definicaoVigente("impede_aprovacao_automatica_abaixo_do_selo");
    expect(t).toContain("not ilike 'Aprovado automaticamente pela margem%'");
    expect(t).toContain("v_selo in ('red','yellow')");
    expect(t).toContain("public.selo_comercial_do_pedido(new.id, v_pct)");
  });

  it("aprovação humana de margem baixa continua permitida", () => {
    // Travar isso seria trocar um erro por outro: a fila existe justamente
    // para alguém poder aprovar uma margem baixa com conhecimento de causa.
    const t = definicaoVigente("impede_aprovacao_automatica_abaixo_do_selo");
    expect(t).toContain("return new");
    expect(t).toContain("new.approval_status <> 'aprovado' then return new");
  });

  it("pedido que já estava nesse estado não é bloqueado", () => {
    // Senão editar a expedição de um pedido antigo pararia por causa de um
    // erro que já aconteceu.
    const t = definicaoVigente("impede_aprovacao_automatica_abaixo_do_selo");
    expect(t).toContain("old.approval_status = 'aprovado'");
  });
});
