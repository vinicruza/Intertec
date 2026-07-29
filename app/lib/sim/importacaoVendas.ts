// ============================================================
// Leitura do relatório de vendas do ERP (reunião Intertech 16/07/2026)
// ============================================================
//
// "Eu puxo no Simples um relatório de venda por código. E ele joga aqui?"
//
// O formato exato do relatório ainda não foi confirmado pela Intertech, então
// o leitor é tolerante: aceita ponto e vírgula ou vírgula como separador,
// número no padrão brasileiro (1.234,56) ou americano (1234.56), cabeçalho
// opcional e nomes de coluna variados.
//
// Módulo puro, sem banco nem tela — dá para testar cada caso do arquivo.

export type LinhaVenda = {
  codigo: string;
  descricao: string;
  quantidade: string;
  receita: string | null;
};

export type ResultadoLeitura = {
  linhas: LinhaVenda[];
  // Linhas que não deu para ler, com o motivo. Nunca são descartadas em
  // silêncio: quem importou precisa saber o que ficou de fora.
  problemas: Array<{ linha: number; conteudo: string; motivo: string }>;
};

const CABECALHOS_CODIGO = ["codigo", "código", "cod", "produto", "item", "sku"];
const CABECALHOS_QTD = ["quantidade", "qtd", "qtde", "quant"];
const CABECALHOS_RECEITA = ["receita", "valor", "total", "faturamento", "vlr"];
const CABECALHOS_DESCRICAO = ["descricao", "descrição", "nome", "produto"];

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Detecta o separador olhando a primeira linha com conteúdo: ponto e vírgula é
// o padrão de exportação brasileiro; tabulação aparece em colagem de planilha.
function detectarSeparador(linha: string): string {
  const candidatos = [";", "\t", ","];
  let melhor = ";";
  let maior = 0;
  for (const c of candidatos) {
    const n = linha.split(c).length - 1;
    if (n > maior) {
      maior = n;
      melhor = c;
    }
  }
  return melhor;
}

// Converte número do relatório em texto decimal com ponto, que é o formato que
// o motor e o Postgres esperam. Dinheiro nunca vira float aqui.
export function lerNumero(bruto: string): string | null {
  const limpo = bruto.trim().replace(/[R$\s]/g, "");
  if (limpo === "") return null;

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  let normalizado: string;
  if (temVirgula && temPonto) {
    // O último separador que aparece é o decimal (1.234,56 ou 1,234.56).
    normalizado =
      limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
        ? limpo.replace(/\./g, "").replace(",", ".")
        : limpo.replace(/,/g, "");
  } else if (temVirgula) {
    normalizado = limpo.replace(",", ".");
  } else {
    normalizado = limpo;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  return normalizado;
}

function indiceDe(cabecalho: string[], nomes: string[]): number {
  return cabecalho.findIndex((c) => nomes.includes(normalizar(c)));
}

export function lerRelatorioDeVendas(texto: string): ResultadoLeitura {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  const resultado: ResultadoLeitura = { linhas: [], problemas: [] };
  if (linhas.length === 0) return resultado;

  const sep = detectarSeparador(linhas[0]);
  const primeira = linhas[0].split(sep).map((c) => c.trim());

  // Cabeçalho é opcional. Se houver, ele manda; se não, assume-se a ordem
  // código, descrição, quantidade, receita.
  const iCodigoCab = indiceDe(primeira, CABECALHOS_CODIGO);
  const iQtdCab = indiceDe(primeira, CABECALHOS_QTD);
  const temCabecalho = iCodigoCab >= 0 && iQtdCab >= 0;

  const iCodigo = temCabecalho ? iCodigoCab : 0;
  const iQtd = temCabecalho ? iQtdCab : 2;
  const iReceita = temCabecalho ? indiceDe(primeira, CABECALHOS_RECEITA) : 3;
  const iDescricao = temCabecalho
    ? primeira.findIndex((c, idx) => idx !== iCodigo && CABECALHOS_DESCRICAO.includes(normalizar(c)))
    : 1;

  const inicio = temCabecalho ? 1 : 0;

  for (let i = inicio; i < linhas.length; i++) {
    const bruta = linhas[i];
    const campos = bruta.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const numeroLinha = i + 1;

    const codigo = (campos[iCodigo] ?? "").trim();
    if (codigo === "") {
      resultado.problemas.push({ linha: numeroLinha, conteudo: bruta, motivo: "Sem código." });
      continue;
    }

    const quantidade = lerNumero(campos[iQtd] ?? "");
    if (quantidade === null) {
      resultado.problemas.push({
        linha: numeroLinha,
        conteudo: bruta,
        motivo: "Quantidade ausente ou não numérica.",
      });
      continue;
    }
    if (Number(quantidade) <= 0) {
      resultado.problemas.push({
        linha: numeroLinha,
        conteudo: bruta,
        motivo: "Quantidade zero ou negativa.",
      });
      continue;
    }

    resultado.linhas.push({
      codigo: codigo.toUpperCase(),
      descricao: iDescricao >= 0 ? campos[iDescricao] ?? "" : "",
      quantidade,
      receita: iReceita >= 0 ? lerNumero(campos[iReceita] ?? "") : null,
    });
  }

  return resultado;
}
