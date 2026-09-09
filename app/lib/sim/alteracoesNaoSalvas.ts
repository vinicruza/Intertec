// ============================================================
// "Montei de um jeito e o sistema salvou de outro" (08/09/2026)
// ============================================================
//
// Relatado pela Patricia. Conferido na base, no pedido em questão
// (ORC-2026-0210, kit KC0039): a cotação foi salva UMA vez, às 12h31m16s, e o
// pedido foi gerado 40 segundos depois. O que ficou gravado é exatamente o que
// a tela enviou naquele único save — o banco não alterou nada. A tela e o
// banco divergiram porque houve edição fora do save: o papel saiu com o que
// estava gravado, e a pessoa lembrava do que estava na tela.
//
// O simulador não avisava. Depois de salvar, a mensagem verde "Cotação
// ORC-... salva ✓" continuava lá enquanto a pessoa mexia nos campos, e só
// alguns campos a apagavam — os que passam pelas funções `atualizar*`. Frete,
// peso, volumes, observação, prazo e vários outros trocavam o valor com a
// mensagem de "salva" intacta na tela. Somando isso ao fato de que "Gerar
// Pedido" fica em OUTRA tela, dava para montar, editar, sair e gerar o pedido
// sem nunca ver um aviso.
//
// A impressão digital abaixo resolve pela raiz: em vez de lembrar de apagar o
// aviso em cada campo — e esquecer de um, como aconteceu —, ela compara TUDO o
// que vai para o banco com o que foi para o banco da última vez. Campo novo no
// formulário entra na conta sozinho, sem ninguém precisar lembrar.

export type CamposDaCotacao = {
  clienteId: string;
  clienteNovoCodigo: string;
  clienteNovoNome: string;
  clienteNovoCnpj: string;
  uf: string;
  vendedorId: string;
  canalId: string;
  tipoPedido: "sale" | "sample";
  motivoAmostra: string;
  autorizadoPorAmostra: string;
  frete: string;
  freteDestacado: boolean;
  comissao: string | null;
  aplicaDifal: boolean | null;
  // Cada linha já serializada pela tela (item, quantidade, preço e, quando é
  // kit montado, a composição inteira).
  linhas: string[];
  transportadoraId: string;
  transportadoraOutra: string;
  fretesCotados: string[];
  pesoKg: string;
  volumes: string;
  composicaoVolumes: string;
  cepEntrega: string;
  cidadeEntrega: string;
  ufEntrega: string;
  modoPagamentoId: string;
  observacao: string;
};

// Texto determinístico: mesma entrada, mesma saída, e qualquer diferença de
// conteúdo muda a string. Não é hash — é para comparar, não para guardar.
export function impressaoDaCotacao(campos: CamposDaCotacao): string {
  return JSON.stringify([
    campos.clienteId,
    campos.clienteNovoCodigo.trim(),
    campos.clienteNovoNome.trim(),
    campos.clienteNovoCnpj.trim(),
    campos.uf,
    campos.vendedorId,
    campos.canalId,
    campos.tipoPedido,
    campos.motivoAmostra.trim(),
    campos.autorizadoPorAmostra.trim(),
    campos.frete.trim(),
    campos.freteDestacado,
    campos.comissao,
    campos.aplicaDifal,
    campos.linhas,
    campos.transportadoraId,
    campos.transportadoraOutra.trim(),
    campos.fretesCotados,
    campos.pesoKg.trim(),
    campos.volumes.trim(),
    campos.composicaoVolumes.trim(),
    campos.cepEntrega.trim(),
    campos.cidadeEntrega.trim(),
    campos.ufEntrega.trim(),
    campos.modoPagamentoId,
    campos.observacao.trim(),
  ]);
}

// Só há o que avisar depois de existir um save para comparar. Cotação que
// nunca foi salva não tem "alteração não salva" — tem "não salva", e disso o
// botão já fala.
export function temAlteracoesNaoSalvas(
  impressaoSalva: string | null,
  impressaoAtual: string
): boolean {
  return impressaoSalva !== null && impressaoSalva !== impressaoAtual;
}

export const AVISO_ALTERACOES_NAO_SALVAS =
  "Você mudou algo depois de salvar. Clique em “Salvar nova versão” — senão o pedido sai com o que está gravado, não com o que está na tela.";
