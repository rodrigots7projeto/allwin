import type { EmpresaB3 } from "@/types";

function fmtCnpj(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function fmtData(d: string) {
  if (!d || d.startsWith("31/12/9999")) return "—";
  return d.split(" ")[0]; // remove hora
}

interface Props {
  empresa: EmpresaB3;
}

export function EmpresaInfoCard({ empresa }: Props) {
  const tickers = empresa.otherCodes?.filter((c) => !c.code.includes("-")) ?? [];
  const setor = empresa.industryClassification?.split("/").map((s) => s.trim()) ?? [];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
      <h2 className="text-sm font-semibold text-[var(--text-secondary)] mb-4 uppercase tracking-wide">
        Dados da Empresa — B3
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
        {/* Razão social */}
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="text-xs text-[var(--text-secondary)] mb-0.5">Razão Social</p>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{empresa.companyName}</p>
        </div>

        {/* CNPJ */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-0.5">CNPJ</p>
          <p className="text-sm font-mono text-[var(--text-primary)]">{fmtCnpj(empresa.cnpj)}</p>
        </div>

        {/* Código CVM */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-0.5">Código CVM</p>
          <p className="text-sm font-mono text-[var(--text-primary)]">{empresa.codeCVM}</p>
        </div>

        {/* Mercado / Governança */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-0.5">Mercado / Governança</p>
          <p className="text-sm font-semibold text-emerald-500">{empresa.market || empresa.segment || "—"}</p>
        </div>

        {/* Segmento */}
        {empresa.segment && empresa.segment !== empresa.market && (
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-0.5">Segmento</p>
            <p className="text-sm text-[var(--text-primary)]">{empresa.segment}</p>
          </div>
        )}

        {/* Data de listagem */}
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-0.5">Listada desde</p>
          <p className="text-sm text-[var(--text-primary)]">{fmtData(empresa.dateListing)}</p>
        </div>

        {/* Setor / Subsetor / Segmento de atuação */}
        {setor.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-[var(--text-secondary)] mb-1">Classificação Setorial</p>
            <div className="flex flex-wrap gap-2">
              {setor.map((s, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--text-primary)]"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Todos os tickers */}
        {tickers.length > 0 && (
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-[var(--text-secondary)] mb-1">Ativos negociados</p>
            <div className="flex flex-wrap gap-2">
              {tickers.map((c) => (
                <a
                  key={c.code}
                  href={`/ativo/${c.code}`}
                  className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg
                             border border-[var(--border)] text-[var(--text-primary)]
                             hover:border-emerald-500 hover:text-emerald-500 transition-colors"
                >
                  {c.code}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Website */}
        {empresa.website && (
          <div className="sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-[var(--text-secondary)] mb-0.5">Website</p>
            <a
              href={`https://${empresa.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-500 hover:underline"
            >
              {empresa.website}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
