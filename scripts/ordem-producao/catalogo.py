"""Indexa o catálogo de produtos da planilha Rentabilidade 2026 (aba Alocação Despesa).

Chave = (nome-base normalizado, estéril, gramatura, origem China).
"""
import os
import re
import unicodedata
from decimal import Decimal

import openpyxl

# Caminho da planilha Rentabilidade 2026 (sobrescrevível por variável de ambiente).
RENT = os.environ.get("RENTABILIDADE_XLSX", "Rentabilidade_2026.xlsx")


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm(s: str) -> str:
    s = sem_acento(str(s)).lower()
    s = s.replace("\xa0", " ")
    s = re.sub(r"\s*x\s*", " x ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_catalogo():
    wb = openpyxl.load_workbook(RENT, read_only=True, data_only=True)
    ws = wb["Alocação Despesa"]
    brutos = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or len(row) < 3:
            continue
        nome, cmv = row[1], row[2]
        if not isinstance(nome, str) or not isinstance(cmv, (int, float)):
            continue
        brutos.append((i + 1, nome.strip(), Decimal(str(cmv))))
    wb.close()

    # Bug conhecido (Calculations.md §9, item 3): a linha 184 rotulada
    # "Campo de Mesa 2,00 x 2,00 Não Estéril" na verdade traz o CMV do
    # "Campo de Mesa 1,50 x 1,50 Não Estéril", que ficou sem linha própria.
    corrigidos = []
    vistos = set()
    for linha, nome, cmv in brutos:
        if nome == "Campo de Mesa 2,00 x 2,00 Não Estéril" and nome in vistos:
            nome = "Campo de Mesa 1,50 x 1,50 Não Estéril"
        vistos.add(nome)
        corrigidos.append((linha, nome, cmv))

    idx = {}
    por_nome = {}
    for linha, nome, cmv in corrigidos:
        n = norm(nome)
        esteril = "nao esteril" not in n
        china = "china" in n
        gram = None
        m = re.search(r"\bgr\s?(30|40)\b", n)
        if m:
            gram = m.group(1)
        base = n
        base = re.sub(r"\bnao esteril\b", " ", base)
        base = re.sub(r"\besteril\b", " ", base)
        base = re.sub(r"\bchina\b", " ", base)
        base = re.sub(r"\bgr\s?(30|40)\b", " ", base)
        base = re.sub(r"\s+", " ", base).strip()
        idx.setdefault(base, {})[(esteril, gram, china)] = (nome, cmv)
        por_nome[n] = (nome, cmv)
    return idx, por_nome


CATALOGO, POR_NOME = parse_catalogo()

# Gramatura usada quando a ordem de produção não diz GR30 nem GR40.
GRAM_PADRAO = "40"


def buscar(base: str, esteril=True, gram=None, china=False):
    """Devolve (nome_catalogo, cmv, observacao) ou (None, None, motivo)."""
    b = norm(base)
    variantes = CATALOGO.get(b)
    if not variantes:
        return None, None, f"não existe no catálogo: “{base}”"
    obs = []
    chaves = list(variantes)
    if china and not any(k[2] for k in chaves):
        obs.append("variante China não existe no catálogo; usada a nacional")
        china = False
    if china:
        # a origem China só existe em algumas gramaturas
        chaves = [k for k in chaves if k[2]]
    # gramatura
    grams = sorted({k[1] for k in chaves if k[1]}, reverse=True)
    if grams:
        if gram is None:
            gram = GRAM_PADRAO if GRAM_PADRAO in grams else grams[0]
            obs.append(f"gramatura assumida GR{gram}")
        elif gram not in grams:
            obs.append(f"GR{gram} não existe; usada GR{grams[0]}")
            gram = grams[0]
    else:
        gram = None
    alvo = (esteril, gram, china)
    if alvo in variantes:
        nome, cmv = variantes[alvo]
        return nome, cmv, "; ".join(obs)
    # fallback: mesma esterilidade, qualquer gramatura
    for k, v in variantes.items():
        if k[0] == esteril and k[2] == china:
            obs.append(f"variante exata ausente; usada “{v[0]}”")
            return v[0], v[1], "; ".join(obs)
    for k, v in variantes.items():
        if k[0] == esteril:
            obs.append(f"variante exata ausente; usada “{v[0]}”")
            return v[0], v[1], "; ".join(obs)
    unico = next(iter(variantes.values()))
    obs.append(f"variante {'estéril' if esteril else 'não estéril'} ausente; usada “{unico[0]}”")
    return unico[0], unico[1], "; ".join(obs)


if __name__ == "__main__":
    print(len(CATALOGO), "nomes-base")
    for b in ["campo catarata 1,00 x 1,20", "campo simples 1,00 x 1,20", "avental g", "oclusor"]:
        print(b, "->", {k: v[0] for k, v in CATALOGO[b].items()})
