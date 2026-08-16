"""Traduz as abreviações da planilha ORDEM DE PRODUÇÃO em produtos do catálogo
da planilha RENTABILIDADE 2026 e devolve o CMV unitário.

Regra geral de leitura (§ dicionário):
  - família  → prefixo do nome no catálogo ("mesa" = Campo de Mesa)
  - medida   → um número só = quadrado (80 = 0,80 x 0,80); "1x1,4" = 1,00 x 1,40
  - "não"    → Não Estéril (o padrão da planilha é estéril)
  - "CH"     → origem China; "GR30"/"GR40" → gramatura
  - kit      → composição livre; cada componente entra pelo CMV NÃO ESTÉRIL
               (a esterilização e o envelope são um só por kit — Calculations.md §4.1)
"""
import re
from decimal import Decimal

from catalogo import buscar, norm

ALTA, MEDIA, CONFIRMAR = "Alta", "Média", "A confirmar"

# Embalagem/esterilização de kit montado sob medida. É o "Kit Aleatório" da
# própria planilha (caixa + envelope 30x40 + esterilização + etiqueta + gráfica),
# usado como padrão enquanto o envelope e o rateio da caixa de cada kit não vêm
# do sistema da Intertech — Calculations.md §4.1.
EMBALAGEM_KIT = Decimal("2.026695")

TAMANHO_PADRAO = {
    "Campo Catarata": "1,00 x 1,20",
    "Campo Simples": "1,00 x 1,20",
    "Campo de Mesa": "1,00 x 1,40",
    "Campo Com Fenestra": "1,00 x 1,20",
    "Campo Com Adesivo": "1,00 x 1,20",
    "Saco": "0,40 x 0,60",
    "Campo Lateral": "1,00 x 1,60",
    "Campo Superior": "1,60 x 2,60",
    "Campo Inferior": "1,60 x 2,00",
}

# Correções de digitação vistas na própria planilha.
TYPOS = [
    (r"\bcatarara\b", "catarata"),
    (r"\bsem fe\b", "sem fen"),
    (r"\boclnao\b", "ocl nao"),
    (r"\bnaop?\b", "nao"),
    (r"\bnap\b", "nao"),
    (r"\bcom ade s(\d)", r"com ades \1"),
    (r"1 x 1,,2", "1 x 1,2"),
    (r"1 x ,2 x 2,0\b", "1,2 x 2,00"),
    (r"\b1 x 104\b", "1 x 1,4"),
    (r"\b1 x 10,4\b", "1 x 1,4"),
    (r"\bmesda\b", "mesa"),
    (r"\bpadao\b", "padrao"),
    (r"\bmagueira\b", "mangueira"),
    (r"\bdiaevrum\b", "diaverum"),
    (r"1,2 x 200\b", "1,2 x 2,00"),
]

# Itens que não existem no catálogo da Rentabilidade.
FORA_DO_CATALOGO = {
    "mangueira": "mangueira (acessório de kit odonto — sem ficha na Rentabilidade)",
    "refletor": "refletor (acessório de kit odonto — sem ficha na Rentabilidade)",
}


def limpa(txt: str) -> str:
    t = norm(txt)
    t = t.replace("(", " ").replace(")", " ")
    for de, para in TYPOS:
        t = re.sub(de, para, t)
    return re.sub(r"\s+", " ", t).strip()


def _num(s: str) -> str:
    v = float(s.replace(",", "."))
    if v >= 20:  # veio em centímetros
        v = v / 100
    return f"{v:.2f}".replace(".", ",")


def extrai_medida(t: str):
    """Devolve (medida_normalizada|None, texto_sem_medida)."""
    m = re.search(r"(\d+(?:,\d+)?)\s*x\s*(\d+(?:,\d+)?)", t)
    if m:
        medida = f"{_num(m.group(1))} x {_num(m.group(2))}"
        return medida, (t[: m.start()] + " " + t[m.end():]).strip()
    m = re.search(r"(?<![,\d])(?<!\d,)(\d+(?:,\d+)?)(?!,?\d)(?!\s*x)", t)
    if m:
        v = _num(m.group(1))
        return f"{v} x {v}", (t[: m.start()] + " " + t[m.end():]).strip()
    return None, t


def extrai_flags(t: str):
    esteril = True
    if re.search(r"\bnao\b", t):
        esteril = False
        t = re.sub(r"\bnao\b", " ", t)
    t = re.sub(r"\best\b", " ", t)
    china = False
    if re.search(r"\bch\b", t):
        china = True
        t = re.sub(r"\bch\b", " ", t)
    gram = None
    m = re.search(r"\bgr\s?(30|40)\b", t)
    if m:
        gram = m.group(1)
        t = re.sub(r"\bgr\s?(30|40)\b", " ", t)
    else:  # "av ML bco 40" / "TNT 30"
        m = re.search(r"\b(tnt|sms)\s+(30|40)\b", t)
        if m:
            gram = m.group(2)
            t = t[:m.start()] + f" {m.group(1)} " + t[m.end():]
    return esteril, china, gram, re.sub(r"\s+", " ", t).strip()


def ok(nome, cmv, conf, obs=""):
    return {"produto": nome, "cmv": cmv, "confianca": conf, "obs": obs}


def falha(motivo):
    return {"produto": None, "cmv": None, "confianca": CONFIRMAR, "obs": motivo}


def _busca(base, esteril, gram, china, conf, obs, medida_assumida=False):
    nome, cmv, o = buscar(base, esteril, gram, china)
    if nome is None:
        return falha(o)
    partes = [p for p in [obs, o] if p]
    if o and "assumida" in o and conf == ALTA:
        conf = MEDIA
    if medida_assumida:
        conf = MEDIA
    return ok(nome, cmv, conf, "; ".join(partes))


# ---------------------------------------------------------------- aventais
def resolve_avental(t: str, esteril, gram, china):
    obs = []
    conf = ALTA
    cor = None
    for c in ["marinho", "azul bebe", "azul", "bco", "branco", "verde"]:
        if c in t:
            cor = c
            t = t.replace(c, " ")
    if cor and cor not in ("bco", "branco"):
        obs.append(f"cor “{cor}” não existe como produto próprio no catálogo")
        conf = CONFIRMAR
    t = re.sub(r"\bav(ental)?\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    if "go" in t.split() or "gineco" in t:
        return _busca("Avental Gineco", esteril, None, False, conf,
                      "; ".join(obs + ["GO lido como Gineco (avental sem manga ginecológico)"]))

    if "elast" in t:
        return falha("avental com elástico não tem produto próprio na Rentabilidade "
                     "(só existe o insumo “Custo costureira avental com elástico”)")

    if re.search(r"\bsm\b", t) or "sem manga" in t:
        especial = "especial" in t
        base = "Avental TNT Sem Manga Tam Especial" if especial else "Avental Sem Manga SMS"
        if not especial:
            obs.append("“sm” lido como Avental Sem Manga SMS — existe também o Avental TNT Sem Manga")
            conf = CONFIRMAR
        return _busca(base, esteril, None, False, conf, "; ".join(obs))

    if re.search(r"\bml\b", t):
        g = gram or "40"
        if not gram:
            obs.append("gramatura assumida 40")
            conf = MEDIA
        return _busca(f"Avental TNT {g}g ML", esteril, None, False, conf, "; ".join(obs))

    lam = bool(re.search(r"\blam(inado)?\b", t))
    t = re.sub(r"\blam(inado)?\b", " ", t)

    tam = ""
    for tk, alvo in [("egg", "EGG"), ("gg", "GG"), ("g", "G"), ("m", "M"), ("p", "P")]:
        if re.search(rf"(?<![a-z]){tk}(?![a-z])", t):
            tam = alvo
            t = re.sub(rf"(?<![a-z]){tk}(?![a-z])", " ", t, count=1)
            break

    # "com T" = com Tag (a Tag vira “Toalha” na nota fiscal);
    # "com P"/"com G" = com Compressa (P e G são o tamanho da compressa).
    com_tag = bool(re.search(r"\bcom\b.*\bt\b", t))
    com_compressa = bool(re.search(r"\bcom\b.*\b[pg]\b", t))
    if com_compressa:
        obs.append("“com P/G” lido como “com Compressa” — o catálogo não separa o tamanho da compressa")
        conf = CONFIRMAR

    if lam:
        base = "Avental Laminado" if tam in ("", "M", "P") else f"Avental {tam} Laminado"
        if com_tag:
            base = "Avental Laminado com Tag"
        return _busca(base, esteril, None, False, conf, "; ".join(obs))

    if tam == "P":
        obs.append("tamanho P não existe no catálogo; usado o Avental padrão (M)")
        conf = CONFIRMAR
        tam = ""
    if tam == "M":
        tam = ""

    pref = "Avental" if not tam else f"Avental {tam}"
    if com_tag and com_compressa:
        base = f"{'Avental M' if not tam else pref} com Compressa e Tag"
    elif com_tag:
        base = f"{'Avental M' if not tam else pref} com Tag"
    elif com_compressa:
        base = f"{pref} com Compressa"
    else:
        base = pref
    return _busca(base, esteril, None, False, conf, "; ".join(obs))


# ---------------------------------------------------------------- item simples
def resolve_item(txt: str):
    t = limpa(txt)
    if not t:
        return falha("linha vazia")
    for chave, motivo in FORA_DO_CATALOGO.items():
        if chave in t:
            return falha(motivo)

    esteril, china, gram, t = extrai_flags(t)

    if re.search(r"\bav(ental)?\b", t) or re.match(r"^av\b", t):
        return resolve_avental(t, esteril, gram, china)

    # conjunto
    if re.search(r"\b(cj|conjunto|cg)\b", t):
        obs, conf = [], ALTA
        if re.search(r"\bcom b\b", t):
            obs.append("“com B” não tem correspondente no catálogo (Conjunto é calça + blusa)")
            conf = CONFIRMAR
        tnt = "tnt" in t
        gg = bool(re.search(r"\bgg?\b", t))
        base = "Conjunto G/GG" if gg else "Conjunto P/M"
        if tnt:
            base += " TNT"
        return _busca(base, esteril, None, False, conf, "; ".join(obs))

    if re.search(r"\bcomp(ressa)?\b", t) or re.search(r"^comp\b", t):
        m = re.search(r"\bcom (\d+)\b", t)
        tam = "G" if re.search(r"\bg\b", t) else ("P" if re.search(r"\bp\b", t) else None)
        if tam is None:
            return falha("compressa sem tamanho (P ou G)")
        if m:
            n = m.group(1)
            if n in ("5", "10"):
                return _busca(f"Compressa {tam} Pacote {n}", esteril, None, False, ALTA, "")
            return falha(f"pacote com {n} não existe no catálogo (só Pacote 5 e Pacote 10)")
        return _busca(f"Compressa {tam}", esteril, None, False, ALTA, "")

    if re.search(r"\b(toalha|wiper)\b", t):
        return _busca("Compressa Wiper", esteril, None, False, ALTA,
                      "toalha de mão = Compressa Wiper no catálogo")

    if re.search(r"\bdrape\b", t):
        tam = "Grande" if re.search(r"\bg\b", t) else "Pequeno"
        obs, conf = [], ALTA
        resto = re.sub(r"\b(drape|g|p)\b", " ", t).strip()
        if resto:
            obs.append(f"não entendi “{resto}”")
            conf = CONFIRMAR
        return _busca(f"Steri Drape {tam}", esteril, None, False, conf, "; ".join(obs))

    if re.search(r"\bbino\b", t):
        if "bag" in t:
            medida, _ = extrai_medida(re.sub(r"\b2 bags?\b", " ", t))
            medida = medida or "1,00 x 1,20"
            return _busca(f"Campo Lasik Binocular {medida} 2 Bags", esteril, gram, china, ALTA, "")
        return _busca("Campo Lasik Binocular", esteril, None, False, ALTA, "")
    if re.search(r"\bmono\b", t):
        return _busca("Campo Lasik Monocular", esteril, None, False, ALTA, "")
    if re.search(r"\bmayo\b", t):
        return _busca("Campo de Mayo", esteril, None, False, ALTA, "")
    if re.search(r"\bocl\b", t):
        return _busca("Oclusor", esteril, None, False, ALTA, "")
    if re.search(r"\bperneira\b", t):
        return _busca("Perneira", esteril, None, False, ALTA, "")
    if re.search(r"\bbota\b", t):
        return _busca("Bota", esteril, None, False, ALTA, "")

    familia = None
    if "cataratinha" in t:
        familia, padrao = "Campo Catarata", "0,60 x 0,60"
        t = t.replace("cataratinha", " ")
    elif "catarata" in t:
        familia, padrao = "Campo Catarata", TAMANHO_PADRAO["Campo Catarata"]
        t = t.replace("catarata", " ")
    elif re.search(r"\bsem fen\b", t):
        familia, padrao = "Campo Simples", TAMANHO_PADRAO["Campo Simples"]
        t = re.sub(r"\bsem fen\b", " ", t)
    elif re.search(r"\bcom fen\b", t):
        familia, padrao = "Campo Com Fenestra", TAMANHO_PADRAO["Campo Com Fenestra"]
        t = re.sub(r"\bcom fen\b", " ", t)
    elif re.search(r"\bcom ades\b", t):
        familia, padrao = "Campo Com Adesivo", TAMANHO_PADRAO["Campo Com Adesivo"]
        t = re.sub(r"\bcom ades\b", " ", t)
    elif re.search(r"\bmesa\b", t):
        familia, padrao = "Campo de Mesa", TAMANHO_PADRAO["Campo de Mesa"]
        t = re.sub(r"\bmesa\b", " ", t)
    elif re.search(r"\bsaco s?\b", t) or re.search(r"\bsacos?\b", t):
        familia, padrao = "Saco", TAMANHO_PADRAO["Saco"]
        t = re.sub(r"\bsacos?\b", " ", t)
    elif re.search(r"\blat(eral)?\b", t):
        familia, padrao = "Campo Lateral", TAMANHO_PADRAO["Campo Lateral"]
        t = re.sub(r"\blat(eral)?\b", " ", t)
    elif re.search(r"\bsup\b", t):
        familia, padrao = "Campo Superior", TAMANHO_PADRAO["Campo Superior"]
        t = re.sub(r"\bsup\b", " ", t)
    elif re.search(r"\binf\b", t):
        familia, padrao = "Campo Inferior", TAMANHO_PADRAO["Campo Inferior"]
        t = re.sub(r"\binf\b", " ", t)

    if familia is None:
        return falha(f"não reconheci a família em “{txt.strip()}”")

    medida, resto = extrai_medida(t)
    assumida = medida is None
    if assumida:
        medida = padrao
    resto = re.sub(r"\b(tnt|sms|bco|branco|gr)\b", " ", resto)
    resto = re.sub(r"\s+", " ", resto).strip(" ,")

    obs, conf = [], ALTA
    if assumida:
        obs.append(f"medida não informada — assumida {medida}")
        conf = MEDIA
    if resto:
        obs.append(f"não entendi “{resto}”")
        conf = CONFIRMAR

    r = _busca(f"{familia} {medida}", esteril, gram, china, conf, "; ".join(obs))
    if r["produto"] is None:
        mf = re.search(r"fen (\d+)", resto)
        if mf:
            for suf in (f" + Fen {mf.group(1)} cm", f" + Fen {mf.group(1)}cm"):
                r2 = _busca(f"{familia} {medida}{suf}", esteril, gram, china,
                            MEDIA if conf == CONFIRMAR else conf,
                            "; ".join(o for o in obs if "não entendi" not in o))
                if r2["produto"]:
                    return r2
    if r["produto"] is None and not assumida:
        # medida sem produto próprio: tenta a ordem invertida (o catálogo às
        # vezes escreve o maior lado primeiro)
        a, b = medida.split(" x ")
        r2 = _busca(f"{familia} {b} x {a}", esteril, gram, china, conf, "; ".join(obs))
        if r2["produto"]:
            return r2
    return r


# ---------------------------------------------------------------- kits
KITS_NOMEADOS = [
    (r"\bvet\b", "Kit Veterinário"),
    (r"\buni\b", "Kit Universal Com Avental"),
    (r"\bi\b", "Kit Odonto Implante"),
    (r"\bperio\b", "Kit Odonto Pério"),
    (r"\blondrina\b", "Kit Londrina"),
    (r"\bvascular\b", "Kit Vascular"),
]


def resolve_kit(txt: str):
    """Devolve (cmv_unitario, confianca, obs, componentes)."""
    t = limpa(txt)
    t = re.sub(r"^kit\s*", "", t)
    t = re.sub(r"^kit\s*", "", t)  # "kit kit com mesa…"
    t = t.strip(" ,")

    # vírgula decimal (1,2 x 2,00) não separa componente
    partes = [p.strip(" ,") for p in re.split(r",(?!\d)", t) if p.strip(" ,")]
    if not partes:
        return None, CONFIRMAR, ("kit sem composição na planilha — a composição desse kit "
                                 "do cliente está no sistema da Intertech"), []
    # kit nomeado: sobrou só um rótulo curto, sem produto reconhecível dentro
    if len(partes) == 1:
        p = partes[0]
        so_rotulo = re.fullmatch(r"[\d\s]*|(\d+\s*)?(padrao|completo|especial|ver composicao|"
                                 r"com \d+( item)?)", p) is not None
        for rx, nome in KITS_NOMEADOS:
            if re.search(rx, p):
                esteril = "nao" not in p
                r = _busca(nome, esteril, None, False, CONFIRMAR,
                           f"“kit {p}” lido como {nome} do catálogo — a composição exata "
                           f"desse kit do cliente está no sistema da Intertech, não na Rentabilidade")
                return r["cmv"], CONFIRMAR, r["obs"], [
                    {"qtd": Decimal(1), "texto": p, **r}]
        if so_rotulo:
            return None, CONFIRMAR, (
                f"kit “{p or 'sem descrição'}”: composição não está na planilha "
                f"— precisa vir do sistema da Intertech"), []

    componentes = []
    total = Decimal(0)
    conf = ALTA
    obs = []
    for p in partes:
        if re.fullmatch(r"(gr\s?\d{2}|tudo laminado|embrulho|tnt)", p):
            obs.append(f"anotação “{p}” aplicada ao kit inteiro, não a um componente")
            continue
        m = re.match(r"^(\d+)\s*(.*)$", p)
        if m and m.group(2):
            qtd, texto = Decimal(m.group(1)), m.group(2)
        elif m and not m.group(2):
            continue
        else:
            qtd, texto = Decimal(1), p
        # letra solta = tamanho de avental; "T" = toalha de mão
        letra = texto.strip()
        if re.fullmatch(r"t", letra):
            r = _busca("Compressa Wiper", False, None, False, ALTA,
                       "“T” lido como toalha de mão (Compressa Wiper)")
        elif re.fullmatch(r"r", letra):
            r = _busca("Compressa Wiper", False, None, False, CONFIRMAR,
                       "“R” lido como “T” (toalha de mão) — provável erro de digitação")
        elif re.fullmatch(r"(egg|gg|g|m|p)( lam)?", letra):
            r = resolve_avental(letra, False, None, False)
            if r["produto"]:
                r["obs"] = "; ".join(x for x in [
                    f"“{letra.upper()}” lido como tamanho de avental", r["obs"]] if x)
        else:
            esteril_forcado = re.sub(r"\bnao\b", " ", texto)
            r = resolve_item(esteril_forcado)  # dentro do kit tudo é não estéril
            if r["produto"]:
                from catalogo import CATALOGO, norm as _n
                # troca pela versão Não Estéril do mesmo produto
                r2 = _versao_nao_esteril(r["produto"])
                if r2:
                    r = {**r, "produto": r2[0], "cmv": r2[1]}
                else:
                    r = {**r, "confianca": CONFIRMAR,
                         "obs": "; ".join(x for x in [r["obs"],
                                "não existe versão Não Estéril; usado o valor estéril "
                                "(esterilização contada duas vezes)"] if x)}
        componentes.append({"qtd": qtd, "texto": texto, **r})
        if r["cmv"] is None:
            conf = CONFIRMAR
            obs.append(f"“{texto}”: {r['obs']}")
        else:
            total += qtd * r["cmv"]
            if r["confianca"] == CONFIRMAR:
                conf = CONFIRMAR
            elif r["confianca"] == MEDIA and conf == ALTA:
                conf = MEDIA
    if not componentes:
        return None, CONFIRMAR, "composição não reconhecida", []
    total += EMBALAGEM_KIT
    if conf == ALTA:
        conf = MEDIA
    obs.append("embalagem + esterilização do kit pelo padrão “Kit Aleatório” da própria "
               "planilha — o envelope e o rateio da caixa reais vêm do sistema da Intertech")
    return total, conf, "; ".join(obs), componentes


def _versao_nao_esteril(nome_esteril: str):
    from catalogo import CATALOGO
    n = norm(nome_esteril)
    for base, variantes in CATALOGO.items():
        for chave, (nome, cmv) in variantes.items():
            if norm(nome) == n:
                for (est, gram, china), (nm, cv) in variantes.items():
                    if not est and gram == chave[1] and china == chave[2]:
                        return nm, cv
                return None
    return None


def parece_composicao(t: str) -> bool:
    partes = [p.strip(" ,") for p in re.split(r",(?!\d)", t) if p.strip(" ,")]
    return len(partes) >= 2 and re.fullmatch(r"\d+\s*(t|m|g|gg|egg|p)", partes[0]) is not None


def resolve(txt: str):
    """Ponto de entrada: devolve dict com cmv unitário, confiança e composição."""
    t = limpa(txt)
    if re.search(r"\bkit\b", t) or parece_composicao(t):
        cmv, conf, obs, comps = resolve_kit(txt)
        return {"tipo": "kit", "produto": "KIT (montado)", "cmv": cmv,
                "confianca": conf, "obs": obs, "componentes": comps}
    r = resolve_item(txt)
    return {"tipo": "produto", **r, "componentes": []}
