"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const KEY_STORE = "bnb_api_key";
const SEC_STORE = "bnb_api_secret";

const FT_PAIRS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT",
  "DOGEUSDT","ADAUSDT","TRXUSDT","AVAXUSDT","TONUSDT",
  "SHIBUSDT","LINKUSDT","DOTUSDT","LTCUSDT","ATOMUSDT",
  "NEARUSDT","MATICUSDT","PEPEUSDT","BCHUSDT","APTUSDT",
  "UNIUSDT","INJUSDT","AAVEUSDT","ARBUSDT","OPUSDT",
  "SUIUSDT","STXUSDT","IMXUSDT","FTMUSDT","GRTUSDT",
  "LDOUSDT","FILUSDT","MKRUSDT","SANDUSDT","MANAUSDT",
  "CRVUSDT","BLURUSDT","WLDUSDT","SEIUSDT","TIAUSDT",
  "WIFUSDT","JUPUSDT","BONKUSDT","FLOKIUSDT","NOTUSDT",
  "PYTHUSDT","APEUSDT","GMXUSDT","DYDXUSDT","GMTUSDT",
];

interface FuturesAccount {
  totalWalletBalance: number;
  totalMarginBalance: number;
  totalUnrealizedProfit: number;
  availableBalance: number;
  totalPositionInitialMargin: number;
  canTrade: boolean;
}

interface FuturesPosition {
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unrealizedProfit: number;
  liquidationPrice: number;
  leverage: number;
  marginType: string;
  positionSide: string;
  notional: number;
}

interface OpenOrder {
  orderId: number;
  symbol: string;
  side: string;
  type: string;
  origQty: string;
  price: string;
  stopPrice: string;
  status: string;
  time: number;
  positionSide: string;
  reduceOnly: boolean;
}

interface ExchangeInfo {
  pricePrecision: number;
  quantityPrecision: number;
  minQty: number;
  stepSize: number;
  tickSize: number;
  minNotional: number;
}

interface PriceTicker {
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPrice(n: number, prec = 2) {
  if (n === 0) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: prec, maximumFractionDigits: prec });
}

function pnlColor(v: number) {
  if (v > 0) return "#10b981";
  if (v < 0) return "#ef4444";
  return "#6b7280";
}

export default function TradeFuturosPage() {
  const [apiKey, setApiKey]     = useState("");
  const [apiSec, setApiSec]     = useState("");
  const [showCfg, setShowCfg]   = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [secInput, setSecInput] = useState("");

  const [account, setAccount]     = useState<FuturesAccount | null>(null);
  const [positions, setPositions] = useState<FuturesPosition[]>([]);
  const [orders, setOrders]       = useState<OpenOrder[]>([]);
  const [ticker, setTicker]       = useState<PriceTicker | null>(null);
  const [exInfo, setExInfo]       = useState<ExchangeInfo | null>(null);

  const [symbol, setSymbol]     = useState("BTCUSDT");
  const [side, setSide]         = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOType]   = useState<"MARKET" | "LIMIT">("MARKET");
  const [leverage, setLeverage] = useState(10);
  const [marginType, setMType]  = useState<"CROSSED" | "ISOLATED">("CROSSED");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice]       = useState("");
  const [usdtAmt, setUsdtAmt]   = useState("");

  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState<{ text: string; ok: boolean } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const headers = useCallback(() => ({
    "X-Binance-Key": apiKey,
    "X-Binance-Secret": apiSec,
  }), [apiKey, apiSec]);

  useEffect(() => {
    const k = localStorage.getItem(KEY_STORE) ?? "";
    const s = localStorage.getItem(SEC_STORE) ?? "";
    setApiKey(k); setApiSec(s);
    setKeyInput(k); setSecInput(s);
  }, []);

  const saveCfg = () => {
    localStorage.setItem(KEY_STORE, keyInput.trim());
    localStorage.setItem(SEC_STORE, secInput.trim());
    setApiKey(keyInput.trim()); setApiSec(secInput.trim());
    setShowCfg(false);
  };

  const notify = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 4000);
  };

  const fetchAccount = useCallback(async () => {
    if (!apiKey) return;
    try {
      const r = await fetch(`${API}/trade/futures/account`, { headers: headers() });
      if (r.ok) setAccount(await r.json());
    } catch {}
  }, [apiKey, headers]);

  const fetchPositions = useCallback(async () => {
    if (!apiKey) return;
    try {
      const r = await fetch(`${API}/trade/futures/positions`, { headers: headers() });
      if (r.ok) setPositions(await r.json());
    } catch {}
  }, [apiKey, headers]);

  const fetchOrders = useCallback(async () => {
    if (!apiKey) return;
    try {
      const r = await fetch(`${API}/trade/futures/open-orders`, { headers: headers() });
      if (r.ok) setOrders(await r.json());
    } catch {}
  }, [apiKey, headers]);

  const fetchTicker = useCallback(async () => {
    try {
      const r = await fetch(`${API}/trade/futures/ticker?symbol=${symbol}`);
      if (r.ok) setTicker(await r.json());
    } catch {}
  }, [symbol]);

  const fetchExInfo = useCallback(async () => {
    try {
      const r = await fetch(`${API}/trade/futures/exchange-info/${symbol}`);
      if (r.ok) setExInfo(await r.json());
    } catch {}
  }, [symbol]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchAccount(), fetchPositions(), fetchOrders(), fetchTicker(), fetchExInfo()]);
  }, [fetchAccount, fetchPositions, fetchOrders, fetchTicker, fetchExInfo]);

  useEffect(() => { fetchTicker(); fetchExInfo(); }, [symbol]);

  useEffect(() => {
    if (apiKey) refreshAll();
  }, [apiKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refreshAll, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshAll]);

  const setLev = async () => {
    if (!apiKey) return;
    try {
      const r = await fetch(`${API}/trade/futures/leverage`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, leverage }),
      });
      const d = await r.json();
      if (r.ok) notify(`Alavancagem ${symbol} → ${d.leverage}x`);
      else notify(d.detail ?? "Erro ao definir alavancagem", false);
    } catch (e) { notify(String(e), false); }
  };

  const setMarginT = async () => {
    if (!apiKey) return;
    try {
      const r = await fetch(`${API}/trade/futures/margin-type`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, marginType }),
      });
      const d = await r.json();
      if (r.ok) notify(d.msg ?? `Margem ${marginType} definida`);
      else notify(d.detail ?? "Erro", false);
    } catch (e) { notify(String(e), false); }
  };

  const placeOrder = async () => {
    if (!apiKey) { notify("Configure as API Keys primeiro", false); return; }
    if (!quantity && !usdtAmt) { notify("Informe quantidade ou valor em USDT", false); return; }

    setLoading(true);
    try {
      // Calcula quantity a partir de USDT se necessário
      let qty = quantity ? parseFloat(quantity) : 0;
      if (!qty && usdtAmt && ticker) {
        const px = parseFloat(ticker.lastPrice);
        const step = exInfo?.stepSize ?? 0.001;
        qty = Math.floor((parseFloat(usdtAmt) * leverage) / px / step) * step;
      }

      const body: Record<string, unknown> = {
        symbol,
        side,
        order_type: orderType,
        quantity: qty,
        position_side: "BOTH",
      };

      if (orderType === "LIMIT") {
        if (!price) { notify("Informe o preço para ordem LIMIT", false); setLoading(false); return; }
        body.price = parseFloat(price);
      }

      const r = await fetch(`${API}/trade/futures/order`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        notify(`Ordem ${side} ${symbol} executada! ID: ${d.orderId}`);
        setQuantity(""); setUsdtAmt(""); setPrice("");
        await refreshAll();
      } else {
        notify(d.detail ?? d.msg ?? "Erro ao enviar ordem", false);
      }
    } catch (e) { notify(String(e), false); }
    finally { setLoading(false); }
  };

  const closePosition = async (pos: FuturesPosition) => {
    setLoading(true);
    try {
      const closeSide = pos.positionAmt > 0 ? "SELL" : "BUY";
      const qty = Math.abs(pos.positionAmt);
      const r = await fetch(`${API}/trade/futures/order`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: pos.symbol,
          side: closeSide,
          order_type: "MARKET",
          quantity: qty,
          reduce_only: true,
          position_side: "BOTH",
        }),
      });
      const d = await r.json();
      if (r.ok) { notify(`Posição ${pos.symbol} fechada`); await refreshAll(); }
      else notify(d.detail ?? "Erro ao fechar posição", false);
    } catch (e) { notify(String(e), false); }
    finally { setLoading(false); }
  };

  const cancelOrder = async (sym: string, orderId: number) => {
    try {
      const r = await fetch(`${API}/trade/futures/order?symbol=${sym}&order_id=${orderId}`, {
        method: "DELETE", headers: headers(),
      });
      if (r.ok) { notify("Ordem cancelada"); await fetchOrders(); }
      else { const d = await r.json(); notify(d.detail ?? "Erro", false); }
    } catch (e) { notify(String(e), false); }
  };

  const hasKeys = !!apiKey && !!apiSec;
  const lastPrice = ticker ? parseFloat(ticker.lastPrice) : 0;
  const change24h = ticker ? parseFloat(ticker.priceChangePercent) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Trade Futuros</h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Opere contratos perpétuos USDT-M direto na sua conta Binance
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
              autoRefresh ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "border-[var(--border)] text-[var(--text-muted)]"
            }`}
          >
            <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />
            {autoRefresh ? "Live ON" : "Live OFF"}
          </button>
          <button onClick={refreshAll} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-white transition-colors">
            Atualizar
          </button>
          <button onClick={() => setShowCfg(v => !v)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-white transition-colors">
            ⚙️ API Keys
          </button>
        </div>
      </div>

      {/* Notificação */}
      {msg && (
        <div className={`px-4 py-2.5 rounded-xl text-sm font-medium ${msg.ok ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400" : "bg-red-500/15 border border-red-500/30 text-red-400"}`}>
          {msg.text}
        </div>
      )}

      {/* Config API Keys */}
      {showCfg && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Configurar API Keys Binance</h3>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            As chaves ficam apenas no seu navegador (localStorage). Nunca são enviadas ao servidor sem criptografia.
            Use chaves com permissão de Futures Trading habilitada.
          </p>
          <div className="flex flex-col gap-2 mb-3">
            <input
              value={keyInput} onChange={e => setKeyInput(e.target.value)}
              placeholder="API Key"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white font-mono"
            />
            <input
              value={secInput} onChange={e => setSecInput(e.target.value)}
              type="password" placeholder="API Secret"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={saveCfg} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
              Salvar
            </button>
            <button onClick={() => setShowCfg(false)} className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--text-muted)] transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Sem keys */}
      {!hasKeys && !showCfg && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <div className="text-2xl mb-2">🔑</div>
          <p className="text-sm text-amber-400 font-semibold mb-1">API Keys não configuradas</p>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Configure suas chaves Binance Futures para operar diretamente da plataforma.
          </p>
          <button onClick={() => setShowCfg(true)} className="px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-semibold">
            ⚙️ Configurar API Keys
          </button>
        </div>
      )}

      {hasKeys && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Coluna 1: Conta + Nova Ordem */}
          <div className="flex flex-col gap-4">

            {/* Saldo */}
            {account && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <h3 className="text-xs font-semibold text-white mb-3">💰 Conta Futures USDT-M</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Saldo Total", value: `$${fmt(account.totalWalletBalance)}` },
                    { label: "Disponível", value: `$${fmt(account.availableBalance)}` },
                    { label: "Margem", value: `$${fmt(account.totalMarginBalance)}` },
                    {
                      label: "PnL Não Realizado",
                      value: `${account.totalUnrealizedProfit >= 0 ? "+" : ""}$${fmt(account.totalUnrealizedProfit)}`,
                      color: pnlColor(account.totalUnrealizedProfit),
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl p-2.5" style={{ background: "var(--bg-input)" }}>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</div>
                      <div className="text-sm font-bold mt-0.5" style={{ color: color ?? "white" }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className={`mt-2 text-[10px] ${account.canTrade ? "text-emerald-400" : "text-red-400"}`}>
                  {account.canTrade ? "✓ Trading habilitado" : "✗ Trading desabilitado"}
                </div>
              </div>
            )}

            {/* Nova Ordem */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-xs font-semibold text-white mb-3">📋 Nova Ordem</h3>

              {/* Symbol */}
              <div className="mb-2">
                <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Par</label>
                <select
                  value={symbol} onChange={e => setSymbol(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white"
                >
                  {FT_PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Ticker */}
              {ticker && (
                <div className="flex items-center gap-2 mb-2 p-2 rounded-lg" style={{ background: "var(--bg-input)" }}>
                  <span className="text-white font-bold text-sm">${fmtPrice(lastPrice, exInfo?.pricePrecision ?? 2)}</span>
                  <span className="text-[11px]" style={{ color: pnlColor(change24h) }}>
                    {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
                  </span>
                </div>
              )}

              {/* Alavancagem + Margem */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Alavancagem</label>
                  <div className="flex gap-1">
                    <select
                      value={leverage} onChange={e => setLeverage(Number(e.target.value))}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white"
                    >
                      {[1,2,3,5,10,15,20,25,50,75,100,125].map(v => (
                        <option key={v} value={v}>{v}x</option>
                      ))}
                    </select>
                    <button onClick={setLev} className="px-2 py-1.5 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-400 text-[10px] hover:bg-blue-600/50 transition-colors">✓</button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Margem</label>
                  <div className="flex gap-1">
                    <select
                      value={marginType} onChange={e => setMType(e.target.value as "CROSSED" | "ISOLATED")}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white"
                    >
                      <option value="CROSSED">Cross</option>
                      <option value="ISOLATED">Isolada</option>
                    </select>
                    <button onClick={setMarginT} className="px-2 py-1.5 rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-400 text-[10px] hover:bg-purple-600/50 transition-colors">✓</button>
                  </div>
                </div>
              </div>

              {/* Side + Type */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Direção</label>
                  <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                    <button onClick={() => setSide("BUY")}
                      className="flex-1 py-1.5 text-xs font-bold transition-all"
                      style={{ background: side === "BUY" ? "rgba(16,185,129,0.25)" : "var(--bg-input)", color: side === "BUY" ? "#10b981" : "var(--text-muted)" }}>
                      LONG
                    </button>
                    <button onClick={() => setSide("SELL")}
                      className="flex-1 py-1.5 text-xs font-bold transition-all"
                      style={{ background: side === "SELL" ? "rgba(239,68,68,0.25)" : "var(--bg-input)", color: side === "SELL" ? "#ef4444" : "var(--text-muted)" }}>
                      SHORT
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Tipo</label>
                  <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
                    <button onClick={() => setOType("MARKET")}
                      className="flex-1 py-1.5 text-xs font-semibold transition-all"
                      style={{ background: orderType === "MARKET" ? "rgba(59,130,246,0.25)" : "var(--bg-input)", color: orderType === "MARKET" ? "#3b82f6" : "var(--text-muted)" }}>
                      Market
                    </button>
                    <button onClick={() => setOType("LIMIT")}
                      className="flex-1 py-1.5 text-xs font-semibold transition-all"
                      style={{ background: orderType === "LIMIT" ? "rgba(59,130,246,0.25)" : "var(--bg-input)", color: orderType === "LIMIT" ? "#3b82f6" : "var(--text-muted)" }}>
                      Limit
                    </button>
                  </div>
                </div>
              </div>

              {/* Price (LIMIT only) */}
              {orderType === "LIMIT" && (
                <div className="mb-2">
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Preço (USDT)</label>
                  <input
                    value={price} onChange={e => setPrice(e.target.value)}
                    placeholder={lastPrice ? String(lastPrice) : "0.00"}
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white"
                  />
                </div>
              )}

              {/* Quantidade */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>Qtd ({symbol.replace("USDT", "")})</label>
                  <input
                    value={quantity} onChange={e => { setQuantity(e.target.value); setUsdtAmt(""); }}
                    placeholder={`min ${exInfo?.minQty ?? 0.001}`}
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] mb-1 block" style={{ color: "var(--text-muted)" }}>ou Valor (USDT)</label>
                  <input
                    value={usdtAmt} onChange={e => { setUsdtAmt(e.target.value); setQuantity(""); }}
                    placeholder="100"
                    className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] text-xs text-white"
                  />
                </div>
              </div>

              {/* Previsão */}
              {(quantity || usdtAmt) && lastPrice > 0 && (
                <div className="mb-3 p-2 rounded-lg text-[10px]" style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
                  {quantity && (
                    <span>Valor ≈ <strong className="text-white">${fmt(parseFloat(quantity) * lastPrice / leverage)}</strong> margem ({leverage}x)</span>
                  )}
                  {usdtAmt && (
                    <span>Qtd ≈ <strong className="text-white">
                      {exInfo ? (Math.floor(parseFloat(usdtAmt) * leverage / lastPrice / exInfo.stepSize) * exInfo.stepSize).toFixed(
                        Math.max(0, -Math.floor(Math.log10(exInfo.stepSize)))
                      ) : "—"}
                    </strong> {symbol.replace("USDT", "")} ({leverage}x)</span>
                  )}
                </div>
              )}

              <button
                onClick={placeOrder}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50"
                style={{
                  background: side === "BUY"
                    ? "linear-gradient(135deg, #10b981, #059669)"
                    : "linear-gradient(135deg, #ef4444, #dc2626)",
                  color: "white",
                  boxShadow: `0 4px 15px ${side === "BUY" ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                }}
              >
                {loading ? "Enviando..." : `${side === "BUY" ? "🟢 LONG" : "🔴 SHORT"} ${symbol.replace("USDT", "")}`}
              </button>
            </div>
          </div>

          {/* Coluna 2-3: Posições + Ordens */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Posições abertas */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-xs font-semibold text-white mb-3">📊 Posições Abertas ({positions.length})</h3>
              {positions.length === 0 ? (
                <div className="py-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  Nenhuma posição aberta
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: "11px" }}>
                    <thead>
                      <tr style={{ color: "var(--text-muted)" }}>
                        {["Par","Lado","Qtd","Entrada","Mark","PnL","Liq.","Lev.","Fechar"].map(h => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(pos => {
                        const isLong = pos.positionAmt > 0;
                        const pnlPct = pos.entryPrice > 0
                          ? ((pos.markPrice - pos.entryPrice) / pos.entryPrice * 100 * (isLong ? 1 : -1) * pos.leverage)
                          : 0;
                        return (
                          <tr key={pos.symbol} className="border-t border-[var(--border)]">
                            <td className="px-2 py-2 font-semibold text-white">{pos.symbol.replace("USDT", "")}</td>
                            <td className="px-2 py-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                                background: isLong ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                                color: isLong ? "#10b981" : "#ef4444",
                              }}>{isLong ? "LONG" : "SHORT"}</span>
                            </td>
                            <td className="px-2 py-2 text-white">{Math.abs(pos.positionAmt)}</td>
                            <td className="px-2 py-2" style={{ color: "var(--text-secondary)" }}>${fmtPrice(pos.entryPrice, 2)}</td>
                            <td className="px-2 py-2 text-white">${fmtPrice(pos.markPrice, 2)}</td>
                            <td className="px-2 py-2" style={{ color: pnlColor(pos.unrealizedProfit) }}>
                              {pos.unrealizedProfit >= 0 ? "+" : ""}${fmt(pos.unrealizedProfit)}
                              <span className="ml-1 text-[10px]">({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</span>
                            </td>
                            <td className="px-2 py-2" style={{ color: "#f97316" }}>
                              {pos.liquidationPrice > 0 ? `$${fmtPrice(pos.liquidationPrice, 2)}` : "—"}
                            </td>
                            <td className="px-2 py-2 text-white">{pos.leverage}x</td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => closePosition(pos)}
                                disabled={loading}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold transition-colors disabled:opacity-50"
                                style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}
                              >
                                Fechar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Ordens abertas */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h3 className="text-xs font-semibold text-white mb-3">📝 Ordens Abertas ({orders.length})</h3>
              {orders.length === 0 ? (
                <div className="py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                  Nenhuma ordem aberta
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ fontSize: "11px" }}>
                    <thead>
                      <tr style={{ color: "var(--text-muted)" }}>
                        {["Par","Lado","Tipo","Qtd","Preço","Status","Cancelar"].map(h => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.orderId} className="border-t border-[var(--border)]">
                          <td className="px-2 py-2 font-semibold text-white">{o.symbol.replace("USDT", "")}</td>
                          <td className="px-2 py-2">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{
                              background: o.side === "BUY" ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                              color: o.side === "BUY" ? "#10b981" : "#ef4444",
                            }}>{o.side}</span>
                          </td>
                          <td className="px-2 py-2" style={{ color: "var(--text-secondary)" }}>{o.type}</td>
                          <td className="px-2 py-2 text-white">{o.origQty}</td>
                          <td className="px-2 py-2" style={{ color: "var(--text-secondary)" }}>
                            {parseFloat(o.price) > 0 ? `$${o.price}` : o.stopPrice ? `Stop $${o.stopPrice}` : "Market"}
                          </td>
                          <td className="px-2 py-2" style={{ color: "var(--text-muted)" }}>{o.status}</td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => cancelOrder(o.symbol, o.orderId)}
                              className="px-2 py-1 rounded-lg text-[10px] font-bold transition-colors"
                              style={{ background: "rgba(107,114,128,0.15)", color: "#6b7280", border: "1px solid rgba(107,114,128,0.3)" }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
