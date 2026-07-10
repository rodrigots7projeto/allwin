"""
Runner do Motor de Cálculo — AllWin.

Orquestra o cálculo de todos os indicadores para uma empresa,
lendo os dados brutos do PostgreSQL e persistindo os resultados
na tabela indicador_calculado.

Fluxo:
  1. Carrega todos os períodos da empresa (DFP + ITR)
  2. Para cada período, extrai as contas-chave dos demonstrativos
  3. Calcula todos os indicadores usando formulas.py
  4. Persiste em indicador_calculado (insert-only, versão incrementada)
  5. Calcula indicadores de mercado usando cotação atual (quando disponível)
"""
import logging
from datetime import date
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..db import get_db
from ..db.models import (
    Empresa, PeriodoReferencia, DemonstrativoLinha, DfcLinha,
    IndicadorCalculado, CotacaoDiaria, Ticker, Provento, AcaoCapital,
)
from .formulas import (
    Indicador,
    liquidez_corrente, liquidez_seca, liquidez_geral, liquidez_imediata, capital_de_giro,
    roe, roa, roic, roce, nopat,
    margem_bruta, margem_ebit, margem_ebitda, margem_liquida,
    divida_liquida, dl_ebitda, dl_equity, cobertura_juros,
    giro_ativo, prazo_medio_recebimento, prazo_medio_pagamento,
    fcl, fcfe, fcff,
    pl, pvp, psr, ev, ev_ebit, ev_ebitda, dividend_yield,
    graham_number, bazin_preco_justo, eva,
    cagr,
)

logger = logging.getLogger(__name__)

ALIQUOTA_IR = 0.34   # alíquota padrão Brasil


class CalculadoraRunner:
    """Executa o pipeline completo de cálculo de indicadores."""

    def __init__(self, empresa_id: int) -> None:
        self.empresa_id = empresa_id

    async def run(self) -> dict:
        """Calcula todos os indicadores para a empresa e persiste no banco."""
        async with get_db() as db:
            periodos = await self._carregar_periodos(db)
            if not periodos:
                return {"status": "sem_dados", "empresa_id": self.empresa_id}

            inseridos = 0
            versao = await self._proxima_versao(db)

            dados_por_periodo: dict[int, dict] = {}

            for periodo in periodos:
                contas = await self._extrair_contas(db, periodo.id)
                dados_por_periodo[periodo.id] = contas
                indicadores = self._calcular_periodo(contas, periodo)
                inseridos += await self._persistir(db, indicadores, periodo, versao)

            # CAGRs históricos (requer série de períodos)
            cagrs = self._calcular_cagrs(dados_por_periodo, periodos)
            for nome, valor in cagrs.items():
                ind = Indicador(
                    nome=nome, categoria="CRESCIMENTO",
                    valor=valor, formula="(VF/VI)^(1/n) − 1", unidade="%",
                )
                await self._persistir_simples(db, ind, date.today(), versao)
                inseridos += 1

        return {"status": "ok", "empresa_id": self.empresa_id, "inseridos": inseridos}

    # ── Carregamento ──────────────────────────────────────────────────────────

    async def _carregar_periodos(self, db) -> list:
        result = await db.execute(
            select(PeriodoReferencia)
            .where(
                PeriodoReferencia.empresa_id == self.empresa_id,
                PeriodoReferencia.tipo_periodo == "DFP",
                PeriodoReferencia.consolidado == True,
            )
            .order_by(PeriodoReferencia.dt_fim_exercicio)
        )
        return list(result.scalars())

    async def _extrair_contas(self, db, periodo_id: int) -> dict:
        """Extrai as contas-chave de todos os demonstrativos de um período."""
        result = await db.execute(
            select(DemonstrativoLinha.cd_conta, DemonstrativoLinha.tipo_dem, DemonstrativoLinha.vl_conta)
            .where(DemonstrativoLinha.periodo_id == periodo_id)
        )
        # Monta um dict {tipo_dem: {cd_conta: valor}}
        contas: dict[str, dict[str, float]] = {}
        for row in result:
            tipo = row.tipo_dem
            if tipo not in contas:
                contas[tipo] = {}
            contas[tipo][row.cd_conta] = float(row.vl_conta) if row.vl_conta is not None else None

        # DFC separado
        dfc_result = await db.execute(
            select(DfcLinha.cd_conta, DfcLinha.vl_conta)
            .where(DfcLinha.periodo_id == periodo_id)
        )
        contas["DFC"] = {row.cd_conta: float(row.vl_conta) if row.vl_conta is not None else None
                         for row in dfc_result}

        return contas

    # ── Cálculo ───────────────────────────────────────────────────────────────

    def _calcular_periodo(self, contas: dict, periodo) -> list[Indicador]:
        """Calcula todos os indicadores fundamentais de um período."""
        g = lambda tipo, cd: (contas.get(tipo) or {}).get(cd)

        # Contas extraídas
        receita    = g("DRE",  "3.01")
        lucro_brt  = g("DRE",  "3.03")
        ebit       = g("DRE",  "3.05")
        ll         = g("DRE",  "3.11")
        ativo_tot  = g("BPA",  "1")
        ativo_circ = g("BPA",  "1.01")
        caixa      = g("BPA",  "1.01.01")
        pass_circ  = g("BPP",  "2.01")
        pass_nc    = g("BPP",  "2.02")
        pl_val     = g("BPP",  "2.03")
        fco        = g("DFC",  "6.01")
        fci        = g("DFC",  "6.02")   # negativo para investimentos

        # Estimativas
        da = self._estimar_da(contas.get("DFC") or {})
        ebitda = (ebit + da) if (ebit is not None and da is not None) else None
        divida_bruta = self._estimar_divida_bruta(contas)
        dl = divida_bruta - (caixa or 0) if divida_bruta is not None else (pass_nc - (caixa or 0) if pass_nc is not None else None)
        capex = fci   # FCI inclui CAPEX (sinal negativo)
        capital_inv = (pl_val or 0) + (dl or 0) if pl_val is not None else None
        nopat_val = ebit * (1 - ALIQUOTA_IR) if ebit else None

        indicadores: list[Indicador] = []
        add = indicadores.append

        # Liquidez
        if ativo_circ and pass_circ:
            add(liquidez_corrente(ativo_circ, pass_circ))
            add(liquidez_seca(ativo_circ, 0, pass_circ))   # estoques: 0 (sem detalhe)
            add(liquidez_imediata(caixa or 0, pass_circ))
            add(capital_de_giro(ativo_circ, pass_circ))
        if ativo_circ and pass_circ and pass_nc:
            add(liquidez_geral(ativo_circ, 0, pass_circ, pass_nc))

        # Rentabilidade
        if ll and pl_val:
            add(roe(ll, pl_val))
        if ll and ativo_tot:
            add(roa(ll, ativo_tot))
        if nopat_val and capital_inv:
            add(roic(nopat_val, capital_inv))
        if ebit and ativo_tot and pass_circ:
            add(roce(ebit, ativo_tot - pass_circ))
        if receita:
            if lucro_brt: add(margem_bruta(lucro_brt, receita))
            if ebit:      add(margem_ebit(ebit, receita))
            if ebitda:    add(margem_ebitda(ebitda, receita))
            if ll:        add(margem_liquida(ll, receita))

        # Endividamento
        if dl is not None:
            if ebitda: add(dl_ebitda(dl, ebitda))
            if pl_val: add(dl_equity(dl, pl_val))

        # Eficiência
        if receita and ativo_tot:
            add(giro_ativo(receita, ativo_tot))

        # Fluxo de caixa
        if fco and fci:
            add(fcl(fco, fci))
        if ebit and da is not None and fci is not None:
            add(fcff(ebit, ALIQUOTA_IR, da, fci, 0))
        if ebit:
            add(nopat(ebit, ALIQUOTA_IR))

        return indicadores

    def _estimar_da(self, dfc: dict) -> Optional[float]:
        """Extrai D&A do DFC buscando por padrão nas descrições (proxy via conta)."""
        # Contas comuns: 6.01.01.01 (depreciação) — mas variam por empresa
        # Aqui buscamos em todas as subcontas cujo cd começa com 6.01 e são positivas
        total = 0.0
        for cd, vl in dfc.items():
            if cd.startswith("6.01") and cd != "6.01" and vl and vl > 0:
                # proxy: subconta positiva dentro do FCO = ajuste não-caixa (D&A)
                total += vl
        return total if total > 0 else None

    def _estimar_divida_bruta(self, contas: dict) -> Optional[float]:
        """Estima dívida bruta somando empréstimos CP + LP."""
        bpp = contas.get("BPP") or {}
        # Contas típicas: 2.01.04 (empréstimos CP), 2.02.01 (empréstimos LP)
        cp = bpp.get("2.01.04") or 0
        lp = bpp.get("2.02.01") or 0
        total = cp + lp
        if total > 0:
            return total
        # Fallback: usa passivo NC inteiro como proxy
        return bpp.get("2.02")

    # ── CAGRs ────────────────────────────────────────────────────────────────

    def _calcular_cagrs(self, dados: dict, periodos: list) -> dict:
        """Calcula CAGRs de receita, lucro e patrimônio líquido."""
        if len(periodos) < 2:
            return {}

        def serie(tipo, cd):
            vals = []
            for p in periodos:
                c = (dados.get(p.id) or {}).get(tipo) or {}
                vals.append(c.get(cd))
            return vals

        n = len(periodos) - 1
        rec = serie("DRE", "3.01")
        ll  = serie("DRE", "3.11")
        pl  = serie("BPP", "2.03")

        return {
            "CAGR_RECEITA":    cagr(rec[0], rec[-1], n),
            "CAGR_LUCRO":      cagr(ll[0], ll[-1], n),
            "CAGR_PATRIMONIO": cagr(pl[0], pl[-1], n),
        }

    # ── Persistência ──────────────────────────────────────────────────────────

    async def _proxima_versao(self, db) -> int:
        result = await db.execute(
            select(func.max(IndicadorCalculado.versao_calculo))
            .where(IndicadorCalculado.empresa_id == self.empresa_id)
        )
        atual = result.scalar() or 0
        return atual + 1

    async def _persistir(self, db, indicadores: list[Indicador], periodo, versao: int) -> int:
        registros = [
            {
                "empresa_id":     self.empresa_id,
                "periodo_id":     periodo.id,
                "data_referencia": periodo.dt_fim_exercicio,
                "categoria":      ind.categoria,
                "nome":           ind.nome,
                "valor":          ind.valor,
                "formula":        ind.formula,
                "numerador":      ind.numerador,
                "denominador":    ind.denominador,
                "unidade":        ind.unidade,
                "versao_calculo": versao,
            }
            for ind in indicadores if ind.valor is not None
        ]
        if registros:
            await db.execute(
                pg_insert(IndicadorCalculado)
                .values(registros)
                .on_conflict_do_nothing()
            )
        return len(registros)

    async def _persistir_simples(self, db, ind: Indicador, data: date, versao: int) -> None:
        if ind.valor is None:
            return
        await db.execute(
            pg_insert(IndicadorCalculado).values({
                "empresa_id":     self.empresa_id,
                "data_referencia": data,
                "categoria":      ind.categoria,
                "nome":           ind.nome,
                "valor":          ind.valor,
                "formula":        ind.formula,
                "unidade":        ind.unidade,
                "versao_calculo": versao,
            }).on_conflict_do_nothing()
        )
