import type { FamiliaNF } from "./descricaoNF";

// Configuração de partida da nomenclatura fiscal — exatamente as regras que o
// cliente definiu em 04/08/2026, antes de existir tela para editá-las.
//
// A partir da tela Cadastros → Nomenclatura NF, quem manda é a tabela
// `nf_naming_rules` no banco. Esta lista existe por dois motivos:
//   1. semear a tabela na migração que cria a tela;
//   2. servir de fixture nos testes, que travam o comportamento com nomes
//      reais do catálogo — se uma refatoração mudar o resultado de qualquer
//      família, os testes quebram antes de a nota sair errada.
//
// Ela NÃO é lida em tempo de execução pelo aplicativo. Se você mudar algo
// aqui, nada muda para o cliente — o que vale é o que está no banco.

const APAGAR_CAMPO = {
  apagarGramatura: true,
  apagarTNT: true,
  apagarSMS: true,
  apagarOrigem: true,
};

// Aventais: some a gramatura e o TNT. O SMS **fica** — pedido explícito do
// cliente, ao contrário dos campos.
const APAGAR_AVENTAL = {
  apagarGramatura: true,
  apagarTNT: true,
  apagarSMS: false,
  apagarOrigem: false,
};

const NADA_A_APAGAR = {
  apagarGramatura: false,
  apagarTNT: false,
  apagarSMS: false,
  apagarOrigem: false,
};

// A ordem é de 10 em 10 para caber família nova no meio sem renumerar tudo.
// A genérica de cada linha ("Campo", "Avental") fica por último dentro da sua
// linha, senão engoliria as específicas.
export const FAMILIAS_INICIAIS: FamiliaNF[] = [
  { comeco: "Campo Catarata", nomeNF: "Campo Cirúrgico com Adesivo e Bag", ...APAGAR_CAMPO, trocas: [], ordem: 10 },
  { comeco: "Campo com Fenestra", nomeNF: "Campo Cirúrgico com Fenestra", ...APAGAR_CAMPO, trocas: [], ordem: 20 },
  { comeco: "Campo com Adesivo", nomeNF: "Campo Cirúrgico com Adesivo", ...APAGAR_CAMPO, trocas: [], ordem: 30 },
  { comeco: "Campo de Mesa", nomeNF: "Campo Cirúrgico com Reforço", ...APAGAR_CAMPO, trocas: [], ordem: 40 },
  { comeco: "Campo Lasik", nomeNF: "Campo Cirúrgico com Adesivo e 2 Bags", ...APAGAR_CAMPO, trocas: [], ordem: 50 },
  { comeco: "Campo Simples", nomeNF: "Campo Cirúrgico Sem Fenestra", ...APAGAR_CAMPO, trocas: [], ordem: 60 },
  {
    comeco: "Steri Drape",
    nomeNF: "Campo Cirúrgico Steri Drape",
    ...APAGAR_CAMPO,
    trocas: [
      { de: "Grande", para: "G" },
      { de: "Pequeno", para: "P" },
    ],
    ordem: 70,
  },
  // Campo Lateral, Superior, Inferior, de Mayo, Fenestra U…: só ganham a
  // palavra "Cirúrgico", o resto do nome se mantém.
  { comeco: "Campo", nomeNF: "Campo Cirúrgico", ...APAGAR_CAMPO, trocas: [], ordem: 80 },

  // Gineco é o mesmo produto que o mercado chama de avental sem manga.
  {
    comeco: "Avental Gineco",
    nomeNF: "Avental Cirúrgico Sem Manga",
    ...APAGAR_AVENTAL,
    trocas: [{ de: "Tag", para: "Toalha" }],
    ordem: 90,
  },
  {
    comeco: "Avental",
    nomeNF: "Avental Cirúrgico",
    ...APAGAR_AVENTAL,
    trocas: [{ de: "Tag", para: "Toalha" }],
    ordem: 100,
  },
  // A Wiper não é compressa cirúrgica; na nota ela é toalha de mão. As demais
  // compressas (Cremer, P, G, Pré-Lavada) continuam com o nome do catálogo.
  { comeco: "Compressa Wiper", nomeNF: "Toalha de Mão", ...NADA_A_APAGAR, trocas: [], ordem: 110 },
];
