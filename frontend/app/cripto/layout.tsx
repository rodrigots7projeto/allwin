"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart2, Zap, BrainCircuit, Repeat2, Bolt, CheckCircle2, Cpu } from "lucide-react";
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
  {
    href: "/cripto/finalizadas",
    label: "Finalizadas",
    Icon: CheckCircle2,
    active: (p: string) => p.startsWith("/cripto/finalizadas"),
    color: "#06B6D4",
  },
  {
    href: "/cripto/bot-srd",
    label: "BOT SRD",
    Icon: Cpu,
    active: (p: string) => p.startsWith("/cripto/bot-srd"),
    color: "#10B981",
  },
];

export default function CriptoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

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
      {/* Tab bar — fixed below the main header (top-[54px]) */}
      <div
        className="fixed left-0 right-0 z-40"
        style={{
          top: 54,
          background: "rgba(9,9,11,0.92)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end gap-0 no-scrollbar overflow-x-auto">
            {tabs.map(({ href, label, Icon, active, color }) => {
              const isActive = active(pathname);
              const isHovered = hoveredHref === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-1.5 px-3 py-2.5 text-[12px] whitespace-nowrap no-underline transition-all duration-150 shrink-0"
                  style={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#fff" : isHovered ? "var(--text-secondary)" : "var(--text-muted)",
                    background: isActive ? `${color}10` : isHovered ? "rgba(255,255,255,0.03)" : "transparent",
                    borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                  }}
                  onMouseEnter={() => setHoveredHref(href)}
                  onMouseLeave={() => setHoveredHref(null)}
                >
                  <Icon
                    size={11}
                    style={{
                      color: isActive ? color : isHovered ? color : "currentColor",
                      flexShrink: 0,
                      filter: isActive ? `drop-shadow(0 0 5px ${color}90)` : "none",
                      transition: "filter 0.15s, color 0.15s",
                    }}
                  />
                  {label}
                  {/* Glow line under active tab */}
                  {isActive && (
                    <span
                      style={{
                        position: "absolute",
                        bottom: -1,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "70%",
                        height: 2,
                        background: `linear-gradient(90deg, transparent, ${color}CC, transparent)`,
                        filter: `blur(1px)`,
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content — offset: header (54px) + accent line (2px) + tab bar (~40px) */}
      <div className="pt-[96px]">{children}</div>
    </CoinProvider>
  );
}
