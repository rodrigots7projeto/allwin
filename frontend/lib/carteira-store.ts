import type { CarteiraFavorito, OperacaoCarteira, PosicaoCarteira } from "@/types";

const KEY_OPS    = "allwin_carteira_v1";
const KEY_FAV    = "allwin_favoritos_v1";
const KEY_SEEDED = "allwin_carteira_seeded_v1";

// ─── Raw storage ──────────────────────────────────────────────────────────────

function loadOps(): OperacaoCarteira[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY_OPS) ?? "[]"); } catch { return []; }
}
function saveOps(ops: OperacaoCarteira[]) {
  localStorage.setItem(KEY_OPS, JSON.stringify(ops));
}
function loadFavs(): CarteiraFavorito[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY_FAV) ?? "[]"); } catch { return []; }
}
function saveFavs(favs: CarteiraFavorito[]) {
  localStorage.setItem(KEY_FAV, JSON.stringify(favs));
}

// ─── CRUD Operações ───────────────────────────────────────────────────────────

export function addOperacao(op: Omit<OperacaoCarteira, "id" | "timestamp">): OperacaoCarteira {
  const ops = loadOps();
  const nova: OperacaoCarteira = {
    ...op,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  ops.push(nova);
  saveOps(ops);
  return nova;
}

export function editOperacao(id: string, patch: Partial<Omit<OperacaoCarteira, "id" | "timestamp">>) {
  const ops = loadOps();
  const i = ops.findIndex((o) => o.id === id);
  if (i >= 0) { ops[i] = { ...ops[i], ...patch }; saveOps(ops); }
}

export function deleteOperacao(id: string) {
  saveOps(loadOps().filter((o) => o.id !== id));
}

export function getOperacoes(): OperacaoCarteira[] {
  return loadOps();
}

// ─── Favoritos ────────────────────────────────────────────────────────────────

export function toggleFav(ticker: string, nome?: string): boolean {
  const favs = loadFavs();
  const idx = favs.findIndex((f) => f.ticker === ticker);
  if (idx >= 0) { favs.splice(idx, 1); saveFavs(favs); return false; }
  favs.push({ ticker, nome, timestamp: Date.now() });
  saveFavs(favs);
  return true;
}

export function getFavs(): CarteiraFavorito[] { return loadFavs(); }
export function isFav(ticker: string): boolean { return loadFavs().some((f) => f.ticker === ticker); }

// ─── Cálculo de posições ──────────────────────────────────────────────────────

export function calcularPosicoes(operacoes: OperacaoCarteira[]): PosicaoCarteira[] {
  const byTicker = new Map<string, OperacaoCarteira[]>();
  for (const op of operacoes) {
    if (!byTicker.has(op.ticker)) byTicker.set(op.ticker, []);
    byTicker.get(op.ticker)!.push(op);
  }

  const posicoes: PosicaoCarteira[] = [];

  for (const [ticker, ops] of byTicker.entries()) {
    const sorted = [...ops].sort((a, b) => a.data.localeCompare(b.data));
    let qtd = 0;
    let preco_medio = 0;
    let corretagem = 0;
    let proventos = 0;

    for (const op of sorted) {
      if (op.tipo === "compra") {
        const novo_custo = qtd * preco_medio + op.quantidade * op.preco_unitario;
        qtd += op.quantidade;
        preco_medio = qtd > 0 ? novo_custo / qtd : 0;
        corretagem += op.corretagem;
      } else if (op.tipo === "venda") {
        qtd -= op.quantidade;
        if (qtd <= 0) { qtd = 0; preco_medio = 0; }
        corretagem += op.corretagem;
      } else if (op.tipo === "dividendo" || op.tipo === "jcp") {
        proventos += op.quantidade * op.preco_unitario;
      }
    }

    if (qtd <= 0) continue;

    posicoes.push({
      ticker,
      operacoes: ops,
      quantidade_total: qtd,
      preco_medio,
      custo_total: qtd * preco_medio,
      corretagem_total: corretagem,
      proventos_recebidos: proventos,
    });
  }

  return posicoes.sort((a, b) => b.custo_total - a.custo_total);
}

// ─── Seed inicial ─────────────────────────────────────────────────────────────

/**
 * Pré-popula a carteira com os ativos do usuário na primeira abertura.
 * Usa uma flag de sentinela para não reexecutar após o primeiro seed.
 */
export function seedCarteiraInicial(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(KEY_SEEDED)) return;

  const ops = loadOps();
  if (ops.length === 0) {
    const mxef11: OperacaoCarteira = {
      id:             `seed-mxef11-${Date.now()}`,
      ticker:         "MXEF11",
      tipo:           "compra",
      quantidade:     21,
      preco_unitario: 9.73,
      data:           "2026-07-01",
      corretagem:     0,
      observacao:     "",
      timestamp:      new Date("2026-07-01").getTime(),
    };
    saveOps([mxef11]);
  }

  localStorage.setItem(KEY_SEEDED, "1");
}
