"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Zap, BrainCircuit, Repeat2, Bolt } from "lucide-react";
import { CoinProvider } from "./CoinContext";

const STATIC_TABS = [
  {
    href: "/cripto",
    label: "Análise",
    Icon: BarChart2,
    active: (p: string) =>
      p === "/cripto" ||
      p.startsWith("/cripto/motor") ||
      p.startsWith("/cripto/charts") ||
      p.startsWith("/cripto/comparativo"),
    color: "#3B82F6",
  },
  {
    href: "/cripto/sinais",
    label: "Sinais IA",
    Icon: Zap,
    active: (p: string) =>
      p.startsWith("/cripto/sinais") ||
      p.startsWith("/cripto/rsscore") ||
      p.startsWith("/cripto/daytrade"),
    color: "#8B5CF6",
  },
  {
    href: "/cripto/futures",
    label: "IA Engine",
    Icon: BrainCircuit,
    active: (p: string) =>
      p.startsWith("/cripto/futures") ||
      p.startsWith("/cripto/ia-analisa") ||
      p.startsWith("/cripto/backtest"),
    color: "#10B981",
  },
  {
    href: "/cripto/trade",
    label: "Trade",
    Icon: Repeat2,
    active: (p: string) => p.startsWith("/cripto/trade"),
    color: "#F59E0B",
  },
];

export default function CriptoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const motorMatch = pathname.match(/^\/cripto\/motor\/([A-Z]+)$/i);
  const motorSimbol = motorMatch ? motorMatch[1].toUpperCase() : null;

  const tabs = [
    ...STATIC_TABS,
    ...(motorSimbol
      ? [{
          href: `/cripto/motor/${motorSimbol}`,
          label: motorSimbol,
          Icon: Bolt,
          active: (p: string) => p === `/cripto/motor/${motorSimbol}`,
          color: "#F7931A",
        }]
      : []),
  ];

  return (
    <CoinProvider>
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
          <div className="flex items-center gap-0.5 py-2 no-scrollbar">
            {tabs.map(({ href, label, Icon, active, color }) => {
              const isActive = active(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] whitespace-nowrap no-underline transition-all duration-150 shrink-0"
                  style={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#ffffff" : "var(--text-muted)",
                    background: isActive
                      ? `${color}25`
                      : "transparent",
                    border: isActive
                      ? `1px solid ${color}40`
                      : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-secondary)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "var(--text-muted)";
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <Icon size={12} style={{ color: isActive ? color : "currentColor", flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content — offset: header (56px) + tab bar (~44px) */}
      <div className="pt-[100px]">{children}</div>
    </CoinProvider>
  );
}
