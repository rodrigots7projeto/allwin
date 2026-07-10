import { MarketPanel } from "@/components/MarketPanel";
import { SearchBar } from "@/components/SearchBar";
import { getMercado } from "@/lib/api";
import Link from "next/link";

const FEATURES = [
  {
    icone: "📈",
    titulo: "Cotação em tempo real",
    descricao:
      "Preço atual, variação do dia, faixa de 52 semanas, volume e market cap — ações, FIIs e BDRs da B3.",
    href: "/ativo/PETR4",
    badge: "Disponível",
    badgeCor: "bg-emerald-500/15 text-emerald-400",
  },
  {
    icone: "📊",
    titulo: "Indicadores históricos",
    descricao:
      "P/L, ROE, ROIC, margens e endividamento — comparados com a média histórica do próprio ativo (fonte: CVM).",
    href: "/ativo/PETR4",
    badge: "Disponível",
    badgeCor: "bg-emerald-500/15 text-emerald-400",
  },
  {
    icone: "🎯",
    titulo: "Valuation em 3 cenários",
    descricao:
      "Pessimista, base e otimista. DCF, Graham, Bazin e múltiplos calculados em Python puro.",
    href: "/ativo/PETR4",
    badge: "Disponível",
    badgeCor: "bg-emerald-500/15 text-emerald-400",
  },
  {
    icone: "🤖",
    titulo: "Interpretação por IA",
    descricao:
      "Claude analisa os números e explica o veredito em linguagem clara. A IA interpreta — o Python calcula.",
    href: "/ativo/PETR4",
    badge: "Em breve",
    badgeCor: "bg-amber-500/15 text-amber-400",
  },
];

export default async function Home() {
  // Carrega ações e FIIs em paralelo
  const [acoes, fiis] = await Promise.all([
    getMercado("acoes").catch(() => []),
    getMercado("fiis").catch(() => []),
  ]);

  return (
    <>
      <main className="flex flex-col items-center px-4 py-14 gap-14">
        {/* Hero */}
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-3">
            Descubra o valor real do seu ativo
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
            Análise fundamentalista, valuation em 3 cenários e dados oficiais CVM + B3
            para ações, FIIs e BDRs.
          </p>
        </div>

        <SearchBar />

        {/* Painel de ações */}
        {acoes.length > 0 && (
          <div className="w-full max-w-5xl">
            <MarketPanel ativos={acoes} titulo="Ações" />
          </div>
        )}

        {/* Painel de FIIs */}
        {fiis.length > 0 && (
          <div className="w-full max-w-5xl">
            <MarketPanel ativos={fiis} titulo="Fundos Imobiliários (FIIs)" />
          </div>
        )}

        {/* Cards de recurso */}
        <div className="w-full max-w-5xl">
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
            O que você encontra aqui
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map(({ icone, titulo, descricao, href, badge, badgeCor }) => (
              <Link
                key={titulo}
                href={href}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5
                           hover:border-emerald-500/50 hover:bg-emerald-500/5
                           transition-all duration-200 cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-2xl">{icone}</div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeCor}`}>
                    {badge}
                  </span>
                </div>
                <h3 className="font-semibold text-[var(--text-primary)] mb-1 group-hover:text-emerald-500 transition-colors">
                  {titulo}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{descricao}</p>
                <div className="mt-4 text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Explorar →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
