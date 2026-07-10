"""
Monta o pacote de contexto estruturado para o LLM a partir do RSAnalisaData.

Regras:
- Apenas dados oficiais calculados pelo backend (CVM, B3, brapi)
- Nenhum valor inventado ou estimado aqui
- Formato compacto (~1500–2500 tokens) para caber em gpt-4o-mini com margem
"""
from __future__ import annotations


def _r(v: float | None, dec: int = 2) -> str:
    """Formata número como moeda BRL."""
    if v is None:
        return "N/D"
    return f"R$ {v:,.{dec}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _p(v: float | None, dec: int = 1) -> str:
    """Formata número como percentual."""
    if v is None:
        return "N/D"
    sinal = "+" if v >= 0 else ""
    return f"{sinal}{v * 100:.{dec}f}%"


def _pp(v: float | None, dec: int = 1) -> str:
    """Percentual já em forma decimal×100 (ex: 18.5 → 18.5%)."""
    if v is None:
        return "N/D"
    sinal = "+" if v >= 0 else ""
    return f"{sinal}{v:.{dec}f}%"


def build_context(dados: dict) -> str:
    """
    Converte RSAnalisaData (dict) em bloco de texto estruturado para o LLM.
    Retorna string vazia se dados estiverem incompletos.
    """
    ticker = dados.get("ticker", "")
    empresa = dados.get("empresa", ticker)
    setor = dados.get("setor") or "N/D"
    subsetor = dados.get("subsetor") or ""
    segmento = dados.get("segmento_b3") or ""
    governanca = dados.get("governanca") or ""
    is_fii = dados.get("is_fii", False)
    indices = dados.get("indices", [])

    # ── Cotação ───────────────────────────────────────────────────────────────
    q = dados.get("cotacao") or {}
    preco = q.get("preco_atual")
    var_dia = q.get("variacao_pct")
    lpa = q.get("lpa")
    pl_mercado = q.get("preco_lucro")
    alta_52s = q.get("cinquenta_dois_semanas_alta")
    baixa_52s = q.get("cinquenta_dois_semanas_baixa")
    market_cap = q.get("market_cap")
    var_mes = dados.get("var_mes")
    var_ano = dados.get("var_ano")

    # ── Score RS Invest ───────────────────────────────────────────────────────
    sc = dados.get("score") or {}
    score_total = sc.get("score_total", 0)
    nota = sc.get("nota_geral", "N/D")
    pontos_fortes = sc.get("pontos_fortes") or []
    pontos_fracos = sc.get("pontos_fracos") or []

    # ── Linhas do histórico financeiro ────────────────────────────────────────
    fund = dados.get("fundamentos") or {}
    historico = fund.get("historico") or []
    sinais = fund.get("sinais") or {}
    cagr_receita = fund.get("cagr_receita")
    cagr_lucro = fund.get("cagr_lucro")
    cagr_pl = fund.get("cagr_pl")
    pl_atual = fund.get("pl_atual")
    dy_atual = fund.get("dy_atual")

    # ── Valuation ─────────────────────────────────────────────────────────────
    val = dados.get("valuation") or {}
    metodos = val.get("metodos") or []
    cenarios = val.get("cenarios") or []
    preco_justo_base = val.get("preco_justo_base")
    upside = val.get("upside_pct")
    margem_seg = val.get("margem_seguranca")
    veredicto = val.get("veredicto") or "N/D"
    eps = val.get("eps")
    bvs = val.get("bvs")
    fcl_acao = val.get("fcl_por_acao")
    premissas = val.get("premissas") or {}

    # ── Alertas ───────────────────────────────────────────────────────────────
    alertas = dados.get("alertas") or []
    alertas_criticos = [a for a in alertas if a.get("tipo") == "critico"]
    alertas_atencao = [a for a in alertas if a.get("tipo") == "atencao"]
    alertas_positivos = [a for a in alertas if a.get("tipo") == "positivo"]

    # ── Monta o texto ─────────────────────────────────────────────────────────
    linhas: list[str] = []

    linhas.append("=" * 70)
    linhas.append(f"EMPRESA: {empresa} ({ticker})")
    setor_str = f"{setor}" + (f" → {subsetor}" if subsetor else "")
    linhas.append(f"Setor: {setor_str}")
    if segmento or governanca:
        linhas.append(f"Segmento B3: {segmento or 'N/D'}  |  Governança: {governanca or 'N/D'}")
    if is_fii:
        linhas.append(f"Tipo: FII ({dados.get('fii_tipo') or 'N/D'})")
        if dados.get("fii_descricao"):
            linhas.append(f"Descrição: {dados['fii_descricao']}")
    if indices:
        linhas.append(f"Índices: {', '.join(indices)}")

    linhas.append("")
    linhas.append("── COTAÇÃO ──")
    linhas.append(f"Preço atual: {_r(preco)}  |  Variação dia: {_pp(var_dia)}%")
    if var_mes is not None:
        linhas.append(f"Var. mês: {_pp(var_mes)}%  |  Var. ano: {_pp(var_ano)}%")
    if alta_52s and baixa_52s:
        linhas.append(f"Range 52 semanas: {_r(baixa_52s)} – {_r(alta_52s)}")
    if pl_mercado:
        linhas.append(f"P/L (mercado): {pl_mercado:.1f}x")
    if lpa:
        linhas.append(f"LPA: {_r(lpa)}")
    if market_cap:
        mc_bi = market_cap / 1e9
        linhas.append(f"Market Cap: R$ {mc_bi:.2f}B")

    # ── RS Score ──────────────────────────────────────────────────────────────
    linhas.append("")
    linhas.append("── RS SCORE ──")
    linhas.append(f"Score Total: {score_total}/1000 — {nota}")
    linhas.append(
        f"  Lucros: {sc.get('lucros', 'N/D')}/150  |  Crescimento: {sc.get('crescimento', 'N/D')}/150  |  "
        f"Saúde: {sc.get('saude', 'N/D')}/150  |  Valuation: {sc.get('valuation_pts', 'N/D')}/150"
    )
    linhas.append(
        f"  Dividendos: {sc.get('dividendos', 'N/D')}/100  |  Governança: {sc.get('governanca', 'N/D')}/100  |  "
        f"Momentum: {sc.get('momentum', 'N/D')}/100  |  Eficiência: {sc.get('eficiencia', 'N/D')}/100"
    )
    if pontos_fortes:
        linhas.append(f"  Pontos fortes: {'; '.join(pontos_fortes)}")
    if pontos_fracos:
        linhas.append(f"  Pontos fracos: {'; '.join(pontos_fracos)}")

    # ── Fundamentos (apenas ações) ────────────────────────────────────────────
    if historico:
        linhas.append("")
        linhas.append("── HISTÓRICO FINANCEIRO (CVM DFP) ──")
        linhas.append(
            f"{'ANO':>4}  {'Receita':>12}  {'EBITDA':>12}  {'Luc.Líq.':>12}  "
            f"{'Mg.Liq':>7}  {'ROE':>7}  {'DL/EBITDA':>10}  {'FCL':>12}"
        )
        for h in sorted(historico, key=lambda x: x.get("ano", 0)):
            ano = h.get("ano", "?")
            recv = h.get("receita_liquida")
            ebit = h.get("ebitda")
            ll   = h.get("lucro_liquido")
            mgl  = h.get("margem_liquida")
            roe  = h.get("roe")
            dl   = h.get("dl_ebitda")
            fcl  = h.get("fcl")

            def fmt_bi(v: float | None) -> str:
                if v is None: return "     N/D"
                bi = v / 1e9
                return f"{bi:>8.2f}B"

            def fmt_pct(v: float | None) -> str:
                if v is None: return "   N/D"
                return f"{v*100:>6.1f}%"

            def fmt_dl(v: float | None) -> str:
                if v is None: return "       N/D"
                return f"{v:>9.2f}x"

            linhas.append(
                f"{ano:>4}  {fmt_bi(recv)}    {fmt_bi(ebit)}    {fmt_bi(ll)}  "
                f"{fmt_pct(mgl)}  {fmt_pct(roe)}  {fmt_dl(dl)}  {fmt_bi(fcl)}"
            )

        linhas.append("")
        if cagr_receita is not None:
            linhas.append(f"CAGR Receita ({premissas.get('n_anos_historico', '?')} anos): {_p(cagr_receita)}")
        if cagr_lucro is not None:
            linhas.append(f"CAGR Lucro ({premissas.get('n_anos_historico', '?')} anos): {_p(cagr_lucro)}")
        if cagr_pl is not None:
            linhas.append(f"CAGR Patrimônio ({premissas.get('n_anos_historico', '?')} anos): {_p(cagr_pl)}")
        if dy_atual is not None:
            linhas.append(f"Dividend Yield atual: {_pp(dy_atual)}%")

        # Sinais vs. média histórica
        if sinais:
            linhas.append("")
            linhas.append("── SINAIS VS. MÉDIA HISTÓRICA ──")
            nomes = {
                "margem_liquida": "Margem Líquida",
                "margem_ebitda": "Margem EBITDA",
                "margem_bruta": "Margem Bruta",
                "margem_ebit": "Margem EBIT",
                "roe": "ROE",
                "liquidez_corrente": "Liquidez Corrente",
                "dl_ebitda": "DL/EBITDA",
            }
            for chave, nome in nomes.items():
                s = sinais.get(chave)
                if not s:
                    continue
                valor = s.get("valor")
                media = s.get("media_historica")
                sinal = s.get("sinal", "neutro")
                emoji = {"verde": "✅", "amarelo": "⚠️", "vermelho": "❌", "neutro": "➖"}.get(sinal, "➖")
                is_pct = chave != "liquidez_corrente" and chave != "dl_ebitda"
                fmt = _p if is_pct else (lambda v, dec=2: f"{v:.{dec}f}x" if v is not None else "N/D")
                linhas.append(f"  {emoji} {nome}: atual={fmt(valor)} | média={fmt(media)} | sinal={sinal.upper()}")

    # ── Valuation ─────────────────────────────────────────────────────────────
    if val:
        linhas.append("")
        linhas.append("── VALUATION ──")
        linhas.append(f"Veredicto: {veredicto}")
        if preco_justo_base:
            linhas.append(f"Preço Justo Base (média modelos): {_r(preco_justo_base)}")
        if upside is not None:
            linhas.append(f"Upside estimado: {_pp(upside)}%")
        if margem_seg is not None:
            linhas.append(f"Margem de Segurança: {_pp(margem_seg)}%")
        if eps:
            linhas.append(f"EPS (LPA): {_r(eps)}  |  BVS (VPA): {_r(bvs)}  |  FCL/ação: {_r(fcl_acao)}")

        if metodos:
            linhas.append("Modelos:")
            for m in metodos:
                nome = m.get("nome", "?")
                pj = m.get("preco_justo")
                up = m.get("upside_pct")
                linhas.append(f"  • {nome}: preço justo={_r(pj)} | upside={_pp(up)}%")

        if cenarios:
            linhas.append("Cenários DCF:")
            for c in cenarios:
                nome = c.get("nome", "?")
                g = c.get("taxa_crescimento")
                d = c.get("taxa_desconto")
                pj = c.get("preco_justo")
                up = c.get("upside_pct")
                linhas.append(
                    f"  • {nome}: g={_pp(g)}% | desconto={_pp(d)}% → preço justo={_r(pj)} (upside {_pp(up)}%)"
                )

        if premissas:
            g_base = premissas.get("g_base_usado")
            ultimo = premissas.get("ultimo_exercicio")
            n_anos = premissas.get("n_anos_historico")
            if g_base is not None:
                linhas.append(f"Premissa g (base): {_pp(g_base)}%")
            if ultimo:
                linhas.append(f"Último exercício: {ultimo}  |  {n_anos} anos de dados usados")

    # ── Alertas ───────────────────────────────────────────────────────────────
    total_alertas = len(alertas)
    if total_alertas:
        linhas.append("")
        linhas.append(f"── ALERTAS AUTOMÁTICOS ({total_alertas} total) ──")
        for a in alertas_criticos:
            linhas.append(f"  🔴 CRÍTICO [{a.get('categoria','?')}]: {a.get('titulo','?')} — {a.get('descricao','')}")
        for a in alertas_atencao:
            linhas.append(f"  🟡 ATENÇÃO [{a.get('categoria','?')}]: {a.get('titulo','?')} — {a.get('descricao','')}")
        for a in alertas_positivos:
            linhas.append(f"  🟢 POSITIVO [{a.get('categoria','?')}]: {a.get('titulo','?')} — {a.get('descricao','')}")

    linhas.append("=" * 70)

    return "\n".join(linhas)


def build_system_prompt(empresa: str, ticker: str, contexto: str) -> str:
    """Monta o system prompt completo para o LLM."""
    return f"""Você é um analista CNPI (Certificado Nacional do Profissional de Investimentos) \
da RS Invest Analytics, especializado em análise fundamentalista de ações e FIIs da B3.

Sua função é responder perguntas sobre {empresa} ({ticker}) usando EXCLUSIVAMENTE os dados \
fornecidos abaixo. Esses dados são calculados a partir de demonstrações financeiras oficiais \
(CVM DFP), cotações B3/brapi.dev e modelos quantitativos.

REGRAS OBRIGATÓRIAS:
1. Cite sempre o indicador e o período de origem em cada afirmação numérica.
   ✓ Correto: "o ROE atingiu 18,5% em 2023, acima da média histórica de 14,2%"
   ✗ Proibido: afirmar "o ROE é forte" sem citar o número e o ano
2. NUNCA invente, estime ou extrapole valores que não estejam explicitamente nos dados.
3. Se os dados forem insuficientes, diga: "Não tenho dados suficientes para isso."
4. Responda em português. Tom profissional, direto e acessível. Sem jargão desnecessário.
5. Encerre SEMPRE com: "⚠️ Esta análise não constitui recomendação de investimento."
6. Seja objetivo: máximo 250 palavras, exceto quando o usuário pedir detalhamento explícito.

DADOS DO ATIVO (fonte: CVM DFP, B3, brapi.dev):
{contexto}"""
