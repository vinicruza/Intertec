// ============================================================
// Campos obrigatórios do cadastro de cliente
// ============================================================
//
// Pedido da Intertech em 02/09/2026, depois de a Santa Casa de Igarapava
// aparecer duas vezes na base: um cadastro veio do ERP sem CNPJ, e trinta
// minutos depois alguém criou outro, com o CNPJ e o nome digitado errado
// ("IAGARAPAVA"). Procurar pelo nome certo não encontrava o errado.
//
// Cadastro SEM DOCUMENTO é o que deixa a porta aberta: sem CNPJ nada impede o
// mesmo cliente de nascer de novo, porque a única defesa vira o nome — e nome
// se digita errado.
//
// ---------- Por que nem tudo é obrigatório ----------
//
// Campo obrigatório demais não produz cadastro completo: produz cadastro
// inventado. Quem está no meio de uma venda e não tem o e-mail do financeiro
// digita "a@a.com" para o formulário deixar salvar, e aí o dado é pior do que o
// branco — porque o branco pelo menos se vê.
//
// A régua foi medida na base real de 02/09/2026 (143 clientes ativos):
//
//   obrigatórios   faltavam no máximo 7 cadastros — dá para completar
//   opcionais      contato financeiro faltava em 77 (54% da base)
//
// Contato FINANCEIRO, complemento e observação seguem opcionais: são canais
// extras, não a identidade do cliente nem para onde a nota vai.
export type CamposObrigatoriosCliente = {
  external_code: string;
  name: string;
  uf: string;
  tax_id: string;
  customer_type_id: string;
  customer_specialty_id: string;
  billing_zip: string;
  billing_street: string;
  billing_number: string;
  billing_district: string;
  billing_city: string;
  billing_state: string;
  shipping_zip: string;
  shipping_street: string;
  shipping_number: string;
  shipping_district: string;
  shipping_city: string;
  shipping_state: string;
  // O contato PRINCIPAL do banco não é um campo de tela: ele é copiado do
  // comercial na hora de salvar. Exigir aqui o nome do banco pediria à pessoa
  // um campo que não existe no formulário — então quem é obrigatório é o
  // comercial, que é o que ela enxerga e preenche.
  commercial_contact_name: string;
  commercial_phone: string;
  commercial_email: string;
};

// Rótulo de cada campo, na mesma palavra que a tela usa — a mensagem de
// pendência é lida por quem está olhando o formulário.
export const ROTULOS_OBRIGATORIOS: Record<keyof CamposObrigatoriosCliente, string> = {
  external_code: "Código do cliente",
  name: "Empresa / nome",
  uf: "UF",
  tax_id: "CNPJ / CPF",
  customer_type_id: "Tipo de cliente",
  customer_specialty_id: "Área de atuação",
  billing_zip: "CEP de faturamento",
  billing_street: "Rua (faturamento)",
  billing_number: "Número (faturamento)",
  billing_district: "Bairro (faturamento)",
  billing_city: "Cidade (faturamento)",
  billing_state: "Estado (faturamento)",
  shipping_zip: "CEP de entrega",
  shipping_street: "Rua (entrega)",
  shipping_number: "Número (entrega)",
  shipping_district: "Bairro (entrega)",
  shipping_city: "Cidade (entrega)",
  shipping_state: "Estado (entrega)",
  commercial_contact_name: "Nome do contato comercial",
  commercial_phone: "Telefone do contato comercial",
  commercial_email: "E-mail do contato comercial",
};

export const CAMPOS_OBRIGATORIOS = Object.keys(ROTULOS_OBRIGATORIOS) as Array<
  keyof CamposObrigatoriosCliente
>;

// Quais faltam. Devolve na ordem da tela, para a lista de pendências ser lida
// de cima para baixo como o formulário.
export function obrigatoriosPendentes(
  c: Partial<CamposObrigatoriosCliente>
): Array<keyof CamposObrigatoriosCliente> {
  return CAMPOS_OBRIGATORIOS.filter((campo) => (c[campo] ?? "").trim() === "");
}

// O CNPJ tem peso próprio: é ele que impede o mesmo cliente de entrar duas
// vezes. Serve para a tela explicar POR QUE está exigindo, em vez de só marcar
// o campo de vermelho.
export function faltaDocumento(c: Partial<CamposObrigatoriosCliente>): boolean {
  return (c.tax_id ?? "").trim() === "";
}
