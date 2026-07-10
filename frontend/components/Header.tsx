"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import {
  BarChart2,
  Briefcase,
  TrendingUp,
  MessageCircle,
  Calculator,
  Wallet,
  ArrowLeftRight,
  Activity,
  FileText,
  Trophy,
  Bitcoin,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";

const NAV = [
  { href: "/",                label: "B3",              Icon: BarChart2,       color: "#22C55E" },
  { href: "/portfolio-alpha", label: "Portfólio Alpha", Icon: Briefcase,       color: "#60A5FA" },
  { href: "/rs-analisa",      label: "RS Analisa",      Icon: TrendingUp,      color: "#34D399" },
  { href: "/chat",            label: "Chat IA",         Icon: MessageCircle,   color: "#A78BFA" },
  { href: "/simulador",       label: "Simulador",       Icon: Calculator,      color: "#C084FC" },
  { href: "/carteira",        label: "Carteira",        Icon: Wallet,          color: "#F472B6" },
  { href: "/comparar",        label: "Comparar",        Icon: ArrowLeftRight,  color: "#FB923C" },
  { href: "/radar",           label: "Radar",           Icon: Activity,        color: "#F87171" },
  { href: "/documentos",      label: "Docs CVM",        Icon: FileText,        color: "#38BDF8" },
  { href: "/ranking",         label: "Ranking",         Icon: Trophy,          color: "#FBBF24" },
  { href: "/cripto",          label: "Cripto",          Icon: Bitcoin,         color: "#F97316" },
];

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentNav = NAV.find((n) =>
    n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)
  );

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
                background: "linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              AllWin
            </span>
          </Link>

          {/* Separator */}
          <div
            className="hidden sm:block h-5 w-px shrink-0 mx-1"
            style={{ background: "var(--border)" }}
          />

          {/* Desktop Nav */}
          <nav className="hidden sm:flex items-center gap-0.5 flex-1 overflow-x-auto">
            {NAV.map(({ href, label, Icon, color }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all duration-150 whitespace-nowrap no-underline"
                  style={{
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                    background: active
                      ? "rgba(255,255,255,0.06)"
                      : "transparent",
                    fontWeight: active ? 600 : 400,
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
                  <Icon
                    size={13}
                    style={{ color: active ? color : "currentColor", flexShrink: 0 }}
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

      {/* Mobile full-screen drawer */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 overflow-y-auto pt-14"
          style={{ background: "var(--bg-page)" }}
          onClick={() => setMobileOpen(false)}
        >
          <nav className="p-4 flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
            {NAV.map(({ href, label, Icon, color }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl no-underline transition-all duration-150"
                  style={{
                    background: active ? "var(--primary-glow)" : "transparent",
                    border: active
                      ? "1px solid var(--primary-border)"
                      : "1px solid transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
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
