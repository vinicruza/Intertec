"""Lê as abas jul26 e ago26 da ORDEM DE PRODUÇÃO e separa em pedidos."""
import datetime as dt
import os
import re
from decimal import Decimal

import openpyxl

# Caminho da planilha Ordem de Produção (sobrescrevível por variável de ambiente).
ORDEM = os.environ.get("ORDEM_PRODUCAO_XLSX", "Ordem_de_producao.xlsx")

# textos que aparecem nas colunas de cliente mas não são cliente
NOTAS = re.compile(r"^(gr\s?\d{2}|ttl|ver composi|sair\b|embrulho|\*+)", re.I)


def qtd_de(v):
    if isinstance(v, (int, float)):
        return Decimal(str(int(v)))
    if isinstance(v, str):
        m = re.match(r"^\s*(\d+)", v)
        if m:
            return Decimal(m.group(1))
    return None


def ler(aba: str):
    wb = openpyxl.load_workbook(ORDEM, read_only=True, data_only=True)
    ws = wb[aba]
    linhas = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        r = list(row) + [None] * (11 - len(row))
        linhas.append((i + 1, r))
    wb.close()

    pedidos = []
    atual = None
    data = None
    pagina = None

    def fecha():
        nonlocal atual
        if atual and atual["itens"]:
            pedidos.append(atual)
        atual = None

    for nlin, r in linhas:
        if r[9] is not None and isinstance(r[9], (int, float)):
            pagina = int(r[9])
        # bloco digitado uma coluna à direita: A=data/vazio, B=quantidade, C=descrição
        deslocado = (isinstance(r[1], (int, float))
                     and isinstance(r[2], str) and r[2].strip()
                     and not (isinstance(r[1], str)))
        if isinstance(r[0], dt.datetime):
            data = r[0].date()
            if not deslocado:
                fecha()
                continue
            r = [None] + r[1:]
        if deslocado:
            r = [r[1], r[2]] + list(r[3:]) + [None]
        vazia = all(c is None or (isinstance(c, str) and not c.strip()) for c in r[:9])
        if vazia:
            fecha()
            continue
        qtd = qtd_de(r[0])
        desc = r[1] if isinstance(r[1], str) and r[1].strip() else None
        cliente = None
        notas = []
        for ci in range(2, 10):
            v = r[ci]
            if isinstance(v, str) and v.strip():
                v = v.strip()
                if NOTAS.match(v):
                    notas.append(v)
                elif desc is None and ci == 2:
                    desc = v
                elif cliente is None:
                    cliente = v
                else:
                    notas.append(v)
        if atual is None:
            atual = {"aba": aba, "data": data, "pagina": pagina, "cliente": None,
                     "notas": [], "itens": [], "linha_inicial": nlin}
        if cliente and not atual["cliente"]:
            atual["cliente"] = cliente
        elif cliente:
            atual["notas"].append(cliente)
        atual["notas"] += notas
        if desc:
            if qtd is None and atual["itens"]:
                # continuação da descrição do item anterior
                atual["itens"][-1]["descricao"] += ", " + desc
                atual["itens"][-1]["linhas"].append(nlin)
            else:
                atual["itens"].append({"linha": nlin, "linhas": [nlin],
                                       "qtd": qtd, "descricao": desc,
                                       "qtd_texto": r[0] if isinstance(r[0], str) else None})
    fecha()
    return pedidos


if __name__ == "__main__":
    for aba in ["jul26", "ago26"]:
        ps = ler(aba)
        itens = sum(len(p["itens"]) for p in ps)
        sem_cli = [p for p in ps if not p["cliente"]]
        print(aba, "pedidos:", len(ps), "itens:", itens, "sem cliente:", len(sem_cli))
        for p in ps[:5]:
            print("   ", p["data"], p["cliente"], [(i["qtd"], i["descricao"]) for i in p["itens"]])
