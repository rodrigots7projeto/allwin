"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { ThemeToggle } from "./ThemeToggle";
import {
  LayoutDashboard, BarChart2, Zap, BrainCircuit, Repeat2,
  CheckCircle2, Cpu, Trophy, Menu, X, ChevronLeft, TrendingUp,
  Brain, LogOut, Wallet, Flame,
} from "lucide-react";
import { getAuthData, logout } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Home", Icon: LayoutDashboard, color: "#F7931A", active: (p: string) => p === "/" },
  {
    href: "/carteira",
    label: "Carteira",
    Icon: Wallet,
    color: "#10B981",
    active: (p: string) => p === "/carteira" || p.startsWith("/carteira/"),
  },
  {
    href: "/futures",
    label: "Futures",
    Icon: Flame,
    color: "#6366f1",
    active: (p: string) => p === "/futures" || p.startsWith("/futures/"),
  },
  {
    href: "/cripto",
    label: "Análise",
    Icon: BarChart2,
    color: "#3B82F6",
    active: (p: string) => p === "/cripto" || p.startsWith("/cripto/motor") || p.startsWith("/cripto/charts") || p.startsWith("/cripto/comparativo"),
  },
  {
    href: "/cripto/sinais",
    label: "Sinais IA",
    Icon: Zap,
    color: "#8B5CF6",
    active: (p: string) => p.startsWith("/cripto/sinais") || p.startsWith("/cripto/rsscore") || p.startsWith("/cripto/daytrade"),
  },
  {
    href: "/cripto/futures",
    label: "IA Engine",
    Icon: BrainCircuit,
    color: "#10B981",
    active: (p: string) => p.startsWith("/cripto/futures") || p.startsWith("/cripto/ia-analisa") || p.startsWith("/cripto/backtest") || p.startsWith("/cripto/sinais-futuros"),
  },
  {
    href: "/cripto/cerebro",
    label: "Cérebro",
    Icon: Brain,
    color: "#6366f1",
    active: (p: string) => p.startsWith("/cripto/cerebro"),
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
    label: "Histórico",
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
  {
    href: "/cripto/ranking",
    label: "Rankings",
    Icon: Trophy,
    color: "#FBBF24",
    active: (p: string) => p.startsWith("/cripto/ranking"),
  },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<string | null>(null);

  useEffect(() => {
    const d = getAuthData();
    if (d) setUsuario(d.usuario);
  }, []);

  const currentNav = NAV.find((n) => n.active(pathname));

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: "rgba(9,9,11,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Brand accent line */}
        <div style={{ height: 2, background: "linear-gradient(90deg, #6366f1 0%, #fbbf24 50%, transparent 100%)", opacity: 0.7 }} />

        <div className="max-w-7xl mx-auto px-4 h-[52px] flex items-center gap-2">
          {/* Back button */}
          {!isHome && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Voltar"
              className="flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 transition-all duration-150"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text-muted)", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)"; e.currentTarget.style.color = "#818cf8"; e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            >
              <ChevronLeft size={14} />
            </button>
          )}

          {/* Logo */}
          <Link href="/" className="shrink-0 flex items-center gap-2 no-underline group">
            <div style={{
              width: 26, height: 26, borderRadius: 8,
              background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(251,191,36,0.1))",
              border: "1px solid rgba(99,102,241,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              transition: "box-shadow 0.2s",
            }} className="group-hover:shadow-[0_0_12px_rgba(99,102,241,0.4)]">
              <TrendingUp size={13} style={{ color: "#6366f1" }} />
            </div>
            <span className="text-[16px] font-extrabold tracking-tight" style={{
              fontFamily: "var(--font-sora, system-ui)",
              background: "linear-gradient(135deg, #6366f1 0%, #fbbf24 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>
              AllWin
            </span>
            <span className="hidden sm:inline text-[9.5px] font-bold px-1.5 py-0.5 rounded" style={{
              background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "rgba(130,140,250,0.9)", letterSpacing: "0.08em",
            }}>
              QUANT
            </span>
          </Link>

          {/* Separator */}
          <div className="hidden sm:block h-4 w-px shrink-0 mx-1" style={{ background: "rgba(255,255,255,0.08)" }} />

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-0.5 flex-1 overflow-x-auto no-scrollbar">
            {NAV.map(({ href, label, Icon, color, active }) => {
              const isActive = active(pathname);
              const isHovered = hoveredHref === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 whitespace-nowrap no-underline"
                  style={{
                    color: isActive ? "#fff" : isHovered ? "var(--text-secondary)" : "var(--text-muted)",
                    background: isActive ? `${color}18` : isHovered ? "rgba(255,255,255,0.04)" : "transparent",
                    fontWeight: isActive ? 600 : 400,
                    borderBottom: isActive ? `2px solid ${color}` : "2px solid transparent",
                    paddingBottom: "4px",
                  }}
                  onMouseEnter={() => setHoveredHref(href)}
                  onMouseLeave={() => setHoveredHref(null)}
                >
                  <Icon size={12} style={{ color: isActive ? color : isHovered ? color : "currentColor", flexShrink: 0, filter: isActive ? `drop-shadow(0 0 6px ${color}80)` : "none", transition: "filter 0.15s" }} />
                  {label}
                  {isActive && (
                    <span style={{
                      position: "absolute", bottom: -1, left: "50%", transform: "translateX(-50%)",
                      width: "60%", height: 2, borderRadius: 1,
                      background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                      boxShadow: `0 0 6px ${color}`,
                    }} />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Mobile: current page label */}
          <div className="flex sm:hidden flex-1 justify-center">
            {currentNav && (
              <span className="text-[13px] flex items-center gap-1.5 font-semibold" style={{ color: "var(--text-primary)" }}>
                <currentNav.Icon size={13} style={{ color: currentNav.color }} />
                {currentNav.label}
              </span>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {/* User avatar */}
            {usuario && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "linear-gradient(135deg, #6366f1, #818cf8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 900, color: "#fff", flexShrink: 0,
                }}>
                  {usuario[0].toUpperCase()}
                </div>
                <span className="text-[11.5px] font-semibold" style={{ color: "#a5b4fc" }}>{usuario}</span>
              </div>
            )}

            <ThemeToggle />

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sair"
              className="hidden sm:flex items-center justify-center w-7 h-7 rounded-lg border shrink-0 transition-all duration-150"
              style={{ borderColor: "rgba(239,68,68,0.2)", color: "#ef4444", background: "rgba(239,68,68,0.06)" }}
              title="Sair"
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.06)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; }}
            >
              <LogOut size={13} />
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
              className="sm:hidden flex items-center justify-center w-7 h-7 rounded-lg border transition-all duration-150"
              style={{ borderColor: "rgba(255,255,255,0.08)", color: "var(--text-secondary)", background: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(99,102,241,0.35)"; e.currentTarget.style.background = "rgba(99,102,241,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "transparent"; }}
            >
              {mobileOpen ? <X size={14} /> : <Menu size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 overflow-y-auto"
          style={{ paddingTop: "54px", background: "rgba(9,9,11,0.97)", backdropFilter: "blur(20px)" }}
          onClick={() => setMobileOpen(false)}
        >
          <div style={{ height: 1, background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)" }} />
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
                    background: isActive ? `${color}10` : "transparent",
                    border: isActive ? `1px solid ${color}25` : "1px solid transparent",
                    color: isActive ? "#fff" : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 400, fontSize: 14,
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={16} style={{ color }} />
                  </div>
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 mt-2"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 14, width: "100%", cursor: "pointer" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <LogOut size={16} style={{ color: "#ef4444" }} />
              </div>
              Sair da plataforma
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
