import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-20 text-center">
      <p className="text-6xl mb-4">🔍</p>
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
        Ticker não encontrado
      </h1>
      <p className="text-[var(--text-secondary)] mb-6">
        Verifique se o código está correto e se o ativo existe na B3.
        <br />
        Em modo de desenvolvimento, apenas{" "}
        <span className="font-mono text-emerald-500">PETR4 · VALE3 · ITUB4 · MGLU3</span>{" "}
        estão disponíveis sem token.
      </p>
      <Link
        href="/"
        className="inline-block px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors"
      >
        Voltar à busca
      </Link>
    </main>
  );
}
