// Tradução de erro de autenticação para o que a pessoa lê na tela.
//
// Regra: nunca devolver o texto cru do servidor quando ele não for uma frase.
// Quando o serviço de autenticação falha por dentro, a resposta vem com corpo
// vazio e a biblioteca entrega a mensagem como "{}" — que apareceu na tela de
// login exatamente assim, sem dizer nada a ninguém.

// Parece uma frase para uma pessoa? Sobra do serializador (JSON vazio, colchete
// solto, string em branco) não é frase — vira o texto genérico.
function pareceFrase(msg: string): boolean {
  const limpo = msg.trim();
  if (limpo.length < 4) return false;
  if (/^[[{("']*[\]})"']*$/.test(limpo)) return false;
  return /\p{L}/u.test(limpo);
}

const GENERICO =
  "Não foi possível entrar agora. Tente de novo em alguns instantes; se continuar, avise o administrador.";

export function traduzErro(msg: string | null | undefined): string {
  if (!msg) return GENERICO;
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "E-mail ainda não confirmado.";
  if (/should be different from the old password/i.test(msg)) {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (/password should be at least/i.test(msg)) return "A nova senha é curta demais.";
  // Falha interna do serviço de autenticação (HTTP 5xx). Dizer "e-mail ou senha
  // incorretos" aqui mandaria a pessoa tentar a senha certa a noite inteira.
  if (/unexpected_failure|database error|internal (server )?error/i.test(msg)) {
    return "O serviço de acesso falhou ao consultar esta conta. Não é a sua senha — avise o administrador.";
  }
  if (/failed to fetch|network|timeout/i.test(msg)) {
    return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  }
  return pareceFrase(msg) ? msg : GENERICO;
}

// Mensagem legível para um erro que veio de qualquer lugar.
//
// O Supabase rejeita RPC com um PostgrestError: um objeto simples com `message`,
// e NÃO uma instância de Error. Quem testa só `e instanceof Error` cai no texto
// padrão e joga fora a única frase que explicava a falha — foi o que aconteceu
// em 19/08/2026, quando "Fechamento rejeitado: totais enviados não reconciliam
// com os dados do pedido" virou "Erro ao gerar pedido." na tela do vendedor, e
// a causa (uma migração pendente) só apareceu no log do banco.
export function mensagemDeErro(e: unknown, padrao: string): string {
  const doBanco = traduzErroDoBanco(e);
  if (doBanco) return doBanco;
  if (e instanceof Error && pareceFrase(e.message)) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof e.message === "string" && pareceFrase(e.message)) {
    return e.message;
  }
  return padrao;
}

// ============================================================
// Erro do banco → frase que a vendedora entende
// ------------------------------------------------------------
// O Postgres recusa com o NOME da trava, em inglês e em jargão. Em 19/08/2026
// uma vendedora digitou "42" no CEP e levou na tela:
//
//   new row for relation "orders" violates check constraint
//   "orders_shipping_zip_formato"
//
// Não diz o que fazer, não diz quantos dígitos faltam, não diz que o campo pode
// ficar em branco. Aqui cada trava alcançável por um formulário vira uma frase
// que aponta o campo e a saída.
//
// O que NÃO está nesta lista cai no genérico por tipo de erro (§ FALLBACK), que
// ainda é melhor do que o texto cru: diz a natureza do problema em português.
// ============================================================

const POR_TRAVA: Record<string, string> = {
  // ---- Pedido ----
  orders_shipping_zip_formato:
    "O CEP de entrega precisa ter 8 dígitos. Deixe em branco para usar o CEP do cadastro do cliente.",
  orders_volumes_check: "A quantidade de volumes precisa ser maior que zero.",
  orders_weight_kg_check: "O peso precisa ser maior que zero.",
  orders_payment_term_days_check: "O prazo de pagamento não pode ser negativo.",
  order_items_quantity_check: "A quantidade de cada item precisa ser maior que zero.",
  order_items_unit_price_check: "O preço de venda não pode ser negativo.",
  order_items_one_ref:
    "Cada linha do pedido tem de ser um produto OU um kit — não os dois. Refaça a linha.",

  // ---- Cadastro de cliente ----
  //
  // As três travas abaixo faltavam, e a diferença apareceu em 02/09/2026: a
  // Patrícia tentou completar o CNPJ de um cliente e leu "Já existe um registro
  // com estes dados" — sem dizer QUAL campo nem QUAL cliente. O CNPJ estava num
  // registro duplicado com o nome errado ("IAGARAPAVA"), que a busca pelo nome
  // certo não encontrava. Ela não tinha como descobrir sozinha.
  //
  // A frase de `salvarCliente` vai além destas e nomeia o cliente que já tem o
  // documento; estas ficam como rede quando a consulta do nome não responde.
  customers_tax_id_unico:
    "Este CNPJ/CPF já está cadastrado em outro cliente. Procure por ele antes de criar um novo — pode ser um cadastro repetido.",
  customers_code_unique: "Já existe um cliente com este código.",
  customers_external_code_unique:
    "Já existe um cliente com este código do ERP. Confira se não é o mesmo cliente cadastrado duas vezes.",
  customers_tax_id_formato: "O CNPJ precisa ter 14 dígitos e o CPF, 11. Confira o número digitado.",
  customers_billing_zip_formato: "O CEP de faturamento precisa ter 8 dígitos.",
  customers_shipping_zip_formato: "O CEP de entrega precisa ter 8 dígitos.",
  customers_billing_state_formato: "O estado de faturamento é a sigla com 2 letras — por exemplo SP.",
  customers_shipping_state_formato: "O estado de entrega é a sigla com 2 letras — por exemplo SP.",
  customers_phone_formato: "O telefone precisa ter 10 ou 11 dígitos, com o DDD.",
  customers_commercial_phone_formato: "O telefone comercial precisa ter 10 ou 11 dígitos, com o DDD.",
  customers_financial_phone_formato: "O telefone do financeiro precisa ter 10 ou 11 dígitos, com o DDD.",

  // ---- Kit ----
  kit_items_quantity_check: "A quantidade de cada produto do kit precisa ser maior que zero.",
  kit_items_kit_id_product_id_key:
    "Este produto já está no kit. Some na quantidade da linha existente em vez de repetir o produto.",
  kit_packaging_quantity_check: "A quantidade da embalagem precisa ser maior que zero.",
  kit_packaging_quantity_shape:
    "Falta dizer quantos envelopes cabem na caixa. Sem esse número não há como ratear o custo.",
  kit_packaging_kit_id_input_id_key: "Este item de embalagem já foi escolhido para o kit.",
  kits_tenant_id_signature_key:
    "Já existe um kit com esta composição. O sistema vai reaproveitar o código dele em vez de criar outro.",

  // ---- Produto e insumo ----
  products_tenant_id_code_key: "Já existe um produto com este código.",
  product_categories_tenant_id_name_key: "Já existe uma categoria com este nome.",
  product_categories_tenant_id_prefix_key: "Já existe uma categoria com este prefixo de código.",
  product_categories_prefix_check:
    "O prefixo da categoria tem de 2 a 3 caracteres, começando por letra maiúscula — por exemplo CS ou AVC.",
  product_components_computed_quantity_check:
    "A quantidade consumida precisa ser maior que zero. Confira largura, comprimento e rendimento.",
  product_cmv_overrides_cmv_check: "O custo informado precisa ser maior que zero.",
  inputs_icms_rate_check: "O ICMS do insumo precisa ficar entre 0% e 100%.",
  inputs_pis_cofins_rate_check: "O PIS/COFINS do insumo precisa ficar entre 0% e 100%.",

  // ---- Tabelas fiscais e parâmetros ----
  icsm_rates_icms_rate_check: "O ICMS precisa ficar entre 0% e 100%.",
  icsm_rates_pis_cofins_rate_check: "O PIS/COFINS precisa ficar entre 0% e 100%.",
  icsm_rates_tenant_id_uf_key: "Esta UF já está na tabela de ICMS.",
  difal_rates_final_rate_check: "O DIFAL precisa ficar entre 0% e 100%.",
  difal_rates_tenant_id_uf_key: "Esta UF já está na tabela de DIFAL.",
  portal_freight_rates_freight_percent_check: "O percentual de frete precisa ficar entre 0% e 100%.",
  portal_freight_rates_tenant_id_uf_key: "Esta UF já está na tabela de frete do portal.",
  channels_default_commission_rate_check: "A comissão precisa ficar entre 0% e 100%.",
  approval_settings_block_below_margin_check: "A margem mínima precisa ficar entre 0% e 100%.",

  // ---- Listas de referência ----
  carriers_tenant_id_name_key: "Já existe uma transportadora com este nome.",
  payment_terms_tenant_id_label_key: "Já existe uma condição de pagamento com este nome.",
  loss_reasons_tenant_id_label_key: "Já existe um motivo de perda com este nome.",
  customer_types_tenant_id_name_key: "Já existe um tipo de cliente com este nome.",
  customer_specialties_tenant_id_name_key: "Já existe uma especialidade com este nome.",
  nf_naming_rules_tenant_id_match_prefix_key: "Já existe uma regra de nomenclatura para este prefixo.",

  // ---- Despesas ----
  expense_allocations_estimated_production_check: "A produção estimada não pode ser negativa.",
  expense_allocations_complexity_factor_check: "O fator de complexidade não pode ser negativo.",
  external_sales_quantity_check: "A quantidade vendida precisa ser maior que zero.",
};

// Nome do tipo do Postgres → como se diz isso para quem preenche o formulário.
const TIPOS_EM_PORTUGUES: Record<string, string> = {
  integer: "um número inteiro",
  bigint: "um número inteiro",
  smallint: "um número inteiro",
  numeric: "um número",
  "double precision": "um número",
  real: "um número",
  date: "uma data",
  timestamp: "uma data",
  "timestamp with time zone": "uma data",
  uuid: "um código de registro escolhido na lista",
  boolean: "apenas sim ou não",
};

// A mensagem do Postgres traz o nome da trava entre aspas.
function nomeDaTrava(texto: string): string | null {
  const m = /constraint "([^"]+)"/i.exec(texto) ?? /"([a-z0-9_]+_(?:key|check|formato|shape|ref))"/i.exec(texto);
  return m ? m[1] : null;
}

export function traduzErroDoBanco(e: unknown): string | null {
  if (!e || typeof e !== "object") return null;
  const erro = e as { message?: unknown; code?: unknown; details?: unknown };
  const texto = [erro.message, erro.details].filter((x) => typeof x === "string").join(" ");
  if (!texto) return null;

  const trava = nomeDaTrava(texto);
  if (trava && POR_TRAVA[trava]) return POR_TRAVA[trava];

  // FALLBACK por tipo de erro. Sem a frase exata, ao menos diz a natureza do
  // problema em português — e nunca despeja o nome da trava na tela.
  const code = typeof erro.code === "string" ? erro.code : "";
  if (code === "23505" || /duplicate key|já existe/i.test(texto)) {
    return "Já existe um registro com estes dados. Confira se não está cadastrando algo repetido.";
  }
  if (code === "23503") {
    return "Este registro está em uso em outro lugar do sistema e não pode ser removido ou alterado assim.";
  }
  if (code === "23502") {
    return "Falta preencher um campo obrigatório.";
  }
  if (code === "23514" || /violates check constraint/i.test(texto)) {
    return "Algum campo está fora do formato esperado. Confira os dados digitados.";
  }
  // 22P02 — o Postgres recusou o texto ao converter para o tipo da coluna.
  // Não tem nome de trava, então escapava de toda a tradução acima e ia cru
  // para a tela: em 25/08/2026 uma vendedora escreveu a composição das caixas
  // no campo Volumes e leu, em inglês,
  // `invalid input syntax for type integer: "2 cx6+1cx3 = 3"`.
  const cast = /invalid input syntax for type ([a-z ]+): "([^"]*)"/i.exec(texto);
  if (cast) {
    const tipo = TIPOS_EM_PORTUGUES[cast[1].toLowerCase().trim()] ?? "outro tipo de dado";
    return `Um dos campos recebeu "${cast[2]}", e ali cabe ${tipo}. Corrija o campo e salve de novo.`;
  }
  if (code === "22P02") {
    return "Algum campo recebeu texto onde o sistema espera outro tipo de dado. Confira o que foi digitado.";
  }
  if (code === "42501" || /row-level security|permission denied/i.test(texto)) {
    return "Seu perfil de acesso não permite esta ação. Fale com o administrador.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(texto)) {
    return "Sem conexão com o servidor. Confira a internet e tente de novo.";
  }
  return null;
}
