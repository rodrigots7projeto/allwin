"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, CandlestickChart, GitCompare } from "lucide-react";

const TABS = [
  { href: "/cripto",          label: "Análise",     Icon: BarChart2,        exact: true  },
  { href: "/cripto/charts",   label: "Charts",      Icon: CandlestickChart, exact: false },
  { href: "/cripto/comparativo", label: "Comparativo", Icon: GitCompare,    exact: false },
];

export function AnaliseHubNav() {
  const pathname = usePathname();
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl mb-6"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {TABS.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-all duration-150 no-underline flex-1 justify-center"
            style={{
              background: active ? "rgba(59,130,246,0.15)" : "transparent",
              border: active ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
              color: active ? "#3B82F6" : "var(--text-muted)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <Icon size={12} style={{ flexShrink: 0 }} />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
