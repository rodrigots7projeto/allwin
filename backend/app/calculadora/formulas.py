"""
Motor de Cálculo de Indicadores Financeiros — AllWin.

Cada função recebe valores brutos (em R$) e retorna o indicador calculado.
Toda função documenta:
  • Fórmula matemática
  • Unidade do resultado
  • Interpretação (maior ou menor é melhor)
  • Fonte de dados (qual conta do BP/DRE/DFC)

Nomenclatura de contas CVM:
  BP Ativo: 1=Ativo Total, 1.01=Ativo Circ., 1.01.01=Caixa, 1.02=Ativo NC
  BP Pass.: 2.01=Passivo Circ., 2.02=Passivo NC, 2.03=Patrimônio Líquido
  DRE: 3.01=Receita Líq., 3.03=Lucro Bruto, 3.04=D&A (estimado), 3.05=EBIT, 3.11=LL
  DFC: 6.01=FCO, 6.02=FCI, 6.03=FCF
"""
import math
from typing import Optional

# ── Tipo resultado enriquecido ────────────────────────────────────────────────

class Indicador:
    """Resultado de um cálculo com metadados completos para auditoria."""
    __slots__ = ("nome", "categoria", "valor", "formula", "numerador", "denominador",
                 "unidade", "melhor_quando", "interpretacao")

    def __init__(
        self,
        nome: str,
        categoria: str,
        valor: Optional[float],
        formula: str,
        unidade: str,
        melhor_quando: str = "maior",
        numerador: Optional[float] = None,
        denominador: Optional[float] = None,
        interpretacao: str = "",
    ) -> None:
        self.nome          = nome
        self.categoria     = categoria
        self.valor         = valor
        self.formula       = formula
        self.unidade       = unidade
        self.melhor_quando = melhor_quando
        self.numerador     = numerador
        self.denominador   = denominador
        self.interpretacao = interpretacao

    def to_dict(self) -> dict:
        return {
            "nome":          self.nome,
            "categoria":     self.categoria,
            "valor":         self.valor,
            "formula":       self.formula,
            "unidade":       self.unidade,
            "melhor_quando": self.melhor_quando,
            "numerador":     self.numerador,
            "denominador":   self.denominador,
        }


def _div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    """Divisão segura — retorna None em vez de ZeroDivisionError."""
    if a is None or b is None or b == 0:
        return None
    return a / b


# =============================================================================
# LIQUIDEZ
# =============================================================================

def liquidez_corrente(ativo_circ: float, passivo_circ: float) -> Indicador:
    """
    Fórmula: LC = Ativo Circulante / Passivo Circulante
    Unidade: vezes (x)
    Melhor: maior (>1 indica folga de curto prazo)
    Conta CVM: 1.01 / 2.01
    """
    return Indicador(
        nome="LIQUIDEZ_CORRENTE",
        categoria="LIQUIDEZ",
        valor=_div(ativo_circ, passivo_circ),
        formula="Ativo Circulante / Passivo Circulante",
        unidade="x",
        melhor_quando="maior",
        numerador=ativo_circ,
        denominador=passivo_circ,
        interpretacao="Capacidade de honrar obrigações de curto prazo com ativos circulantes",
    )


def liquidez_seca(ativo_circ: float, estoques: float, passivo_circ: float) -> Indicador:
    """
    Fórmula: LS = (Ativo Circulante − Estoques) / Passivo Circulante
    Remove estoques (menos líquidos) para visão mais conservadora.
    """
    num = ativo_circ - (estoques or 0)
    return Indicador(
        nome="LIQUIDEZ_SECA",
        categoria="LIQUIDEZ",
        valor=_div(num, passivo_circ),
        formula="(Ativo Circulante − Estoques) / Passivo Circulante",
        unidade="x",
        melhor_quando="maior",
        numerador=num,
        denominador=passivo_circ,
    )


def liquidez_geral(
    ativo_circ: float, realizavel_lp: float,
    passivo_circ: float, passivo_nc: float
) -> Indicador:
    """
    Fórmula: LG = (Ativo Circ. + Realizável LP) / (Passivo Circ. + Passivo NC)
    Visão de longo prazo da liquidez.
    """
    num = ativo_circ + (realizavel_lp or 0)
    den = passivo_circ + (passivo_nc or 0)
    return Indicador(
        nome="LIQUIDEZ_GERAL",
        categoria="LIQUIDEZ",
        valor=_div(num, den),
        formula="(Ativo Circ. + Realizável LP) / (Pass. Circ. + Pass. NC)",
        unidade="x",
        melhor_quando="maior",
        numerador=num,
        denominador=den,
    )


def liquidez_imediata(caixa: float, passivo_circ: float) -> Indicador:
    """
    Fórmula: LI = Caixa e Equivalentes / Passivo Circulante
    Conta CVM: 1.01.01 / 2.01
    """
    return Indicador(
        nome="LIQUIDEZ_IMEDIATA",
        categoria="LIQUIDEZ",
        valor=_div(caixa, passivo_circ),
        formula="Caixa e Equivalentes / Passivo Circulante",
        unidade="x",
        melhor_quando="maior",
        numerador=caixa,
        denominador=passivo_circ,
    )


def capital_de_giro(ativo_circ: float, passivo_circ: float) -> Indicador:
    """
    Fórmula: CG = Ativo Circulante − Passivo Circulante
    Unidade: R$ — indica folga financeira de curto prazo.
    """
    val = ativo_circ - passivo_circ if (ativo_circ and passivo_circ) else None
    return Indicador(
        nome="CAPITAL_DE_GIRO",
        categoria="LIQUIDEZ",
        valor=val,
        formula="Ativo Circulante − Passivo Circulante",
        unidade="R$",
        melhor_quando="maior",
    )


# =============================================================================
# RENTABILIDADE
# =============================================================================

def roe(lucro_liquido: float, pl_medio: float) -> Indicador:
    """
    Fórmula: ROE = Lucro Líquido / Patrimônio Líquido Médio
    Unidade: %
    PL Médio = (PL_atual + PL_anterior) / 2
    Melhor: maior (ideal >15% para empresas maduras)
    Conta CVM: 3.11 / 2.03
    """
    return Indicador(
        nome="ROE",
        categoria="RENTABILIDADE",
        valor=_div(lucro_liquido, pl_medio),
        formula="Lucro Líquido / Patrimônio Líquido Médio",
        unidade="%",
        melhor_quando="maior",
        numerador=lucro_liquido,
        denominador=pl_medio,
        interpretacao="Retorno sobre o capital dos acionistas",
    )


def roa(lucro_liquido: float, ativo_total_medio: float) -> Indicador:
    """
    Fórmula: ROA = Lucro Líquido / Ativo Total Médio
    Unidade: %
    Melhor: maior (mede eficiência no uso de todos os ativos)
    """
    return Indicador(
        nome="ROA",
        categoria="RENTABILIDADE",
        valor=_div(lucro_liquido, ativo_total_medio),
        formula="Lucro Líquido / Ativo Total Médio",
        unidade="%",
        melhor_quando="maior",
        numerador=lucro_liquido,
        denominador=ativo_total_medio,
    )


def roic(nopat: float, capital_investido: float) -> Indicador:
    """
    Fórmula: ROIC = NOPAT / Capital Investido
    NOPAT = EBIT × (1 − Alíquota IR) ≈ EBIT × 0,66
    Capital Investido = PL + Dívida Líquida
    Unidade: %
    Melhor: maior (ROIC > WACC = criação de valor)
    """
    return Indicador(
        nome="ROIC",
        categoria="RENTABILIDADE",
        valor=_div(nopat, capital_investido),
        formula="NOPAT / (PL + Dívida Líquida)",
        unidade="%",
        melhor_quando="maior",
        numerador=nopat,
        denominador=capital_investido,
        interpretacao="ROIC > WACC indica criação de valor econômico",
    )


def roce(ebit: float, capital_empregado: float) -> Indicador:
    """
    Fórmula: ROCE = EBIT / (Ativo Total − Passivo Circulante)
    Capital Empregado = Ativo Total − Passivo Circulante
    """
    return Indicador(
        nome="ROCE",
        categoria="RENTABILIDADE",
        valor=_div(ebit, capital_empregado),
        formula="EBIT / (Ativo Total − Passivo Circulante)",
        unidade="%",
        melhor_quando="maior",
        numerador=ebit,
        denominador=capital_empregado,
    )


def margem_bruta(lucro_bruto: float, receita_liquida: float) -> Indicador:
    """Fórmula: MB = Lucro Bruto / Receita Líquida. Conta CVM: 3.03 / 3.01."""
    return Indicador(
        nome="MARGEM_BRUTA",
        categoria="RENTABILIDADE",
        valor=_div(lucro_bruto, receita_liquida),
        formula="Lucro Bruto / Receita Líquida",
        unidade="%",
        melhor_quando="maior",
        numerador=lucro_bruto,
        denominador=receita_liquida,
    )


def margem_ebit(ebit: float, receita_liquida: float) -> Indicador:
    """Fórmula: MEBIT = EBIT / Receita Líquida. Conta CVM: 3.05 / 3.01."""
    return Indicador(
        nome="MARGEM_EBIT",
        categoria="RENTABILIDADE",
        valor=_div(ebit, receita_liquida),
        formula="EBIT / Receita Líquida",
        unidade="%",
        melhor_quando="maior",
        numerador=ebit,
        denominador=receita_liquida,
    )


def margem_ebitda(ebitda: float, receita_liquida: float) -> Indicador:
    """
    Fórmula: MEBITDA = EBITDA / Receita Líquida
    EBITDA = EBIT + D&A (D&A extraído do DFC)
    """
    return Indicador(
        nome="MARGEM_EBITDA",
        categoria="RENTABILIDADE",
        valor=_div(ebitda, receita_liquida),
        formula="EBITDA / Receita Líquida",
        unidade="%",
        melhor_quando="maior",
        numerador=ebitda,
        denominador=receita_liquida,
    )


def margem_liquida(lucro_liquido: float, receita_liquida: float) -> Indicador:
    """Fórmula: ML = Lucro Líquido / Receita Líquida. Conta CVM: 3.11 / 3.01."""
    return Indicador(
        nome="MARGEM_LIQUIDA",
        categoria="RENTABILIDADE",
        valor=_div(lucro_liquido, receita_liquida),
        formula="Lucro Líquido / Receita Líquida",
        unidade="%",
        melhor_quando="maior",
        numerador=lucro_liquido,
        denominador=receita_liquida,
    )


# =============================================================================
# ENDIVIDAMENTO
# =============================================================================

def divida_liquida(divida_bruta: float, caixa: float) -> Indicador:
    """
    Fórmula: DL = Dívida Bruta − Caixa e Equivalentes
    Dívida Bruta = empréstimos CP + empréstimos LP (contas 2.01.04 + 2.02.01)
    Negativo indica posição de caixa líquido (saudável).
    """
    val = divida_bruta - caixa if (divida_bruta is not None and caixa is not None) else None
    return Indicador(
        nome="DIVIDA_LIQUIDA",
        categoria="ENDIVIDAMENTO",
        valor=val,
        formula="Dívida Bruta − Caixa e Equivalentes",
        unidade="R$",
        melhor_quando="menor",
    )


def dl_ebitda(divida_liquida_val: float, ebitda: float) -> Indicador:
    """
    Fórmula: DL/EBITDA = Dívida Líquida / EBITDA
    Unidade: vezes (x)
    Referência: <2x conservador, 2-3x moderado, >4x elevado
    Melhor: menor
    """
    return Indicador(
        nome="DL_EBITDA",
        categoria="ENDIVIDAMENTO",
        valor=_div(divida_liquida_val, ebitda),
        formula="Dívida Líquida / EBITDA",
        unidade="x",
        melhor_quando="menor",
        numerador=divida_liquida_val,
        denominador=ebitda,
        interpretacao="Quantos anos de EBITDA seriam necessários para quitar a dívida líquida",
    )


def dl_equity(divida_liquida_val: float, pl: float) -> Indicador:
    """
    Fórmula: D/E = Dívida Líquida / Patrimônio Líquido
    Alavancagem financeira. Valores <0.5 são considerados conservadores.
    """
    return Indicador(
        nome="DL_EQUITY",
        categoria="ENDIVIDAMENTO",
        valor=_div(divida_liquida_val, pl),
        formula="Dívida Líquida / Patrimônio Líquido",
        unidade="x",
        melhor_quando="menor",
        numerador=divida_liquida_val,
        denominador=pl,
    )


def cobertura_juros(ebit: float, despesa_financeira: float) -> Indicador:
    """
    Fórmula: ICR = EBIT / Despesas Financeiras
    >3x: confortável. <1.5x: risco de insolvência.
    Melhor: maior
    """
    return Indicador(
        nome="COBERTURA_JUROS",
        categoria="ENDIVIDAMENTO",
        valor=_div(ebit, abs(despesa_financeira) if despesa_financeira else None),
        formula="EBIT / Despesas Financeiras Líquidas",
        unidade="x",
        melhor_quando="maior",
        interpretacao="Quantas vezes o EBIT cobre as despesas financeiras",
    )


# =============================================================================
# EFICIÊNCIA
# =============================================================================

def giro_ativo(receita_liquida: float, ativo_total_medio: float) -> Indicador:
    """
    Fórmula: GA = Receita Líquida / Ativo Total Médio
    Quanto de receita é gerado para cada R$ de ativo.
    Melhor: maior
    """
    return Indicador(
        nome="GIRO_ATIVO",
        categoria="EFICIENCIA",
        valor=_div(receita_liquida, ativo_total_medio),
        formula="Receita Líquida / Ativo Total Médio",
        unidade="x",
        melhor_quando="maior",
    )


def prazo_medio_recebimento(contas_receber: float, receita_bruta: float) -> Indicador:
    """
    Fórmula: PMR = (Contas a Receber / Receita Bruta) × 365
    Dias médios para receber das vendas. Melhor: menor.
    """
    ratio = _div(contas_receber, receita_bruta)
    val = ratio * 365 if ratio is not None else None
    return Indicador(
        nome="PRAZO_MEDIO_RECEBIMENTO",
        categoria="EFICIENCIA",
        valor=val,
        formula="(Contas a Receber / Receita Bruta) × 365",
        unidade="dias",
        melhor_quando="menor",
    )


def prazo_medio_pagamento(fornecedores: float, cpv: float) -> Indicador:
    """
    Fórmula: PMP = (Fornecedores / CPV) × 365
    Dias médios para pagar fornecedores. Melhor: maior (mais prazo para pagar).
    """
    ratio = _div(fornecedores, cpv)
    val = ratio * 365 if ratio is not None else None
    return Indicador(
        nome="PRAZO_MEDIO_PAGAMENTO",
        categoria="EFICIENCIA",
        valor=val,
        formula="(Fornecedores / CPV) × 365",
        unidade="dias",
        melhor_quando="maior",
    )


# =============================================================================
# FLUXO DE CAIXA
# =============================================================================

def fcl(fco: float, capex: float) -> Indicador:
    """
    Fórmula: FCL = FCO − |CAPEX|
    CAPEX = saída de caixa em investimentos (conta DFC 6.02, valor negativo).
    FCL positivo indica geração real de caixa após reinvestimentos.
    """
    val = fco + capex if (fco is not None and capex is not None) else None
    return Indicador(
        nome="FCL",
        categoria="FLUXO_CAIXA",
        valor=val,
        formula="FCO − |CAPEX|",
        unidade="R$",
        melhor_quando="maior",
        numerador=fco,
        denominador=capex,
    )


def fcfe(fco: float, capex: float, variacao_divida: float) -> Indicador:
    """
    Fórmula: FCFE = FCO − CAPEX + Variação da Dívida
    Free Cash Flow to Equity — fluxo disponível para os acionistas.
    """
    val = None
    if fco is not None and capex is not None and variacao_divida is not None:
        val = fco + capex + variacao_divida
    return Indicador(
        nome="FCFE",
        categoria="FLUXO_CAIXA",
        valor=val,
        formula="FCO − CAPEX + Variação da Dívida",
        unidade="R$",
        melhor_quando="maior",
    )


def fcff(ebit: float, aliquota_ir: float, da: float, capex: float, variacao_capital_giro: float) -> Indicador:
    """
    Fórmula: FCFF = EBIT × (1 − IR) + D&A − CAPEX − Δ Capital de Giro
    Free Cash Flow to Firm — base para o DCF.
    aliquota_ir: ex 0.34 para Brasil (34%)
    """
    val = None
    if all(x is not None for x in [ebit, da, capex, variacao_capital_giro]):
        nopat = ebit * (1 - aliquota_ir)
        val = nopat + da + capex - variacao_capital_giro
    return Indicador(
        nome="FCFF",
        categoria="FLUXO_CAIXA",
        valor=val,
        formula="EBIT × (1−IR) + D&A − CAPEX − Δ Capital de Giro",
        unidade="R$",
        melhor_quando="maior",
        interpretacao="Base para valuation por DCF",
    )


def nopat(ebit: float, aliquota_ir: float = 0.34) -> Indicador:
    """
    Fórmula: NOPAT = EBIT × (1 − Alíquota IR)
    Net Operating Profit After Tax — lucro operacional pós-impostos.
    """
    val = ebit * (1 - aliquota_ir) if ebit is not None else None
    return Indicador(
        nome="NOPAT",
        categoria="FLUXO_CAIXA",
        valor=val,
        formula=f"EBIT × (1 − {aliquota_ir:.0%})",
        unidade="R$",
        melhor_quando="maior",
    )


# =============================================================================
# CRESCIMENTO (CAGR)
# =============================================================================

def cagr(valor_inicial: float, valor_final: float, n_anos: int) -> Optional[float]:
    """
    Fórmula: CAGR = (VF/VI)^(1/n) − 1
    Taxa de crescimento anual composta.
    """
    if not all([valor_inicial, valor_final, n_anos]) or valor_inicial <= 0 or n_anos <= 0:
        return None
    try:
        return (valor_final / valor_inicial) ** (1 / n_anos) - 1
    except (ValueError, ZeroDivisionError):
        return None


# =============================================================================
# MÚLTIPLOS DE MERCADO
# =============================================================================

def pl(preco: float, eps: float) -> Indicador:
    """
    Fórmula: P/L = Preço / LPA (Lucro Por Ação)
    LPA = Lucro Líquido / Ações em Circulação
    Melhor: menor (pagamento menor por cada R$ de lucro)
    Referência: <10x barato, 10-20x justo, >25x caro (varia por setor)
    """
    return Indicador(
        nome="P_L",
        categoria="MERCADO",
        valor=_div(preco, eps),
        formula="Preço / Lucro Por Ação",
        unidade="x",
        melhor_quando="menor",
        numerador=preco,
        denominador=eps,
        interpretacao="Anos de lucro necessários para recuperar o investimento",
    )


def pvp(preco: float, vpa: float) -> Indicador:
    """
    Fórmula: P/VP = Preço / Valor Patrimonial Por Ação
    VPA = Patrimônio Líquido / Ações em Circulação
    <1 = empresa vale menos que seu patrimônio (possível barganha)
    >3 = prêmio elevado sobre o patrimônio
    """
    return Indicador(
        nome="P_VP",
        categoria="MERCADO",
        valor=_div(preco, vpa),
        formula="Preço / Valor Patrimonial Por Ação",
        unidade="x",
        melhor_quando="menor",
        numerador=preco,
        denominador=vpa,
    )


def psr(market_cap: float, receita_liquida: float) -> Indicador:
    """
    Fórmula: PSR = Market Cap / Receita Líquida
    Price to Sales Ratio — útil para empresas pré-lucro.
    """
    return Indicador(
        nome="PSR",
        categoria="MERCADO",
        valor=_div(market_cap, receita_liquida),
        formula="Market Cap / Receita Líquida",
        unidade="x",
        melhor_quando="menor",
    )


def ev(market_cap: float, divida_bruta: float, caixa_val: float) -> Indicador:
    """
    Fórmula: EV = Market Cap + Dívida Bruta − Caixa
    Enterprise Value — valor total da empresa.
    """
    val = market_cap + divida_bruta - caixa_val if all(x is not None for x in [market_cap, divida_bruta, caixa_val]) else None
    return Indicador(
        nome="EV",
        categoria="MERCADO",
        valor=val,
        formula="Market Cap + Dívida Bruta − Caixa",
        unidade="R$",
        melhor_quando="neutro",
    )


def ev_ebit(ev_val: float, ebit: float) -> Indicador:
    """
    Fórmula: EV/EBIT = Enterprise Value / EBIT
    Melhor: menor. Referência: <10x barato, 10-20x justo.
    """
    return Indicador(
        nome="EV_EBIT",
        categoria="MERCADO",
        valor=_div(ev_val, ebit),
        formula="Enterprise Value / EBIT",
        unidade="x",
        melhor_quando="menor",
    )


def ev_ebitda(ev_val: float, ebitda: float) -> Indicador:
    """
    Fórmula: EV/EBITDA = Enterprise Value / EBITDA
    Melhor: menor. Referência: <6x barato, 6-12x justo, >15x caro.
    """
    return Indicador(
        nome="EV_EBITDA",
        categoria="MERCADO",
        valor=_div(ev_val, ebitda),
        formula="Enterprise Value / EBITDA",
        unidade="x",
        melhor_quando="menor",
        interpretacao="Múltiplo mais usado em fusões e aquisições",
    )


def dividend_yield(dividendo_por_acao: float, preco: float) -> Indicador:
    """
    Fórmula: DY = Dividendo Por Ação / Preço × 100
    Unidade: %
    Melhor: maior (renda passiva)
    Referência: >6% no Brasil é considerado bom DY
    """
    return Indicador(
        nome="DIVIDEND_YIELD",
        categoria="MERCADO",
        valor=_div(dividendo_por_acao, preco),
        formula="Dividendo Por Ação / Preço",
        unidade="%",
        melhor_quando="maior",
        numerador=dividendo_por_acao,
        denominador=preco,
    )


def peg_ratio(pl_val: float, cagr_lucro: float) -> Indicador:
    """
    Fórmula: PEG = P/L / CAGR Lucro (%)
    <1 = ação barata em relação ao crescimento esperado.
    """
    cagr_pct = cagr_lucro * 100 if cagr_lucro is not None else None
    return Indicador(
        nome="PEG",
        categoria="MERCADO",
        valor=_div(pl_val, cagr_pct),
        formula="P/L / CAGR Lucro (%)",
        unidade="x",
        melhor_quando="menor",
        interpretacao="Relaciona o P/L com o crescimento esperado — PEG <1 pode indicar subavaliação",
    )


# =============================================================================
# VALUATION INTRÍNSECO
# =============================================================================

def graham_number(eps: float, vpa: float) -> Optional[float]:
    """
    Fórmula: Graham = √(22,5 × LPA × VPA)
    Valor intrínseco segundo Benjamin Graham (Security Analysis).
    Válido apenas quando LPA > 0 e VPA > 0.
    """
    if eps is None or vpa is None or eps <= 0 or vpa <= 0:
        return None
    return math.sqrt(22.5 * eps * vpa)


def bazin_preco_justo(dividendo_anual: float, taxa_minima: float = 0.06) -> Optional[float]:
    """
    Fórmula: PJ_Bazin = Dividendo Anual Por Ação / Taxa Mínima de Retorno
    Décio Bazin: compra quando preço < PJ, vende quando preço > PJ.
    Taxa padrão: 6% a.a. (retorno mínimo exigido)
    """
    if dividendo_anual is None or dividendo_anual <= 0:
        return None
    return dividendo_anual / taxa_minima


def eva(nopat_val: float, capital_investido: float, wacc: float) -> Indicador:
    """
    Fórmula: EVA = NOPAT − (Capital Investido × WACC)
    Economic Value Added — positivo = criação de valor, negativo = destruição.
    Desenvolvido por Stewart & Stern.
    """
    val = None
    if all(x is not None for x in [nopat_val, capital_investido, wacc]):
        val = nopat_val - (capital_investido * wacc)
    return Indicador(
        nome="EVA",
        categoria="VALUATION",
        valor=val,
        formula="NOPAT − (Capital Investido × WACC)",
        unidade="R$",
        melhor_quando="maior",
        interpretacao="EVA > 0 indica que a empresa gera retorno acima do custo de capital",
    )


# =============================================================================
# RISCO / DESEMPENHO
# =============================================================================

def beta_calculado(retornos_acao: list[float], retornos_mercado: list[float]) -> Optional[float]:
    """
    Fórmula: β = Cov(Ri, Rm) / Var(Rm)
    Beta mede a sensibilidade da ação ao mercado (IBOVESPA).
    β=1: em linha com o mercado. β>1: mais volátil. β<1: menos volátil.
    Requer ao menos 24 observações para ser estatisticamente relevante.
    """
    import numpy as np
    if len(retornos_acao) < 24 or len(retornos_mercado) < 24:
        return None
    try:
        arr_a = np.array(retornos_acao, dtype=float)
        arr_m = np.array(retornos_mercado, dtype=float)
        cov = np.cov(arr_a, arr_m)[0][1]
        var = np.var(arr_m, ddof=1)
        return float(cov / var) if var != 0 else None
    except Exception:
        return None


def volatilidade_anualizada(retornos_diarios: list[float]) -> Optional[float]:
    """
    Fórmula: σ_anual = σ_diário × √252
    Desvio padrão dos retornos diários, anualizado por 252 pregões.
    """
    import numpy as np
    if len(retornos_diarios) < 20:
        return None
    sigma_diario = float(np.std(retornos_diarios, ddof=1))
    return sigma_diario * math.sqrt(252)
