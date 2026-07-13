"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import {
  LayoutDashboard,
  BarChart2,
  Zap,
  BrainCircuit,
  Repeat2,
  CheckCircle2,
  Cpu,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";

const NAV = [
  {
    href: "/",
    label: "Dashboard",
    Icon: LayoutDashboard,
    color: "#F7931A",
    active: (p: string) => p === "/",
  },
  {
    href: "/cripto",
    label: "Análise",
    Icon: BarChart2,
    color: "#3B82F6",
    active: (p: string) =>
      p === "/cripto" ||
      p.startsWith("/cripto/motor") ||
      p.startsWith("/cripto/charts") ||
      p.startsWith("/cripto/comparativo"),
  },
  {
    href: "/cripto/sinais",
    label: "Sinais IA",
    Icon: Zap,
    color: "#8B5CF6",
    active: (p: string) =>
      p.startsWith("/cripto/sinais") ||
      p.startsWith("/cripto/rsscore") ||
      p.startsWith("/cripto/daytrade"),
  },
  {
    href: "/cripto/futures",
    label: "IA Engine",
    Icon: BrainCircuit,
    color: "#10B981",
    active: (p: string) =>
      p.startsWith("/cripto/futures") ||
      p.startsWith("/cripto/ia-analisa") ||
      p.startsWith("/cripto/backtest"),
  },
  {
    href: "/cripto/trade",
    label: "Trade",
    Icon: Repeat2,
    color: "#F59E0B",
    active: (p: string) => p.startsWith("/cripto/trade"),
  },
  {
    href: "/cripto/finalizadas",
    label: "Finalizadas",
    Icon: CheckCircle2,
    color: "#06B6D4",
    active: (p: string) => p.startsWith("/cripto/finalizadas"),
  },
  {
    href: "/cripto/bot-srd",
    label: "BOT SRD",
    Icon: Cpu,
    color: "#10B981",
    active: (p: string) => p.startsWith("/cripto/bot-srd"),
  },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNav = NAV.find((n) => n.active(pathname));

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          borderColor: "var(--border)",
          background: "rgba(9,9,11,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-2">
          {/* Back button */}
          {!isHome && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Voltar"
              className="flex items-center justify-center w-8 h-8 rounded-lg border shrink-0 transition-all duration-150"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-muted)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--primary-border)";
                e.currentTarget.style.color = "var(--primary)";
                e.currentTarget.style.background = "var(--primary-glow)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <ChevronLeft size={15} />
            </button>
          )}

          {/* Logo */}
          <Link href="/" className="shrink-0 flex items-center gap-1.5 no-underline">
            <span
              className="text-[17px] font-extrabold tracking-tight"
              style={{
                fontFamily: "var(--font-sora, system-ui)",
                background: "linear-gradient(135deg, #F7931A 0%, #FBBF24 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              AllWin
            </span>
            <span
              className="hidden sm:inline text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(247,147,26,0.12)",
                border: "1px solid rgba(247,147,26,0.25)",
                color: "#F7931A",
                letterSpacing: "0.06em",
              }}
            >
              CRIPTO
            </span>
          </Link>

          {/* Separator */}
          <div
            className="hidden sm:block h-5 w-px shrink-0 mx-1"
            style={{ background: "var(--border)" }}
          />

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-0.5 flex-1 overflow-x-auto">
            {NAV.map(({ href, label, Icon, color, active }) => {
              const isActive = active(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-150 whitespace-nowrap no-underline"
                  style={{
                    color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                    background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                    fontWeight: isActive ? 600 : 400,
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
                  <Icon
                    size={13}
                    style={{ color: isActive ? color : "currentColor", flexShrink: 0 }}
                  />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile: current page label */}
          <div className="flex sm:hidden flex-1 justify-center">
            {currentNav && (
              <span
                className="text-[13px] flex items-center gap-1.5 font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                <currentNav.Icon size={13} style={{ color: currentNav.color }} />
                {currentNav.label}
              </span>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
              className="sm:hidden flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-150"
              style={{
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
                background: "transparent",
              }}
            >
              {mobileOpen ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 overflow-y-auto pt-14"
          style={{ background: "var(--bg-page)" }}
          onClick={() => setMobileOpen(false)}
        >
          <nav className="p-4 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
            {NAV.map(({ href, label, Icon, color, active }) => {
              const isActive = active(pathname);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all duration-150"
                  style={{
                    background: isActive ? "rgba(247,147,26,0.08)" : "transparent",
                    border: isActive
                      ? "1px solid rgba(247,147,26,0.2)"
                      : "1px solid transparent",
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 14,
                  }}
                >
                  <Icon size={18} style={{ color, flexShrink: 0 }} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
