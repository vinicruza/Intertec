import type { FamiliaNF } from "../../../lib/nomenclatura/descricaoNF";
import { supabase } from "../supabase";

// ============================================================
// Nomenclatura de NF — a regra como cadastro
// ============================================================
//
// A regra que traduz o nome do catálogo para o nome que sai na nota fiscal
// deixou de morar no código e virou cadastro (Cadastros → Nomenclatura NF).
// Aqui é só ida e volta com o banco: quem aplica a regra continua sendo a
// função pura `descricaoNFdoProduto`.

export type FamiliaNFCadastro = FamiliaNF & { id: string; ativa: boolean };

type LinhaBanco = {
  id: string;
  match_prefix: string;
  nf_name: string;
  remove_grammage: boolean;
  remove_tnt: boolean;
  remove_sms: boolean;
  remove_origin: boolean;
  replacements: unknown;
  sort_order: number;
  active: boolean;
};

// `replacements` é jsonb — chega como o que estiver gravado, não como o tipo
// que a gente gostaria. Filtra o que não tem forma de troca em vez de deixar
// um `undefined` chegar na regra e virar "undefined" dentro do nome do produto.
function trocasDoBanco(valor: unknown): Array<{ de: string; para: string }> {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((t) => {
    if (typeof t !== "object" || t === null) return [];
    const { de, para } = t as { de?: unknown; para?: unknown };
    if (typeof de !== "string" || !de.trim()) return [];
    return [{ de, para: typeof para === "string" ? para : "" }];
  });
}

function daLinha(l: LinhaBanco): FamiliaNFCadastro {
  return {
    id: l.id,
    comeco: l.match_prefix,
    nomeNF: l.nf_name,
    apagarGramatura: l.remove_grammage,
    apagarTNT: l.remove_tnt,
    apagarSMS: l.remove_sms,
    apagarOrigem: l.remove_origin,
    trocas: trocasDoBanco(l.replacements),
    ordem: l.sort_order,
    ativa: l.active,
  };
}

const COLUNAS =
  "id, match_prefix, nf_name, remove_grammage, remove_tnt, remove_sms, remove_origin, replacements, sort_order, active";

/** Todas as famílias, inclusive as inativas — a tela precisa mostrá-las. */
export async function listarFamiliasNF(): Promise<FamiliaNFCadastro[]> {
  const { data, error } = await supabase.from("nf_naming_rules").select(COLUNAS).order("sort_order");
  if (error) throw error;
  return ((data ?? []) as LinhaBanco[]).map(daLinha);
}

/**
 * As famílias que a regra deve usar de verdade. Família inativa fica guardada
 * no cadastro mas não traduz nome nenhum — os produtos dela passam a sair na
 * nota com o próprio nome do catálogo.
 */
export function familiasAtivas(familias: FamiliaNFCadastro[]): FamiliaNF[] {
  return familias.filter((f) => f.ativa);
}

export async function salvarFamiliaNF(f: {
  id: string | null;
  comeco: string;
  nomeNF: string;
  apagarGramatura: boolean;
  apagarTNT: boolean;
  apagarSMS: boolean;
  apagarOrigem: boolean;
  trocas: Array<{ de: string; para: string }>;
  ordem: number;
  ativa: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc("save_nf_naming_rule", {
    p_id: f.id,
    p_match_prefix: f.comeco,
    p_nf_name: f.nomeNF,
    p_remove_grammage: f.apagarGramatura,
    p_remove_tnt: f.apagarTNT,
    p_remove_sms: f.apagarSMS,
    p_remove_origin: f.apagarOrigem,
    p_replacements: f.trocas.filter((t) => t.de.trim()),
    p_sort_order: f.ordem,
    p_active: f.ativa,
  });
  if (error) throw error;
}

export async function excluirFamiliaNF(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_nf_naming_rule", { p_id: id });
  if (error) throw error;
}

/**
 * Grava as descrições recalculadas. O cálculo é feito antes, em TypeScript;
 * aqui só sobe o resultado. O banco recusa sozinho os produtos marcados como
 * "ajustada à mão".
 */
export async function aplicarDescricoesNF(
  linhas: Array<{ id: string; descricao: string | null }>
): Promise<number> {
  const { data, error } = await supabase.rpc("apply_nf_descriptions", {
    p_rows: linhas.map((l) => ({ id: l.id, nf_description: l.descricao })),
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
