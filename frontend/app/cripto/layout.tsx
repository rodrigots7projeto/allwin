"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Search,
  ArrowLeftRight,
  BarChart2,
  Zap,
  Crosshair,
  TrendingDown,
  Gauge,
  Bolt,
  FlaskConical,
  Rocket,
} from "lucide-react";

const STATIC_TABS = [
  { href: "/cripto",                 label: "Análise",    Icon: Search },
  { href: "/cripto/comparativo",     label: "vs BTC",     Icon: ArrowLeftRight },
  { href: "/cripto/charts",          label: "Gráficos",   Icon: BarChart2 },
  { href: "/cripto/sinais",          label: "Sinais IA",  Icon: Zap },
  { href: "/cripto/daytrade",        label: "Day Trade",  Icon: Crosshair },
  { href: "/cripto/futures",         label: "Futures IA", Icon: TrendingDown },
  { href: "/cripto/trade-futuros",   label: "Trade Fut.", Icon: Rocket },
  { href: "/cripto/rsscore",         label: "RS Score",   Icon: Gauge },
  { href: "/cripto/backtest",        label: "Backtest",   Icon: FlaskConical },
  { href: "/cripto/trade",           label: "Trade Spot", Icon: ArrowLeftRight },
];

export default function CriptoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const motorMatch = pathname.match(/^\/cripto\/motor\/([A-Z]+)$/i);
  const motorSimbol = motorMatch ? motorMatch[1].toUpperCase() : null;

  const tabs = [
    ...STATIC_TABS,
    ...(motorSimbol
      ? [{ href: `/cripto/motor/${motorSimbol}`, label: `Motor — ${motorSimbol}`, Icon: Bolt }]
      : []),
  ];

  return (
    <>
      {/* Tab bar — fixed below the main header (top-14 = 56px) */}
      <div
        className="fixed top-14 left-0 right-0 z-40 border-b"
        style={{
          background: "rgba(9,9,11,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderColor: "var(--border)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-0.5 overflow-x-auto py-2 no-scrollbar">
            {tabs.map(({ href, label, Icon }) => {
              const exact = href === "/cripto";
              const active = exact
                ? pathname === "/cripto"
                : pathname.startsWith(href);

              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] whitespace-nowrap no-underline transition-all duration-150 shrink-0"
                  style={{
                    fontWeight: active ? 600 : 400,
                    color: active ? "#ffffff" : "var(--text-muted)",
                    background: active
                      ? "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(6,182,212,0.15))"
                      : "transparent",
                    border: active
                      ? "1px solid rgba(59,130,246,0.3)"
                      : "1px solid transparent",
                    boxShadow: active
                      ? "0 0 12px rgba(59,130,246,0.15)"
                      : "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = "var(--text-secondary)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <Icon size={12} style={{ flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content — offset: header (56px) + tab bar (~44px) */}
      <div className="pt-[100px]">{children}</div>
    </>
  );
}
