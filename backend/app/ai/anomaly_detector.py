"""
Motor de detecção de anomalias por z-score (Feature 3 — Radar).

Compara cada indicador do último exercício contra a série histórica do próprio
ativo. Limiar: |z| >= 1.0 → sinal; |z| >= 1.5 → atenção; |z| >= 2.0 → crítico.

Também aproveita os sinais já calculados em fundamentos.sinais (comparação vs.
média histórica feita pelo RS Score) para enriquecer o radar.
"""
from __future__ import annotations

import math
from typing import Any

# Indicadores analisados no histórico anual (campo → nome → melhor_quando)
_INDICADORES_HISTORICO: list[tuple[str, str, str]] = [
    ("receita_liquida", "Receita Líquida",        "maior"),
    ("ebitda",          "EBITDA",                  "maior"),
    ("lucro_liquido",   "Lucro Líquido",           "maior"),
    ("margem_liquida",  "Margem Líquida",          "maior"),
    ("roe",             "ROE",                     "maior"),
    ("dl_ebitda",       "DL/EBITDA",               "menor"),
    ("fcl",             "Fluxo de Caixa Livre",    "maior"),
]

_NOME_SINAL: dict[str, str] = {
    "margem_liquida":  "Margem Líquida",
    "roe":             "ROE",
    "dl_ebitda":       "DL/EBITDA",
    "fcl":             "Fluxo de Caixa Livre",
    "margem_ebitda":   "Margem EBITDA",
    "crescimento_receita": "Crescimento de Receita",
    "liquidez_corrente":   "Liquidez Corrente",
}

LIMIAR_INFO     = 1.0
LIMIAR_ATENCAO  = 1.5
LIMIAR_CRITICO  = 2.0


def _media(vals: list[float]) -> float:
    return sum(vals) / len(vals)


def _desvio(vals: list[float], media: float) -> float:
    if len(vals) < 2:
        return 0.0
    return math.sqrt(sum((x - media) ** 2 for x in vals) / len(vals))


def _pct_vs_media(atual: float, media: float) -> float:
    if media == 0:
        return 0.0
    return (atual - media) / abs(media)


def _severidade(z_abs: float) -> str:
    if z_abs >= LIMIAR_CRITICO:
        return "critico"
    if z_abs >= LIMIAR_ATENCAO:
        return "atencao"
    return "info"


def _formatar_valor(campo: str, v: float) -> str:
    """Formata o valor para exibição no contexto."""
    percentuais = {"margem_liquida", "margem_ebitda", "roe"}
    grandes = {"receita_liquida", "ebitda", "lucro_liquido", "fcl"}
    if campo in percentuais:
        return f"{v * 100:.1f}%"
    if campo in grandes:
        bi = v / 1e9
        return f"R$ {bi:.1f}B" if abs(bi) >= 1 else f"R$ {v / 1e6:.0f}M"
    return f"{v:.2f}"


def detectar_anomalias(dados: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Detecta anomalias nos dados fundamentalistas de uma ação.

    Retorna lista de dicts com campos:
      indicador, nome, valor_atual, ano_atual, media_historica,
      desvio_padrao, z_score, severidade, tipo, contexto,
      melhor_quando, historico_serie
    Ordenados por severidade DESC (crítico primeiro) e |z| DESC.
    """
    sinais: list[dict[str, Any]] = []
    vistos: set[str] = set()

    fundamentos = dados.get("fundamentos") or {}
    historico_raw = fundamentos.get("historico") or []
    sinais_raw = fundamentos.get("sinais") or {}

    # ── Análise por z-score do histórico anual ────────────────────────────────
    if len(historico_raw) >= 3:
        for campo, nome, melhor_quando in _INDICADORES_HISTORICO:
            pares = [
                (int(h["ano"]), h[campo])
                for h in historico_raw
                if h.get(campo) is not None and isinstance(h.get(campo), (int, float))
            ]
            if len(pares) < 3:
                continue

            pares.sort(key=lambda x: x[0])
            anos, vals = zip(*pares)

            # Histórico base = todos exceto o último
            base = list(vals[:-1])
            atual = float(vals[-1])
            ano_atual = int(anos[-1])

            med = _media(base)
            dev = _desvio(base, med)
            if dev == 0 or med == 0:
                continue

            z = (atual - med) / dev
            z_abs = abs(z)
            if z_abs < LIMIAR_INFO:
                continue

            # z positivo + melhor_quando=maior → positivo (anomalia boa)
            # z negativo + melhor_quando=maior → negativo
            z_avaliativo = z if melhor_quando == "maior" else -z
            tipo = "positivo" if z_avaliativo > 0 else "negativo"
            sev = _severidade(z_abs)

            pct = _pct_vs_media(atual, med)
            direcao = "acima" if atual > med else "abaixo"
            contexto = (
                f"{nome} em {ano_atual}: {_formatar_valor(campo, atual)} — "
                f"{abs(pct) * 100:.1f}% {direcao} da média histórica "
                f"({_formatar_valor(campo, med)}). z-score: {z:+.2f}."
            )

            sinais.append({
                "indicador":       campo,
                "nome":            nome,
                "valor_atual":     round(atual, 6),
                "ano_atual":       ano_atual,
                "media_historica": round(med, 6),
                "desvio_padrao":   round(dev, 6),
                "z_score":         round(z, 3),
                "severidade":      sev,
                "tipo":            tipo,
                "contexto":        contexto,
                "melhor_quando":   melhor_quando,
                "historico_serie": [{"ano": a, "valor": round(float(v), 6)} for a, v in pares],
            })
            vistos.add(campo)

    # ── Enriquecer com sinais.* do RS Score (já calculados) ──────────────────
    for campo, ds in sinais_raw.items():
        if not isinstance(ds, dict) or campo in vistos:
            continue
        sinal_cor = ds.get("sinal", "verde")
        if sinal_cor == "verde":
            continue   # sem anomalia segundo o RS Score

        valor = ds.get("valor")
        media = ds.get("media_historica")
        nome = _NOME_SINAL.get(campo, campo.replace("_", " ").title())
        sev = "critico" if sinal_cor == "vermelho" else "atencao"
        tipo = "negativo"
        z_approx = None

        if valor is not None and media is not None and media != 0:
            # z aproximado sem desvio → usa diferença relativa escalada
            pct = _pct_vs_media(float(valor), float(media))
            z_approx = round(-pct * 5, 2)   # heurística: 20% de desvio ≈ z≈1
            contexto = (
                f"{nome}: {_formatar_valor(campo, float(valor))} vs. "
                f"média histórica {_formatar_valor(campo, float(media))}. "
                f"Sinal RS Score: {sinal_cor}."
            )
        else:
            contexto = f"{nome}: sinal {sinal_cor} detectado pelo RS Score."

        sinais.append({
            "indicador":       campo,
            "nome":            nome,
            "valor_atual":     float(valor) if valor is not None else None,
            "ano_atual":       None,
            "media_historica": float(media) if media is not None else None,
            "desvio_padrao":   None,
            "z_score":         z_approx,
            "severidade":      sev,
            "tipo":            tipo,
            "contexto":        contexto,
            "melhor_quando":   ds.get("melhor_quando", "maior"),
            "historico_serie": [],
        })

    # ── Ordenar: crítico → atenção → info, depois |z| DESC ───────────────────
    _ord = {"critico": 0, "atencao": 1, "info": 2}
    sinais.sort(key=lambda s: (_ord.get(s["severidade"], 3), -abs(s.get("z_score") or 0)))

    return sinais
