import { EmpresaInfoCard } from "@/components/EmpresaInfoCard";
import { FundamentosSection } from "@/components/FundamentosSection";
import { PriceChart } from "@/components/PriceChart";
import { QuoteCard } from "@/components/QuoteCard";
import { ValuationSection } from "@/components/ValuationSection";
import {
  getCotacao,
  getEmpresaB3,
  getFundamentos,
  getHistorico,
  getIndicesDoTicker,
  getValuation,
} from "@/lib/api";
import type { EmpresaB3, FundamentosData, ValuationData } from "@/types";
import { CarteiraBotoes } from "@/components/carteira/CarteiraBotoes";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { ticker } = await params;
  return {
    title: `${ticker.toUpperCase()} — AllWin B3`,
    description: `Análise e valuation de ${ticker.toUpperCase()} na B3.`,
  };
}

export default async function AtivoPage({ params }: PageProps) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();

  let cotacao, historico;
  let fundamentos: FundamentosData | null = null;
  let valuation: ValuationData | null = null;
  let empresaB3: EmpresaB3 | null = null;
  let indices: string[] = [];

  try {
    [cotacao, historico] = await Promise.all([getCotacao(t), getHistorico(t)]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("não encontrado") || msg.includes("não disponível")) notFound();
    return (
      <>
        <main className="max-w-6xl mx-auto px-4 py-10">
          <Link
            href="/"
            className="text-sm text-[var(--text-secondary)] hover:text-emerald-500 mb-6 inline-block"
          >
            ← Voltar
          </Link>
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-red-400">
            <h2 className="font-semibold mb-1">Erro ao buscar dados</h2>
            <p className="text-sm">{msg}</p>
          </div>
        </main>
      </>
    );
  }

  // Todas as fontes opcionais em paralelo (nenhuma bloqueia a página)
  const [fund, val, emp, idxResp] = await Promise.all([
    getFundamentos(t).catch(() => null),
    getValuation(t).catch(() => null),
    getEmpresaB3(t).catch(() => null),
    getIndicesDoTicker(t).catch(() => null),
  ]);
  fundamentos = fund;
  valuation = val;
  empresaB3 = emp;
  indices = idxResp?.indices ?? [];

  return (
    <>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="text-sm text-[var(--text-secondary)] hover:text-emerald-500 transition-colors"
          >
            ← Voltar à busca
          </Link>
          <CarteiraBotoes ticker={t} nome={cotacao.nome_curto} />
        </div>

        <div className="flex flex-col gap-6">
          <QuoteCard data={cotacao} indices={indices} />
          {empresaB3 && <EmpresaInfoCard empresa={empresaB3} />}
          <PriceChart dados={historico} ticker={t} />
          {valuation && <ValuationSection data={valuation} />}
          {fundamentos && <FundamentosSection data={fundamentos} />}
        </div>

        {/* Placeholder — fase IA */}
        <div className="mt-6">
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-5 text-center opacity-50">
            <div className="text-2xl mb-2">🤖</div>
            <p className="text-xs text-[var(--text-secondary)] font-medium">Em breve</p>
            <p className="text-sm text-[var(--text-primary)] mt-0.5">Tese de investimento por IA</p>
          </div>
        </div>
      </main>
    </>
  );
}
