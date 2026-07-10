"""
Monta contexto e prompts para o Radar de Anomalias (Feature 3).
"""
from __future__ import annotations

from typing import Any


def build_radar_context(
    ticker: str,
    empresa: str,
    sinais: list[dict[str, Any]],
    dados: dict[str, Any],
) -> str:
    """Gera bloco de texto com os sinais detectados para o LLM narrar."""
    linhas: list[str] = [
        "═" * 60,
        f"RADAR DE ANOMALIAS — {ticker} ({empresa})",
        "═" * 60,
        "",
    ]

    if not sinais:
        linhas.append("Nenhuma anomalia detectada. Todos os indicadores dentro dos parâmetros históricos normais.")
        return "\n".join(linhas)

    criticos  = [s for s in sinais if s["severidade"] == "critico"]
    atencao   = [s for s in sinais if s["severidade"] == "atencao"]
    info      = [s for s in sinais if s["severidade"] == "info"]

    linhas.append(f"Total de sinais: {len(sinais)} "
                  f"({len(criticos)} críticos, {len(atencao)} atenção, {len(info)} info)")
    linhas.append("")

    def _bloco(titulo: str, lista: list[dict[str, Any]]) -> None:
        if not lista:
            return
        linhas.append(f"── {titulo} ──")
        for s in lista:
            z_str = f"z={s['z_score']:+.2f}" if s.get("z_score") is not None else "z=N/D"
            linhas.append(f"  [{s['severidade'].upper()}] {s['nome']} ({z_str})")
            linhas.append(f"    {s['contexto']}")
            if s.get("historico_serie"):
                ultimos = s["historico_serie"][-4:]
                vals = " | ".join(f"{p['ano']}: {p['valor']:.4g}" for p in ultimos)
                linhas.append(f"    Histórico: {vals}")
        linhas.append("")

    _bloco("CRÍTICOS", criticos)
    _bloco("ATENÇÃO",  atencao)
    _bloco("INFORMATIVOS", info)

    # Contexto geral do ativo
    cotacao = dados.get("cotacao") or {}
    score = dados.get("score") or {}
    linhas.append("── CONTEXTO DO ATIVO ──")
    linhas.append(f"  RS Score: {score.get('score_total', 'N/D')}/1000 ({score.get('nota_geral', '')})")
    preco = cotacao.get("preco_atual")
    if preco:
        linhas.append(f"  Preço atual: R$ {preco:.2f}")

    linhas.append("═" * 60)
    return "\n".join(linhas)


_JSON_SCHEMA_RADAR = """{
  "resumo_geral": "<1–2 frases sobre o estado geral do ativo com base nos sinais>",
  "narrativa_detalhada": "<2–4 parágrafos interpretando os sinais, com anos específicos e contexto>",
  "principais_riscos": ["<risco 1>", "<risco 2>"],
  "pontos_positivos": ["<positivo 1>"],
  "recomendacao_acompanhamento": "<o que o investidor deve monitorar nos próximos trimestres>",
  "aviso": "Esta análise é automática e não constitui recomendação de investimento."
}"""


def build_radar_system_prompt() -> str:
    return f"""Você é um analista de equity research especializado em detecção de anomalias em indicadores financeiros.

Recebeu um relatório de sinais estatísticos (z-scores) para um ativo da B3.

REGRAS ABSOLUTAS:
1. NUNCA invente números. Cite apenas valores presentes no relatório.
2. Para cada sinal crítico ou de atenção, explique o que pode significar para o negócio.
3. Referencie o ano específico do dado anômalo quando disponível.
4. Seja objetivo: não minimize sinais críticos, não catastrofize sinais de atenção.
5. Responda APENAS em JSON válido, sem texto antes ou depois.
6. Se não houver anomalias, diga isso claramente em "resumo_geral".

SCHEMA OBRIGATÓRIO:
{_JSON_SCHEMA_RADAR}"""


def build_radar_user_message(ticker: str, contexto: str) -> str:
    return (
        f"Analise os sinais de anomalia do ativo {ticker} e produza a narrativa conforme o schema.\n\n"
        f"{contexto}"
    )
