"""
Monta o contexto e prompts para o Comparador Automático por IA (Feature 2).

O comparador recebe RSAnalisaData de N ativos (2–4) e devolve um veredicto
estruturado em JSON com: vencedor geral, vencedores por dimensão, narrativa
do trade-off e recomendações por perfil de investidor.
"""
from __future__ import annotations

DIMENSOES = [
    ("lucros",        "Qualidade de Lucros"),
    ("crescimento",   "Crescimento"),
    ("saude",         "Saúde Financeira"),
    ("valuation_pts", "Valuation"),
    ("dividendos",    "Dividendos"),
    ("governanca",    "Governança"),
    ("momentum",      "Momentum"),
    ("eficiencia",    "Eficiência"),
]

PERFIS = {
    "dividendos":  "investidor de renda (prioriza dividendos e governança)",
    "crescimento": "investidor de crescimento (prioriza receita, EBITDA e momentum)",
    "equilibrio":  "investidor equilibrado (pondera todas as dimensões igualmente)",
}


def _p(v: float | None) -> str:
    if v is None:
        return "N/D"
    sinal = "+" if v >= 0 else ""
    return f"{sinal}{v * 100:.1f}%"


def build_compare_context(ativos: list[dict]) -> str:
    """Gera bloco de texto estruturado com dados lado a lado dos ativos."""
    linhas: list[str] = ["═" * 60, "COMPARATIVO DE ATIVOS — DADOS OFFICIAIS", "═" * 60]

    # ── Cabeçalho ─────────────────────────────────────────────────────────────
    tickers = [a.get("ticker", "?") for a in ativos]
    linhas.append(f"Ativos comparados: {', '.join(tickers)}")
    linhas.append("")

    # ── Dados de mercado ───────────────────────────────────────────────────────
    linhas.append("── COTAÇÃO ──")
    for ativo in ativos:
        ticker = ativo.get("ticker", "?")
        q = ativo.get("cotacao") or {}
        preco = q.get("preco_atual")
        var = q.get("variacao_pct")
        pl = q.get("preco_lucro")
        dy = (ativo.get("fundamentos") or {}).get("dy_atual")

        linhas.append(
            f"  {ticker}: "
            f"Preço R${preco:.2f}" if preco else f"  {ticker}: Preço N/D"
        )
        extras = []
        if var is not None:
            extras.append(f"var={_p(var / 100 if abs(var) > 1 else var)}")
        if pl is not None:
            extras.append(f"P/L={pl:.1f}x")
        if dy is not None:
            extras.append(f"DY={_p(dy)}")
        if extras:
            linhas.append(f"    {' | '.join(extras)}")

    linhas.append("")

    # ── RS Score por dimensão ─────────────────────────────────────────────────
    linhas.append("── RS SCORE (0–1000) ──")
    header = "Dimensão".ljust(22) + "  ".join(t.rjust(8) for t in tickers)
    linhas.append(header)
    linhas.append("-" * len(header))

    for campo, nome in DIMENSOES:
        vals = []
        for ativo in ativos:
            score = ativo.get("score") or {}
            v = score.get(campo)
            vals.append(str(v) if v is not None else "N/D")
        linhas.append(nome.ljust(22) + "  ".join(v.rjust(8) for v in vals))

    # Totais
    totais = []
    for ativo in ativos:
        score = ativo.get("score") or {}
        totais.append(str(score.get("score_total", "N/D")))
    linhas.append("TOTAL".ljust(22) + "  ".join(t.rjust(8) for t in totais))
    linhas.append("")

    # ── Notas gerais ──────────────────────────────────────────────────────────
    linhas.append("── NOTAS RS SCORE ──")
    for ativo in ativos:
        score = ativo.get("score") or {}
        ticker = ativo.get("ticker", "?")
        nota = score.get("nota_geral", "N/D")
        linhas.append(f"  {ticker}: {nota}")
    linhas.append("")

    # ── Valuation ─────────────────────────────────────────────────────────────
    linhas.append("── VALUATION ──")
    for ativo in ativos:
        ticker = ativo.get("ticker", "?")
        valuation = ativo.get("valuation")
        if not valuation:
            linhas.append(f"  {ticker}: valuation não disponível")
            continue
        pj = valuation.get("preco_justo_base")
        up = valuation.get("upside_pct")
        vd = valuation.get("veredicto", "N/D")
        linhas.append(
            f"  {ticker}: Preço justo base={('R$' + f'{pj:.2f}') if pj else 'N/D'}"
            f" | Upside={_p(up)} | Veredito={vd}"
        )

    linhas.append("")

    # ── Setor e governança ────────────────────────────────────────────────────
    linhas.append("── CADASTRAIS ──")
    for ativo in ativos:
        ticker = ativo.get("ticker", "?")
        setor = ativo.get("setor") or "N/D"
        gov = ativo.get("governanca") or "N/D"
        linhas.append(f"  {ticker}: Setor={setor} | Governança={gov}")

    linhas.append("")
    linhas.append("═" * 60)
    return "\n".join(linhas)


_JSON_SCHEMA = """{
  "vencedor_geral": "<ticker>",
  "vencedores_dimensoes": {
    "lucros": "<ticker ou empate>",
    "crescimento": "<ticker ou empate>",
    "saude": "<ticker ou empate>",
    "valuation": "<ticker ou empate>",
    "dividendos": "<ticker ou empate>",
    "governanca": "<ticker ou empate>",
    "momentum": "<ticker ou empate>",
    "eficiencia": "<ticker ou empate>"
  },
  "narrativa": "<2–4 parágrafos sobre o trade-off, citando dimensões específicas>",
  "recomendacao_dividendos": "<qual ticker e por quê para investidor de renda>",
  "recomendacao_crescimento": "<qual ticker e por quê para investidor de crescimento>",
  "recomendacao_equilibrio": "<qual ticker e por quê para investidor equilibrado>",
  "aviso": "Esta análise é gerada automaticamente. Não constitui recomendação de investimento."
}"""


def build_compare_system_prompt(perfil: str) -> str:
    perfil_desc = PERFIS.get(perfil, PERFIS["equilibrio"])
    return f"""Você é um analista de equity research sênior, especialista em ações da B3.
Sua função é comparar ativos com base EXCLUSIVAMENTE nos dados fornecidos no contexto.

REGRAS ABSOLUTAS:
1. NUNCA invente números. Cite apenas valores do contexto.
2. Se um dado estiver como "N/D", informe a limitação ao invés de estimar.
3. Responda SOMENTE em JSON válido, sem texto antes ou depois.
4. O perfil principal solicitado é: {perfil_desc}. Dê mais peso a esse perfil, mas analise todos.
5. Use os RS Scores para determinar vencedores por dimensão (maior = melhor, salvo se N/D).
6. "empate" só quando os valores forem idênticos ou ambos N/D.

SCHEMA OBRIGATÓRIO DO JSON:
{_JSON_SCHEMA}"""


def build_compare_user_message(tickers: list[str], perfil: str) -> str:
    perfil_desc = PERFIS.get(perfil, PERFIS["equilibrio"])
    return (
        f"Compare os ativos {', '.join(tickers)} para um {perfil_desc}. "
        f"Use os dados do contexto. Retorne JSON conforme o schema."
    )
