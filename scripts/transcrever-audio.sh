#!/usr/bin/env bash
# Transcreve um áudio (o cliente manda muito áudio no WhatsApp).
#
#   ./scripts/transcrever-audio.sh audio.m4a [modelo]
#
# Modelos, do mais rápido ao mais fiel: tiny · base · small · medium.
# "small" é o equilíbrio bom para português falado ao telefone; "base" serve
# para saber o assunto.
#
# ------------------------------------------------------------------
# ATENÇÃO — a política de rede do ambiente precisa liberar o HuggingFace.
#
# O ffmpeg e o faster-whisper vêm de apt e PyPI, os dois liberados. O MODELO
# vem do huggingface.co, que em 19/08/2026 o proxy recusava com 403 — junto de
# hf-mirror.com, cdn-lfs.huggingface.co, alphacephei.com e
# openaipublic.azureedge.net, ou seja, todos os hosts que servem modelo de voz.
#
# Enquanto não liberar, este script instala tudo e para na hora de baixar o
# modelo. Para liberar: configurações do ambiente do Claude Code na web →
# política de rede → permitir huggingface.co e cdn-lfs.huggingface.co.
#
# O contêiner é efêmero: o modelo é rebaixado a cada sessão (~150 MB no base,
# ~460 MB no small). Se virar rotina, vale pôr este script no setup script do
# ambiente para já vir pronto.
# ------------------------------------------------------------------
set -euo pipefail

AUDIO="${1:?uso: $0 <arquivo de áudio> [modelo]}"
MODELO="${2:-small}"
[ -f "$AUDIO" ] || { echo "arquivo não encontrado: $AUDIO" >&2; exit 1; }

command -v ffmpeg >/dev/null 2>&1 || {
  echo "instalando ffmpeg..." >&2
  apt-get update -q >/dev/null 2>&1 || true
  apt-get install -y -q --no-install-recommends ffmpeg >/dev/null 2>&1
}
python3 -c "import faster_whisper" 2>/dev/null || {
  echo "instalando faster-whisper..." >&2
  pip3 install --quiet --break-system-packages faster-whisper
}

python3 - "$AUDIO" "$MODELO" <<'PY'
import sys
from faster_whisper import WhisperModel

audio, modelo = sys.argv[1], sys.argv[2]
try:
    m = WhisperModel(modelo, device="cpu", compute_type="int8")
except Exception as e:
    sys.exit(
        f"não foi possível carregar o modelo '{modelo}': {e}\n\n"
        "Se for erro de proxy/403, é a política de rede do ambiente barrando o\n"
        "huggingface.co. Veja o cabeçalho deste script."
    )

segmentos, info = m.transcribe(audio, language="pt", vad_filter=True)
print(f"[idioma: {info.language} · duração: {info.duration:.0f}s]\n")
for s in segmentos:
    print(f"[{int(s.start//60):02d}:{int(s.start%60):02d}] {s.text.strip()}")
PY
